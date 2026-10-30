// Componentes fijos de la plantilla del SEA (MEP). El nombre y el orden no se pueden cambiar
// porque son las columnas del archivo; cada docente ajusta solo el porcentaje (y la forma de calificar).
import { q, exec, transaccion, preparar, esquemaActual } from './db';

export type ClaveSea = 'tc' | 'tareas' | 'prueba' | 'proyecto' | 'asistencia';
export const SEA: { clave: ClaveSea; nombre: string; pct: number; tipo: 'puntos' | 'indicadores' | 'asistencia' }[] = [
  { clave: 'tc', nombre: 'Trabajo cotidiano', pct: 25, tipo: 'indicadores' },
  { clave: 'tareas', nombre: 'Tareas', pct: 10, tipo: 'puntos' },
  { clave: 'prueba', nombre: 'Prueba', pct: 45, tipo: 'puntos' },
  { clave: 'proyecto', nombre: 'Proyecto', pct: 15, tipo: 'puntos' },
  { clave: 'asistencia', nombre: 'Asistencia', pct: 5, tipo: 'asistencia' },
];
export const COLUMNAS_SEA = ['Id', 'Nombre', ...SEA.map((s) => s.nombre)];

/** Clave SEA que corresponde a un nombre libre (componentes creados antes de v3.1 o respaldos viejos) */
export function claveDeNombre(nombre: string): ClaveSea | null {
  const n = normalizar(nombre);
  if (n.startsWith('trabajo cotid') || n === 'cotidiano') return 'tc';
  if (n.startsWith('tarea')) return 'tareas';
  if (n.startsWith('prueba')) return 'prueba';
  if (n.startsWith('proyecto')) return 'proyecto';
  if (n.startsWith('asistencia')) return 'asistencia';
  return null;
}
export const normalizar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Garantiza los 5 componentes del SEA para un nivel: adopta los existentes por nombre y crea los que falten. */
export async function asegurarComponentes(uid: number, nivel: string) {
  if (!nivel) return;
  const comps = await q<any>('SELECT id, nombre, clave FROM {S}.componentes WHERE usuario_id=? AND nivel=? ORDER BY orden, id', [uid, nivel]);
  const tomadas = new Set(comps.filter((c) => c.clave).map((c) => c.clave as string));
  if (tomadas.size === SEA.length) return;
  for (const c of comps.filter((c) => !c.clave)) {
    const k = claveDeNombre(c.nombre);
    if (!k || tomadas.has(k)) continue;
    const s = SEA.find((x) => x.clave === k)!;
    await exec(`UPDATE {S}.componentes SET clave=?, nombre=?, orden=?${k === 'asistencia' ? ", tipo='asistencia'" : ''} WHERE id=?`, [k, s.nombre, SEA.indexOf(s) + 1, c.id]);
    tomadas.add(k);
  }
  for (const [i, s] of SEA.entries()) {
    if (tomadas.has(s.clave)) continue;
    await exec(`INSERT INTO {S}.componentes (usuario_id, nivel, nombre, porcentaje, tipo, orden, clave) VALUES (?,?,?,?,?,?,?)
      ON CONFLICT DO NOTHING`, [uid, nivel, s.nombre, s.pct, s.tipo, i + 1, s.clave]);
  }
}

/** Número para el archivo del SEA: entero si no tiene decimales; si no, dos decimales con coma (Excel en español). */
export const numSea = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace('.', ','));
/** Lee un número del archivo (acepta coma o punto decimal); '' → null; texto inválido → NaN */
export const leerNum = (s: string) => {
  const t = (s ?? '').trim();
  if (t === '') return null;
  return /^-?\d+([.,]\d+)?$/.test(t) ? Number(t.replace(',', '.')) : NaN;
};
/** "APELLIDO1 APELLIDO2 NOMBRES" (formato del SEA) → apellidos y nombre */
export function separarNombre(completo: string) {
  const p = completo.trim().replace(/\s+/g, ' ').split(' ');
  if (p.length <= 2) return { apellidos: p[0] ?? '', nombre: p.slice(1).join(' ') };
  // Partículas de apellidos compuestos: DE LA O, DEL CASTILLO, DE LOS ÁNGELES…
  const PART = new Set(['DE', 'DEL', 'LA', 'LAS', 'LOS', 'Y', 'SAN', 'VAN', 'VON']);
  const ap: string[] = [];
  let i = 0;
  for (let n = 0; n < 2 && i < p.length - 1; n++) {
    const pedazo = [p[i++]];
    while (PART.has(pedazo[pedazo.length - 1].toUpperCase()) && i < p.length - 1) pedazo.push(p[i++]);
    ap.push(pedazo.join(' '));
  }
  return { apellidos: ap.join(' '), nombre: p.slice(i).join(' ') };
}

// ── Notas del SEA como evaluaciones ─────────────────────────────────────────
// Cada componente importado (menos Asistencia, que se calcula con la asistencia) queda como una
// evaluación «<Componente> (SEA)» calificada por puntos, donde los puntos son el valor del SEA.
// El SEA da una sola nota de Prueba: si ninguna pasa de 25 (y el componente vale más), es solo la
// I prueba; se guarda con ese valor (20 % o 25 %, o el indicado) y se crea la II prueba sin calificar.
export const MAX_UNA_PRUEBA = 25;
type X = (sql: string, p?: unknown[]) => Promise<any[]>;
export type NotaSea = { estudiante_id: number; clave: string; valor: number };

export function valorPrimeraPrueba(maximo: number, pctComp: number, indicado?: number | null) {
  if (!(pctComp > MAX_UNA_PRUEBA) || maximo > MAX_UNA_PRUEBA) return null; // trae todas las pruebas
  const v = indicado && indicado > 0 ? indicado : maximo <= 20 ? 20 : 25;
  return Math.min(Math.max(v, maximo), pctComp);
}

export async function guardarNotasSea(x: X, uid: number, sec: { id: number; nivel: string }, periodoId: number, notas: NotaSea[], primeraIndicada?: number | null) {
  const hechas: string[] = [];
  const comps = await x('SELECT * FROM {S}.componentes WHERE usuario_id=? AND nivel=? AND clave IS NOT NULL', [uid, sec.nivel]);
  for (const s of SEA.filter((s) => s.clave !== 'asistencia')) {
    const comp = comps.find((c) => c.clave === s.clave);
    const mias = notas.filter((n) => n.clave === s.clave);
    if (!comp || !mias.length) continue;
    const pctComp = Number(comp.porcentaje);
    let valor = pctComp, nombre = `${comp.nombre} (SEA)`;
    const primera = s.clave === 'prueba' ? valorPrimeraPrueba(Math.max(...mias.map((n) => n.valor)), pctComp, primeraIndicada) : null;
    if (primera !== null) { valor = primera; nombre = 'I Prueba (SEA)'; }
    let ev = (await x(`SELECT id FROM {S}.evaluaciones WHERE seccion_id=? AND periodo_id=? AND componente_id=? AND origen='sea'`, [sec.id, periodoId, comp.id]))[0];
    if (ev) await x('UPDATE {S}.evaluaciones SET nombre=?, puntos_total=?, porcentaje=?, tipo=? WHERE id=?', [nombre, valor, valor, 'puntos', ev.id]);
    else ev = (await x(`INSERT INTO {S}.evaluaciones (componente_id, seccion_id, periodo_id, nombre, puntos_total, porcentaje, tipo, origen)
      VALUES (?,?,?,?,?,?,'puntos','sea') RETURNING id`, [comp.id, sec.id, periodoId, nombre, valor, valor]))[0];
    for (const n of mias)
      await x(`INSERT INTO {S}.notas (evaluacion_id, estudiante_id, puntos, no_entrego) VALUES (?,?,?,false)
        ON CONFLICT (evaluacion_id, estudiante_id) DO UPDATE SET puntos=EXCLUDED.puntos, no_entrego=false`, [ev.id, n.estudiante_id, n.valor]);
    if (s.clave === 'prueba') {
      const auto = await x(`SELECT e.id, (SELECT COUNT(*) FROM {S}.notas n WHERE n.evaluacion_id=e.id AND (n.puntos IS NOT NULL OR n.no_entrego)) AS cal
        FROM {S}.evaluaciones e WHERE e.seccion_id=? AND e.periodo_id=? AND e.componente_id=? AND e.origen='auto'`, [sec.id, periodoId, comp.id]);
      if (primera !== null) {
        const otras = await x(`SELECT id FROM {S}.evaluaciones WHERE seccion_id=? AND periodo_id=? AND componente_id=? AND origen IS DISTINCT FROM 'sea'`, [sec.id, periodoId, comp.id]);
        const resto = Math.round((pctComp - primera) * 100) / 100;
        if (!otras.length && resto > 0) {
          await x(`INSERT INTO {S}.evaluaciones (componente_id, seccion_id, periodo_id, nombre, puntos_total, porcentaje, tipo, origen) VALUES (?,?,?,?,?,?,'puntos','auto')`,
            [comp.id, sec.id, periodoId, 'II Prueba', resto, resto]);
          hechas.push(`${nombre} (${valor} %)`, `II Prueba (${resto} %, sin calificar)`);
          continue;
        }
        for (const a of auto) if (Number(a.cal) === 0) await x('UPDATE {S}.evaluaciones SET porcentaje=?, puntos_total=? WHERE id=?', [resto, resto, a.id]);
      } else {
        // Ya trae las dos pruebas: la II prueba creada sola sobra si nadie la calificó
        for (const a of auto) if (Number(a.cal) === 0) await x('DELETE FROM {S}.evaluaciones WHERE id=?', [a.id]);
      }
    }
    hechas.push(`${nombre} (${valor} %)`);
  }
  return hechas;
}

/** Convierte en evaluaciones las notas importadas antes de v3.5 (quedaban como reemplazo del componente). */
export async function materializarImportadas(uid: number, sec: { id: number; nivel: string }, periodoId: number) {
  const pend = await q<any>(`SELECT estudiante_id, clave, valor FROM {S}.notas_importadas WHERE seccion_id=? AND periodo_id=? AND clave<>'asistencia'`, [sec.id, periodoId]);
  if (!pend.length) return;
  const esquema = esquemaActual();
  await transaccion(async (c) => {
    const x: X = async (sql, p = []) => (await c.query(preparar(sql, esquema), p)).rows;
    await guardarNotasSea(x, uid, sec, periodoId, pend.map((n) => ({ estudiante_id: n.estudiante_id, clave: n.clave, valor: Number(n.valor) })));
    await x(`DELETE FROM {S}.notas_importadas WHERE seccion_id=? AND periodo_id=? AND clave<>'asistencia'`, [sec.id, periodoId]);
  });
}
