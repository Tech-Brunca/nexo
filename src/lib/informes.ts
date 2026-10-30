import { q, one, getAjustes, getEscala } from './db';
import { seccion, estudiantesDe, ausencias, calcularPeriodo, calcularAnual, porcentajeAsistencia, periodosDe, leccionesEfectivas } from './calc';
import { r2, fmt, TIPOS_AUSENCIA, hoy, etiquetaSeccion, sqlEtiquetaSeccion } from './util';

export type Celda = string | number | null;
export type Bloque = { titulo?: string; meta?: [string, string][]; columnas: string[]; num?: number[]; filas: Celda[][]; pie?: [string, string][]; nuevaPagina?: boolean };
export type Informe = { titulo: string; meta: [string, string][]; bloques: Bloque[]; nota?: string; firma?: boolean; archivo: string };

export const CATALOGO: { tipo: string; titulo: string; descripcion: string; pide: string[] }[] = [
  { tipo: 'lista', titulo: 'Lista de estudiantes', descripcion: 'Con columna de firma, para reuniones o entregas.', pide: ['seccion', 'subgrupo', 'asunto'] },
  { tipo: 'asistencia-resumen', titulo: 'Resumen de asistencia', descripcion: 'AJ, AI, TJ, TI, % de ausentismo y valor de asistencia por estudiante.', pide: ['seccion', 'subgrupo', 'periodo', 'fechas'] },
  { tipo: 'asistencia-detalle', titulo: 'Detalle de asistencia', descripcion: 'Fecha, tipo, lecciones y observaciones; de un estudiante o de todo el grupo.', pide: ['seccion', 'estudiante', 'periodo', 'fechas'] },
  { tipo: 'alerta', titulo: 'Alerta de ausentismo', descripcion: 'Estudiantes con ausencias injustificadas recientes, con firma de recibido.', pide: ['dias'] },
  { tipo: 'calificaciones', titulo: 'Calificaciones del grupo', descripcion: 'Nota por componente, nota final y condición del periodo.', pide: ['seccion', 'subgrupo', 'periodo'] },
  { tipo: 'calificaciones-individual', titulo: 'Calificaciones por estudiante', descripcion: 'Una hoja por estudiante con sus componentes (para entregar al hogar).', pide: ['seccion', 'estudiante', 'periodo'] },
  { tipo: 'indicadores', titulo: 'Indicadores calificados', descripcion: 'Nivel obtenido en cada indicador de una evaluación, por estudiante.', pide: ['evaluacion'] },
  { tipo: 'anual', titulo: 'Informe anual de calificaciones', descripcion: 'Nota y ponderado de cada periodo, promedio y condición.', pide: ['seccion', 'subgrupo'] },
  { tipo: 'eximidos', titulo: 'Eximidos del II periodo', descripcion: 'Quienes no hacen la segunda prueba: promedio del I periodo de 90 o más y cada componente del II periodo de 90 o más, sin contar la segunda prueba.', pide: ['seccion', 'subgrupo', 'examen', 'umbral'] },
  { tipo: 'convocatorias', titulo: 'Acta de aplazados y convocatorias', descripcion: 'Estudiantes aplazados, convocatorias I y II y condición final; por sección o por nivel.', pide: ['seccion_o_nivel'] },
];

type Ctx = { uid: number; docente: string; colegio: { nombre: string; direccion_regional: string; circuito: string; codigo: string } };
type P = URLSearchParams;
const NIVEL_TXT: Record<string, string> = { '0': 'No entregó', '1': 'Inicial (1)', '2': 'Intermedio (2)', '3': 'Avanzado (3)' };

function metaSeccion(sec: any, docente: string, extra: [string, string][] = []): [string, string][] {
  return [['Docente', docente], ['Asignatura', sec.asignatura ?? '—'], ['Sección', `${etiquetaSeccion(sec)}`], ...extra];
}
async function rangoFechas(uid: number, p: P) {
  const desde = p.get('desde') || null, hasta = p.get('hasta') || null;
  if (desde || hasta) return { per: null, desde, hasta, etiqueta: `Del ${desde ?? '…'} al ${hasta ?? '…'}` };
  const per = p.get('periodo') ? await one<any>('SELECT * FROM {S}.periodos WHERE id=? AND usuario_id=?', [Number(p.get('periodo')), uid]) : null;
  return { per, desde: per?.fecha_ini ?? null, hasta: per?.fecha_fin ?? null, etiqueta: per?.nombre ?? 'Todo el curso' };
}
const r2r = (n: number) => Math.round(n * 100) / 100;
const filtroSub = (ests: any[], p: P) => (p.get('subgrupo') ? ests.filter((e) => e.subgrupo === p.get('subgrupo')) : ests);

export async function generar(tipo: string, c: Ctx, p: P): Promise<Informe | string> {
  const sec = p.get('seccion') ? await seccion(c.uid, Number(p.get('seccion'))) : null;
  const sub = p.get('subgrupo') ?? '';
  const subMeta: [string, string][] = sub ? [['Subgrupo', sub]] : [];

  if (tipo === 'lista') {
    if (!sec) return 'Elija una sección.';
    const ests = filtroSub(await estudiantesDe(sec.id), p);
    return { titulo: 'Lista de Estudiantes', archivo: `lista-${etiquetaSeccion(sec)}`, firma: false,
      meta: [...metaSeccion(sec, c.docente, subMeta), ['Asunto', p.get('asunto') || '________________________'], ['Fecha', p.get('fecha') || '____/____/______']],
      bloques: [{ columnas: ['#', 'Estudiante', 'Cédula', 'Firma'], filas: ests.map((e, i) => [i + 1, `${e.apellidos} ${e.nombre}`, e.cedula, '']) }] };
  }

  if (tipo === 'asistencia-resumen') {
    if (!sec) return 'Elija una sección.';
    const r = await rangoFechas(c.uid, p);
    const ests = filtroSub(await estudiantesDe(sec.id), p);
    const aus = await ausencias(c.uid, sec.id, r.desde, r.hasta);
    const lec = r.per ? (await leccionesEfectivas(sec.id, r.per)).efectivas : 0;
    const esc = await getEscala(c.uid);
    const conPct = lec > 0;
    return { titulo: 'Resumen de Asistencia', archivo: `asistencia-resumen-${etiquetaSeccion(sec)}`, firma: false,
      meta: [...metaSeccion(sec, c.docente, subMeta), ['Periodo', r.etiqueta], ...(lec ? [['Lecciones efectivas', String(lec)] as [string, string]] : [])],
      nota: conPct ? '% Asistencia = porcentaje del valor del componente de asistencia según la escala configurada.' : 'Para calcular porcentajes elija un periodo con lecciones efectivas registradas.',
      bloques: [{ columnas: ['#', 'Estudiante', 'A.J', 'A.I', 'T.J', 'T.I', ...(conPct ? ['% Ausentismo', '% Asistencia'] : [])], num: [2, 3, 4, 5, 6, 7],
        filas: ests.map((e, i) => {
          const a = aus.get(e.id) ?? { AI: 0, AJ: 0, TI: 0, TJ: 0, equivalentes: 0 };
          const pct = conPct ? (a.equivalentes / lec) * 100 : 0;
          return [i + 1, `${e.apellidos} ${e.nombre}`, a.AJ, a.AI, a.TJ, a.TI, ...(conPct ? [r2(pct), porcentajeAsistencia(pct, esc)] : [])];
        }) }] };
  }

  if (tipo === 'asistencia-detalle') {
    if (!sec) return 'Elija una sección.';
    const r = await rangoFechas(c.uid, p);
    let ests = await estudiantesDe(sec.id);
    if (p.get('estudiante')) ests = ests.filter((e) => e.id === Number(p.get('estudiante')));
    const regs = await q<any>(`SELECT * FROM {S}.asistencia WHERE seccion_id=? AND (?::date IS NULL OR fecha>=?::date) AND (?::date IS NULL OR fecha<=?::date) ORDER BY fecha`,
      [sec.id, r.desde, r.desde, r.hasta, r.hasta]);
    const lec = r.per ? (await leccionesEfectivas(sec.id, r.per)).efectivas : 0;
    const aj = await getAjustes(c.uid);
    const bloques: Bloque[] = ests.map((e, i) => {
      const mios = regs.filter((x) => x.estudiante_id === e.id);
      const t = { AI: 0, AJ: 0, TI: 0, TJ: 0 } as Record<string, number>;
      for (const x of mios) t[x.tipo] += x.lecciones;
      const eq = t.AI + Math.floor(t.TI / Math.max(1, aj.tardias_por_ausencia));
      return { titulo: `${e.apellidos} ${e.nombre}`, nuevaPagina: ests.length > 1 && i > 0 && mios.length > 12,
        columnas: ['Fecha', 'Tipo de asistencia', 'Lecciones', 'Observaciones'], num: [2],
        filas: mios.length ? mios.map((x) => [x.fecha, TIPOS_AUSENCIA[x.tipo], x.lecciones, x.observacion]) : [['—', 'Sin ausencias ni tardías', '', '']],
        pie: [['Ausencias injustificadas', String(t.AI)], ['Ausencias justificadas', String(t.AJ)], ['Tardías injustificadas', String(t.TI)], ['Tardías justificadas', String(t.TJ)],
          ...(lec ? [['Ausentismo', `${r2((eq / lec) * 100)}%`] as [string, string]] : [])] };
    });
    return { titulo: 'Informe Detalle de Asistencia', archivo: `asistencia-detalle-${etiquetaSeccion(sec)}`, firma: true,
      meta: [...metaSeccion(sec, c.docente), ['Periodo', r.etiqueta]], bloques };
  }

  if (tipo === 'alerta') {
    const aj = await getAjustes(c.uid);
    const dias = Number(p.get('dias') || aj.alerta_dias), min = Number(p.get('min') || aj.alerta_ausencias);
    const filas = await q<any>(`SELECT e.apellidos, e.nombre, e.encargado, e.telefono, s.nivel, ${sqlEtiquetaSeccion()} AS seccion, SUM(a.lecciones) AS lecciones, COUNT(*) AS dias
      FROM {S}.asistencia a JOIN {S}.estudiantes e ON e.id=a.estudiante_id JOIN {S}.secciones s ON s.id=a.seccion_id
      WHERE s.usuario_id=? AND a.tipo='AI' AND a.fecha BETWEEN ?::date - ?::int AND ?::date
      GROUP BY e.id, s.id HAVING SUM(a.lecciones) >= ? ORDER BY lecciones DESC, e.apellidos`, [c.uid, hoy(), dias, hoy(), min]);
    return { titulo: 'Informe Alerta Ausentismo', archivo: 'alerta-ausentismo', firma: true,
      meta: [['Docente', c.docente], ['Criterio', `${min} o más lecciones ausente (injustificadas) en los últimos ${dias} días`]],
      bloques: [{ columnas: ['#', 'Estudiante', 'Sección', 'Días', 'Lecciones ausente', 'Encargado(a)', 'Teléfono'], num: [3, 4],
        filas: filas.map((f, i) => [i + 1, `${f.apellidos} ${f.nombre}`, f.seccion, f.dias, f.lecciones, f.encargado, f.telefono]) }] };
  }

  if (tipo === 'calificaciones' || tipo === 'calificaciones-individual') {
    if (!sec) return 'Elija una sección.';
    const pers = await periodosDe(c.uid);
    const perId = Number(p.get('periodo')) || pers[0]?.id;
    const r = await calcularPeriodo(c.uid, sec.id, perId);
    if (!r) return 'Elija un periodo.';
    let filas = filtroSub(r.filas.map((f) => ({ ...f, subgrupo: f.est.subgrupo })), p);
    if (tipo === 'calificaciones') {
      return { titulo: 'Informe Detalle de Calificaciones', archivo: `calificaciones-${etiquetaSeccion(sec)}-p${r.per.numero}`, firma: true,
        meta: [...metaSeccion(sec, c.docente, subMeta), ['Periodo', r.per.nombre], ['Ponderado del periodo', `${r.per.ponderado}%`]],
        bloques: [{ columnas: ['#', 'Nombre del estudiante', 'Cédula', ...r.comps.map((x) => `${x.nombre} (${x.porcentaje}%)`), 'Nota final', 'Ponderado', 'Condición'],
          num: r.comps.map((_, i) => i + 3).concat([r.comps.length + 3, r.comps.length + 4]),
          filas: filas.map((f, i) => [i + 1, `${f.est.apellidos} ${f.est.nombre}`, f.est.cedula, ...r.comps.map((x) => f.porComp[x.id]), f.total,
            r2(f.total * Number(r.per.ponderado) / 100), f.condicion]) }] };
    }
    if (p.get('estudiante')) filas = filas.filter((f) => f.est.id === Number(p.get('estudiante')));
    return { titulo: 'Informe de Calificaciones por Componentes', archivo: `calificaciones-individual-${etiquetaSeccion(sec)}-p${r.per.numero}`, firma: true,
      meta: [...metaSeccion(sec, c.docente), ['Periodo', r.per.nombre]],
      bloques: filas.map((f, i) => ({ titulo: `${f.est.apellidos} ${f.est.nombre} · ${f.est.cedula}`, nuevaPagina: i > 0,
        columnas: ['Componente', 'Porcentaje', 'Obtenido'], num: [1, 2],
        filas: r.comps.map((x) => [x.nombre, x.porcentaje, f.porComp[x.id]]),
        pie: [['Nota final', String(f.total)], ['Ponderado', `${r2(f.total * Number(r.per.ponderado) / 100)} (${r.per.ponderado}%)`], ['Condición', f.condicion]] })) };
  }

  if (tipo === 'indicadores') {
    const ev = await one<any>(`SELECT e.*, s.id AS sid, p.nombre AS periodo FROM {S}.evaluaciones e JOIN {S}.secciones s ON s.id=e.seccion_id
      JOIN {S}.periodos p ON p.id=e.periodo_id WHERE e.id=? AND s.usuario_id=?`, [Number(p.get('evaluacion')), c.uid]);
    if (!ev) return 'Elija una evaluación por indicadores.';
    const s2 = await seccion(c.uid, ev.sid);
    const inds = await q<any>(`SELECT i.* FROM {S}.evaluacion_indicadores ei JOIN general.indicadores i ON i.id=ei.indicador_id WHERE ei.evaluacion_id=? ORDER BY i.id`, [ev.id]);
    const vals = new Map((await q<any>('SELECT * FROM {S}.valoraciones WHERE evaluacion_id=?', [ev.id])).map((v) => [`${v.estudiante_id}_${v.indicador_id}`, v.nivel]));
    const obs = new Map((await q<any>('SELECT * FROM {S}.notas WHERE evaluacion_id=?', [ev.id])).map((n) => [n.estudiante_id, n.observacion]));
    const r = await calcularPeriodo(c.uid, ev.sid, ev.periodo_id);
    const ests = filtroSub(await estudiantesDe(ev.sid), p);
    return { titulo: 'Informe de Indicadores Calificados', archivo: `indicadores-${ev.nombre}`, firma: false,
      meta: [...metaSeccion(s2, c.docente, subMeta), ['Periodo', ev.periodo], ['Evaluación', `${ev.nombre} (valor ${ev.porcentaje}%)`]],
      bloques: ests.map((e) => ({ titulo: `${e.apellidos} ${e.nombre}`,
        columnas: ['Indicador', 'Calificación'],
        filas: inds.map((i) => { const v = vals.get(`${e.id}_${i.id}`); return [i.nombre, v === null || v === undefined ? 'No se califica' : NIVEL_TXT[String(v)]]; }),
        pie: [['Porcentaje obtenido', String(r?.filas.find((f) => f.est.id === e.id)?.detalle[ev.id] ?? 0)], ['Valor', `${ev.porcentaje}%`],
          ...(obs.get(e.id) ? [['Observaciones', obs.get(e.id)] as [string, string]] : [])] })) };
  }

  if (tipo === 'anual') {
    if (!sec) return 'Elija una sección.';
    const r = (await calcularAnual(c.uid, sec.id))!;
    const filas = filtroSub(r.filas.map((f) => ({ ...f, subgrupo: f.est.subgrupo })), p);
    return { titulo: 'Informe Anual de Calificaciones', archivo: `anual-${etiquetaSeccion(sec)}`, firma: true,
      meta: [...metaSeccion(sec, c.docente, subMeta), ['Nota mínima', String(r.notaApb)]],
      bloques: [{ columnas: ['#', 'Estudiante', ...r.periodos.flatMap((x: any) => [`${x.nombre} nota`, `Ponderado (${x.ponderado}%)`]), 'Promedio', 'Condición'],
        num: r.periodos.flatMap((_: any, i: number) => [2 + 2 * i, 3 + 2 * i]).concat([2 + 2 * r.periodos.length]),
        filas: filas.map((f, i) => [i + 1, `${f.est.apellidos} ${f.est.nombre}`, ...f.porPer.flatMap((n: number, k: number) => [n, f.ponderados[k]]), f.anual, f.condicion]) }] };
  }

  if (tipo === 'eximidos') {
    if (!sec) return 'Elija una sección.';
    const pers = await periodosDe(c.uid);
    const p1 = pers.find((x) => x.numero === 1), p2 = pers.find((x) => x.numero === 2);
    if (!p1 || !p2) return 'Se necesitan el I y el II periodo (configúrelos en Periodos).';
    const umbral = Number(p.get('umbral') || 90);
    const r1 = (await calcularPeriodo(c.uid, sec.id, p1.id))!, r2 = (await calcularPeriodo(c.uid, sec.id, p2.id))!;
    // La segunda prueba del II periodo es la que se exime: no cuenta. Se puede elegir en el formulario;
    // si no, es la última prueba del periodo (solo cuando hay dos o más).
    const compPrueba = r2.comps.find((x) => x.clave === 'prueba');
    const pruebas = r2.evals.filter((ev) => ev.componente_id === compPrueba?.id)
      // la del SEA es la I prueba; la creada sola al importar ('auto') es la II
      .sort((x, y) => (x.origen === 'sea' ? 0 : 1) - (y.origen === 'sea' ? 0 : 1) || (x.origen === 'auto' ? 1 : 0) - (y.origen === 'auto' ? 1 : 0)
        || String(x.fecha ?? '').localeCompare(String(y.fecha ?? '')) || x.id - y.id);
    const elegida = Number(p.get('excluir') || 0);
    const excluida = elegida ? pruebas.find((ev) => ev.id === elegida) ?? null : pruebas.length >= 2 ? pruebas[pruebas.length - 1] : null;
    // Cuentan las evaluaciones ya aplicadas (con al menos una nota en el grupo), menos la prueba eximida
    const aplicadas = r2.evals.filter((ev) => ev.id !== excluida?.id && r2.filas.some((f) => f.calificada[ev.id]));
    const n100 = (v: number, de: number) => (de > 0 ? r2r((v / de) * 100) : 0);
    const permitidos = new Set(filtroSub(r2.filas.map((f) => ({ ...f.est, fila: f })), p).map((e: any) => e.id));
    const filas = r2.filas.filter((f) => permitidos.has(f.est.id)).map((f) => {
      const motivos: string[] = [];
      const t1 = r1.filas.find((x) => x.est.id === f.est.id)?.total ?? 0;
      // I periodo: solo el promedio final, sin importar cada componente
      if (t1 < umbral) motivos.push(`${p1.nombre}: ${fmt(t1)}`);
      // II periodo: cada componente, en escala de 100, sobre lo evaluado hasta ahora
      const porComp: (number | null)[] = r2.comps.map((comp) => {
        if (f.importado[comp.id]) return n100(f.porComp[comp.id], comp.porcentaje);
        if (comp.tipo === 'asistencia') return r2.lecciones > 0 ? n100(f.porComp[comp.id], comp.porcentaje) : null;
        const evs = aplicadas.filter((ev) => ev.componente_id === comp.id);
        const valor = evs.reduce((sm, ev) => sm + Number(ev.porcentaje), 0);
        if (!evs.length || valor <= 0) return null;
        for (const ev of evs) if (!f.calificada[ev.id]) motivos.push(`${ev.nombre}: sin nota`);
        const obtenido = evs.reduce((sm, ev) => sm + ((f.nota100[ev.id] ?? 0) * Number(ev.porcentaje)) / 100, 0);
        return n100(obtenido, valor);
      });
      r2.comps.forEach((comp, i) => { const v = porComp[i]; if (v !== null && v < umbral) motivos.push(`${comp.nombre}: ${fmt(v)}`); });
      const sinNotas = porComp.every((v) => v === null);
      const exime = !sinNotas && motivos.length === 0;
      return { f, t1, porComp, exime, obs: sinNotas ? `Aún no hay notas del ${p2.nombre}` : motivos.join('; ') };
    });
    const lista = p.get('solo') ? filas.filter((x) => x.exime) : filas;
    const n = filas.filter((x) => x.exime).length;
    return { titulo: 'Estudiantes eximidos', archivo: `eximidos-${etiquetaSeccion(sec)}`, firma: true,
      meta: [...metaSeccion(sec, c.docente, subMeta),
        ['Requisito', `Promedio del ${p1.nombre} ≥ ${umbral} y cada componente del ${p2.nombre} ≥ ${umbral}`],
        ['Prueba que se exime', excluida ? excluida.nombre : 'ninguna (aún no hay segunda prueba)'], ['Eximidos', `${n} de ${filas.length}`]],
      nota: `Cada componente del ${p2.nombre} se calcula en escala de 100 con las evaluaciones ya aplicadas (${aplicadas.length}), sin contar la prueba que se exime. «—» = componente aún sin evaluar.`,
      bloques: [{ columnas: ['#', 'Estudiante', 'Cédula', `Promedio ${p1.nombre}`, ...r2.comps.map((x) => x.nombre), 'Condición', 'No cumple en'],
        num: [3, ...r2.comps.map((_, i) => 4 + i)],
        filas: lista.map((x, i) => [i + 1, `${x.f.est.apellidos} ${x.f.est.nombre}`, x.f.est.cedula, x.t1, ...x.porComp.map((v) => v ?? '—'),
          x.exime ? 'Eximido' : 'No eximido', x.exime ? '' : x.obs]) }] };
  }

  if (tipo === 'convocatorias') {
    const nivel = p.get('nivel');
    const secciones = nivel
      ? await q<any>('SELECT id FROM {S}.secciones WHERE usuario_id=? AND nivel=? ORDER BY nombre', [c.uid, nivel])
      : sec ? [{ id: sec.id }] : [];
    if (!secciones.length) return 'Elija una sección o un nivel.';
    const filas: Celda[][] = [];
    let primera: any = null;
    for (const s of secciones) {
      const r = (await calcularAnual(c.uid, s.id))!;
      primera ??= r.sec;
      for (const f of r.filas.filter((x) => x.anual < r.notaApb))
        filas.push([`${f.est.apellidos} ${f.est.nombre}`, f.est.cedula, ...(nivel ? [`${etiquetaSeccion(r.sec)}`] : []), f.anual, 'Aplazado',
          f.conv?.nota1 ?? '', f.conv?.nota2 ?? '', f.condicion]);
    }
    return { titulo: 'Lista de Estudiantes Aplazados', archivo: nivel ? `aplazados-nivel-${nivel}` : `aplazados-${etiquetaSeccion(primera)}`, firma: true,
      meta: nivel ? [['Docente', c.docente], ['Asignatura', primera?.asignatura ?? '—'], ['Nivel', nivel]] : metaSeccion(primera, c.docente),
      nota: 'Un valor de -1 en convocatorias indica que el estudiante no se presentó.',
      bloques: [{ columnas: ['Estudiante', 'Cédula', ...(nivel ? ['Grupo'] : []), 'Prom.', 'Condición', 'Conv. I', 'Conv. II', 'Condición final'],
        num: nivel ? [3, 5, 6] : [2, 4, 5], filas }] };
  }
  return 'Informe no encontrado.';
}
