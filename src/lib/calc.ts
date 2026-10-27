import { q, one, getAjustes, getEscala } from './db';
import { r2, etiquetaSeccion } from './util';
import { asegurarComponentes, materializarImportadas } from './sea';

export type Est = { id: number; cedula: string; apellidos: string; nombre: string; subgrupo: string; encargado: string; telefono: string; fecha_nac: string | null };
export type Comp = { id: number; nombre: string; porcentaje: number; tipo: 'puntos' | 'indicadores' | 'asistencia'; clave: string | null };

// {S} = esquema del colegio activo. Todas las funciones reciben el id del docente (uid):
// una sección ajena no existe para él.

export const estudiantesDe = (seccionId: number) =>
  q<Est>(
    `SELECT e.id, e.cedula, e.apellidos, e.nombre, m.subgrupo, e.encargado, e.telefono, e.fecha_nac
     FROM {S}.matriculas m JOIN {S}.estudiantes e ON e.id = m.estudiante_id
     WHERE m.seccion_id = ? AND e.activo = 1 ORDER BY e.apellidos, e.nombre`,
    [seccionId],
  );

export async function seccion(uid: number, id: number) {
  if (!Number.isFinite(id) || id <= 0) return undefined;
  return one<any>(
    `SELECT s.*, a.nombre AS asignatura FROM {S}.secciones s LEFT JOIN general.asignaturas a ON a.id = s.asignatura_id
     WHERE s.id = ? AND s.usuario_id = ?`,
    [id, uid],
  );
}

/** ¿Ya existe otra sección con la misma sección, asignatura, año y subgrupo? (compara el nombre visible: "7-1" = nivel 7 + "1") */
export async function seccionDuplicada(uid: number, d: { nivel: string; nombre: string; subgrupo: string | null; asignatura_id: number | null; anio: number }, excluirId = 0) {
  const otras = await q<any>('SELECT nivel, nombre, subgrupo FROM {S}.secciones WHERE usuario_id=? AND anio=? AND asignatura_id IS NOT DISTINCT FROM ? AND id<>?',
    [uid, d.anio, d.asignatura_id, excluirId]);
  return otras.some((s) => etiquetaSeccion(s) === etiquetaSeccion(d));
}

/**
 * Lecciones impartidas (efectivas) de una sección en un periodo hasta la fecha indicada, inclusive:
 * la suma de las lecciones registradas cada día más la corrección manual del docente, si la hizo.
 */
export async function leccionesEfectivas(seccionId: number, per: { id: number; fecha_ini: string | null; fecha_fin: string | null } | null, hasta: string | null = null) {
  const fin = hasta && per?.fecha_fin && per.fecha_fin < hasta ? per.fecha_fin : (hasta ?? per?.fecha_fin ?? null);
  const desde = per?.fecha_ini ?? null;
  const suma = await one<any>(`SELECT COALESCE(SUM(cantidad), 0) AS n FROM {S}.lecciones_dia
    WHERE seccion_id = ? AND (?::date IS NULL OR fecha >= ?::date) AND (?::date IS NULL OR fecha <= ?::date)`, [seccionId, desde, desde, fin, fin]);
  const fila = per ? await one<any>('SELECT ajuste FROM {S}.lecciones WHERE seccion_id = ? AND periodo_id = ?', [seccionId, per.id]) : undefined;
  const calculado = Number(suma?.n ?? 0), ajuste = Number(fila?.ajuste ?? 0);
  return { calculado, ajuste, efectivas: Math.max(0, calculado + ajuste), hasta: fin };
}

export const periodosDe = (uid: number) =>
  q<any>('SELECT * FROM {S}.periodos WHERE usuario_id=? ORDER BY numero', [uid]);

/** Ausencias por estudiante en un rango de fechas (null = sin límite) */
export async function ausencias(uid: number, seccionId: number, desde: string | null, hasta: string | null) {
  const aj = await getAjustes(uid);
  const filas = await q<any>(
    `SELECT estudiante_id, tipo, SUM(lecciones) AS lec FROM {S}.asistencia
     WHERE seccion_id = ? AND (?::date IS NULL OR fecha >= ?::date) AND (?::date IS NULL OR fecha <= ?::date)
     GROUP BY estudiante_id, tipo`,
    [seccionId, desde, desde, hasta, hasta],
  );
  const m = new Map<number, { AI: number; AJ: number; TI: number; TJ: number; equivalentes: number }>();
  for (const f of filas) {
    const x = m.get(f.estudiante_id) ?? { AI: 0, AJ: 0, TI: 0, TJ: 0, equivalentes: 0 };
    (x as any)[f.tipo] = Number(f.lec);
    m.set(f.estudiante_id, x);
  }
  const porAus = Math.max(1, aj.tardias_por_ausencia || 2);
  for (const x of m.values()) x.equivalentes = x.AI + Math.floor(x.TI / porAus);
  return m;
}

export function porcentajeAsistencia(pctAus: number, esc: { desde: number; hasta: number; porcentaje: number }[]) {
  const t = esc.find((e) => pctAus >= e.desde && pctAus < e.hasta);
  return t ? t.porcentaje : 0;
}

/**
 * Indicadores (estilo Moodle): cada indicador calificado vale lo mismo.
 * 1, 2 o 3 cuentan; "no se califica" (NULL) no cuenta; "no entregó" (0) cuenta como 0
 * o no cuenta, según el ajuste del docente.
 * Obtenido = promedio(nivel / 3) × valor de la evaluación.
 */
export function pctIndicadores(niveles: (number | null)[], valor: number, neCuentaCero: boolean) {
  const cuentan = niveles.filter((n): n is number => n !== null && n !== undefined && (n > 0 || neCuentaCero));
  if (!cuentan.length) return { pct: 0, calificados: 0 };
  return { pct: (cuentan.reduce((s, n) => s + n, 0) / (3 * cuentan.length)) * valor, calificados: cuentan.length };
}

export async function calcularPeriodo(uid: number, seccionId: number, periodoId: number) {
  const sec = await seccion(uid, seccionId);
  if (!sec) return null;
  const per = await one<any>('SELECT * FROM {S}.periodos WHERE id = ? AND usuario_id = ?', [periodoId, uid]);
  if (!per) return null;
  const aj = await getAjustes(uid);
  const notaApb = Number(sec.nota_aprobatoria ?? aj.nota_aprobatoria);
  await asegurarComponentes(uid, sec.nivel);
  await materializarImportadas(uid, sec, periodoId);
  const comps = await q<Comp>(
    'SELECT id, nombre, porcentaje, tipo, clave FROM {S}.componentes WHERE usuario_id = ? AND nivel = ? ORDER BY orden, id', [uid, sec.nivel]);
  // Valores importados (ReDDi / SEA): reemplazan lo calculado para ese componente
  const imp = await q<any>('SELECT estudiante_id, clave, valor FROM {S}.notas_importadas WHERE seccion_id = ? AND periodo_id = ?', [seccionId, periodoId]);
  const impMap = new Map(imp.map((x) => [`${x.estudiante_id}:${x.clave}`, Number(x.valor)]));
  const ests = await estudiantesDe(seccionId);
  const evals = await q<any>('SELECT * FROM {S}.evaluaciones WHERE seccion_id = ? AND periodo_id = ? ORDER BY fecha, id', [seccionId, periodoId]);
  const ids = evals.map((e) => e.id);
  const notas = ids.length ? await q<any>('SELECT * FROM {S}.notas WHERE evaluacion_id = ANY(?)', [ids]) : [];
  const vals = ids.length ? await q<any>('SELECT * FROM {S}.valoraciones WHERE evaluacion_id = ANY(?)', [ids]) : [];
  const lecciones = (await leccionesEfectivas(seccionId, per)).efectivas;
  const aus = await ausencias(uid, seccionId, per.fecha_ini, per.fecha_fin);
  const esc = await getEscala(uid);

  const notaMap = new Map(notas.map((n) => [`${n.evaluacion_id}:${n.estudiante_id}`, n]));
  const valMap = new Map<string, (number | null)[]>();
  for (const v of vals) {
    const k = `${v.evaluacion_id}:${v.estudiante_id}`;
    (valMap.get(k) ?? valMap.set(k, []).get(k)!).push(v.nivel);
  }

  const filas = ests.map((e) => {
    const porComp: Record<number, number> = {};
    const detalle: Record<number, number> = {};
    const noEntrego: number[] = [];
    const importado: Record<number, boolean> = {};
    const calificada: Record<number, boolean> = {};
    const nota100: Record<number, number> = {}; // nota de cada evaluación en escala de 100, sin redondear
    let pctAus = 0;
    for (const c of comps) {
      let v = 0;
      const vi = c.clave ? impMap.get(`${e.id}:${c.clave}`) : undefined;
      if (vi !== undefined) {
        v = vi;
        importado[c.id] = true;
      } else if (c.tipo === 'asistencia') {
        const a = aus.get(e.id);
        pctAus = lecciones > 0 && a ? (a.equivalentes / lecciones) * 100 : 0;
        v = (porcentajeAsistencia(pctAus, esc) / 100) * c.porcentaje;
      } else {
        for (const ev of evals.filter((x) => x.componente_id === c.id)) {
          let p = 0;
          const n = notaMap.get(`${ev.id}:${e.id}`);
          const tipoEv = ev.tipo ?? c.tipo; // una evaluación puede calificarse por puntos aunque el componente sea por indicadores
          if (tipoEv === 'indicadores') {
            const niveles = valMap.get(`${ev.id}:${e.id}`) ?? [];
            p = pctIndicadores(niveles, ev.porcentaje, aj.ne_cuenta_cero).pct;
            calificada[ev.id] = niveles.some((x) => x !== null && x !== undefined) || !!n?.no_entrego;
            if (niveles.some((x) => x === 0) || n?.no_entrego) noEntrego.push(ev.id);
          } else {
            if (n?.no_entrego) noEntrego.push(ev.id);
            calificada[ev.id] = !!n && (n.puntos !== null || !!n.no_entrego);
            p = ev.puntos_total > 0 && n && n.puntos !== null && !n.no_entrego ? (Number(n.puntos) / ev.puntos_total) * ev.porcentaje : 0;
          }
          detalle[ev.id] = r2(p);
          nota100[ev.id] = tipoEv === 'indicadores'
            ? (ev.porcentaje > 0 ? (p / ev.porcentaje) * 100 : 0)
            : (ev.puntos_total > 0 && n && n.puntos !== null && !n.no_entrego ? (Number(n.puntos) / ev.puntos_total) * 100 : 0);
          v += p;
        }
        v = Math.min(v, c.porcentaje);
      }
      porComp[c.id] = r2(v);
    }
    const total = r2(Object.values(porComp).reduce((s, n) => s + n, 0));
    return { est: e, porComp, detalle, noEntrego, importado, calificada, nota100, total, pctAus: r2(pctAus), condicion: total >= notaApb ? 'Aprobado' : 'Aplazado' };
  });
  return { sec, per, comps, evals, filas, notaApb, lecciones };
}

export async function calcularAnual(uid: number, seccionId: number) {
  const sec = await seccion(uid, seccionId);
  if (!sec) return null;
  const periodos = await periodosDe(uid);
  const res = [] as any[];
  for (const p of periodos) res.push(await calcularPeriodo(uid, seccionId, p.id));
  const aj = await getAjustes(uid);
  const notaApb = Number(sec.nota_aprobatoria ?? aj.nota_aprobatoria);
  const ests = await estudiantesDe(seccionId);
  const conv = new Map((await q<any>('SELECT * FROM {S}.convocatorias WHERE seccion_id = ?', [seccionId])).map((c) => [c.estudiante_id, c]));
  const filas = ests.map((e) => {
    const porPer = periodos.map((p, i) => res[i]?.filas.find((f: any) => f.est.id === e.id)?.total ?? 0);
    const ponderados = porPer.map((n, i) => r2(n * (Number(periodos[i].ponderado) / 100)));
    const anual = r2(ponderados.reduce((s, n) => s + n, 0));
    const c = conv.get(e.id);
    let condicion = anual >= notaApb ? 'Aprobado' : 'Aplazado';
    if (condicion === 'Aplazado' && c) {
      if ((c.nota1 ?? -1) >= notaApb || (c.nota2 ?? -1) >= notaApb) condicion = 'Aprobado (conv.)';
      else if (c.nota2 !== null) condicion = 'Reprobado';
    }
    return { est: e, porPer, ponderados, anual, conv: c, condicion };
  });
  return { sec, periodos, filas, notaApb, porPeriodo: res };
}
