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

/**
 * Evaluaciones que cuentan para un componente en un periodo. Si el SEA trajo la nota completa del
 * componente (evaluación «(SEA)» por todo su porcentaje), esa es la nota: las demás no se suman.
 * Con la Prueba del II periodo el SEA trae solo la I prueba, así que la II sí cuenta.
 */
export function evalsQueCuentan<T extends { componente_id: number; origen?: string | null; porcentaje: unknown }>(evals: T[], comp: { id: number; porcentaje: unknown }) {
  const mias = evals.filter((e) => e.componente_id === comp.id);
  const completa = mias.find((e) => e.origen === 'sea' && Number(e.porcentaje) >= Number(comp.porcentaje) - 0.001);
  return completa ? [completa] : mias;
}

// ── Notas del SEA como evaluaciones ─────────────────────────────────────────
// Cada componente importado (menos Asistencia, que se calcula con la asistencia) queda como una
// evaluación «<Componente> (SEA)» calificada por puntos: los puntos son el valor del SEA (el total del rubro).
// El SEA da una sola nota de Prueba. En el I periodo es la suma de las dos pruebas; en el II periodo es
// solo la I prueba (la II es la que se exime): se guarda como «I Prueba (SEA)» con el valor configurado en
// Componentes (prueba1) y se crea la «II Prueba» sin calificar con el resto del componente.
export const PRUEBA1_DEFECTO = 20;
type X = (sql: string, p?: unknown[]) => Promise<any[]>;
export type NotaSea = { estudiante_id: number; clave: string; valor: number };

/** Valor de la I prueba del II periodo para un componente Prueba; null si no se puede dividir */
export function valorPrueba1(comp: { porcentaje: unknown; prueba1?: unknown }) {
  const total = Number(comp.porcentaje);
  const v = comp.prueba1 !== null && comp.prueba1 !== undefined ? Number(comp.prueba1) : PRUEBA1_DEFECTO;
  return v > 0 && v < total ? v : null;
}

/** Deja la II prueba (creada sola) acorde a la I prueba del SEA: la crea, ajusta su valor o la quita */
async function asegurarSegunda(x: X, comp: any, seccionId: number, periodoId: number, primera: number | null) {
  const auto = await x(`SELECT e.id, (SELECT COUNT(*) FROM {S}.notas n WHERE n.evaluacion_id=e.id AND (n.puntos IS NOT NULL OR n.no_entrego)) AS cal
    FROM {S}.evaluaciones e WHERE e.seccion_id=? AND e.periodo_id=? AND e.componente_id=? AND e.origen='auto'`, [seccionId, periodoId, comp.id]);
  if (primera === null) {
    for (const a of auto) if (Number(a.cal) === 0) await x('DELETE FROM {S}.evaluaciones WHERE id=?', [a.id]);
    return null;
  }
  const resto = Math.round((Number(comp.porcentaje) - primera) * 100) / 100;
  const otras = await x(`SELECT id FROM {S}.evaluaciones WHERE seccion_id=? AND periodo_id=? AND componente_id=? AND origen IS DISTINCT FROM 'sea'`, [seccionId, periodoId, comp.id]);
  if (!otras.length && resto > 0) {
    await x(`INSERT INTO {S}.evaluaciones (componente_id, seccion_id, periodo_id, nombre, puntos_total, porcentaje, tipo, origen) VALUES (?,?,?,?,?,?,'puntos','auto')`,
      [comp.id, seccionId, periodoId, 'II Prueba', resto, resto]);
    return `II Prueba (${resto} %, sin calificar)`;
  }
  for (const a of auto) if (Number(a.cal) === 0) await x('UPDATE {S}.evaluaciones SET porcentaje=?, puntos_total=? WHERE id=?', [resto, resto, a.id]);
  return null;
}

/** Guarda las notas del SEA como evaluaciones. soloPrimera: la nota de Prueba es solo la I prueba (II periodo). */
export async function guardarNotasSea(x: X, uid: number, sec: { id: number; nivel: string }, periodoId: number, notas: NotaSea[], soloPrimera: boolean) {
  const hechas: string[] = [];
  const comps = await x('SELECT * FROM {S}.componentes WHERE usuario_id=? AND nivel=? AND clave IS NOT NULL', [uid, sec.nivel]);
  for (const s of SEA.filter((s) => s.clave !== 'asistencia')) {
    const comp = comps.find((c) => c.clave === s.clave);
    const mias = notas.filter((n) => n.clave === s.clave);
    if (!comp || !mias.length) continue;
    const primera = s.clave === 'prueba' && soloPrimera ? valorPrueba1(comp) : null;
    const valor = primera ?? Number(comp.porcentaje);
    const nombre = primera !== null ? 'I Prueba (SEA)' : `${comp.nombre} (SEA)`;
    let ev = (await x(`SELECT id FROM {S}.evaluaciones WHERE seccion_id=? AND periodo_id=? AND componente_id=? AND origen='sea'`, [sec.id, periodoId, comp.id]))[0];
    if (ev) await x('UPDATE {S}.evaluaciones SET nombre=?, puntos_total=?, porcentaje=?, tipo=? WHERE id=?', [nombre, valor, valor, 'puntos', ev.id]);
    else ev = (await x(`INSERT INTO {S}.evaluaciones (componente_id, seccion_id, periodo_id, nombre, puntos_total, porcentaje, tipo, origen)
      VALUES (?,?,?,?,?,?,'puntos','sea') RETURNING id`, [comp.id, sec.id, periodoId, nombre, valor, valor]))[0];
    for (const n of mias)
      await x(`INSERT INTO {S}.notas (evaluacion_id, estudiante_id, puntos, no_entrego) VALUES (?,?,?,false)
        ON CONFLICT (evaluacion_id, estudiante_id) DO UPDATE SET puntos=EXCLUDED.puntos, no_entrego=false`, [ev.id, n.estudiante_id, n.valor]);
    hechas.push(`${nombre} (${valor} %)`);
    if (s.clave === 'prueba') {
      const nueva = await asegurarSegunda(x, comp, sec.id, periodoId, primera);
      if (nueva) hechas.push(nueva);
    }
  }
  return hechas;
}

/**
 * Al cambiar en Componentes el valor de la I prueba de un nivel: ajusta las pruebas del SEA ya importadas
 * en el II periodo de todas las secciones de ese nivel. Devuelve avisos de las que no se pudieron ajustar.
 */
export async function ajustarPruebasSea(uid: number, nivel: string) {
  const avisos: string[] = [];
  const esquema = esquemaActual();
  await transaccion(async (c) => {
    const x: X = async (sql, p = []) => (await c.query(preparar(sql, esquema), p)).rows;
    const comp = (await x(`SELECT * FROM {S}.componentes WHERE usuario_id=? AND nivel=? AND clave='prueba'`, [uid, nivel]))[0];
    if (!comp) return;
    const primera = valorPrueba1(comp);
    const evs = await x(`SELECT e.id, e.seccion_id, e.periodo_id, s.nivel || '-' || s.nombre AS seccion,
        (SELECT MAX(n.puntos) FROM {S}.notas n WHERE n.evaluacion_id=e.id) AS maximo
      FROM {S}.evaluaciones e JOIN {S}.secciones s ON s.id=e.seccion_id JOIN {S}.periodos p ON p.id=e.periodo_id
      WHERE s.usuario_id=? AND e.componente_id=? AND e.origen='sea' AND p.numero=2`, [uid, comp.id]);
    for (const ev of evs) {
      if (primera !== null && Number(ev.maximo ?? 0) > primera) {
        avisos.push(`${ev.seccion}: hay notas de I prueba de hasta ${Number(ev.maximo)}, mayores que ${primera} %; no se cambió.`);
        continue;
      }
      const valor = primera ?? Number(comp.porcentaje);
      await x('UPDATE {S}.evaluaciones SET nombre=?, porcentaje=?, puntos_total=? WHERE id=?', [primera !== null ? 'I Prueba (SEA)' : 'Prueba (SEA)', valor, valor, ev.id]);
      await asegurarSegunda(x, comp, ev.seccion_id, ev.periodo_id, primera);
    }
  });
  return avisos;
}

/** Convierte en evaluaciones las notas importadas antes de v3.5 (quedaban como reemplazo del componente). */
export async function materializarImportadas(uid: number, sec: { id: number; nivel: string }, periodoId: number) {
  const pend = await q<any>(`SELECT estudiante_id, clave, valor FROM {S}.notas_importadas WHERE seccion_id=? AND periodo_id=? AND clave<>'asistencia'`, [sec.id, periodoId]);
  if (!pend.length) return;
  const per = (await q<any>('SELECT numero FROM {S}.periodos WHERE id=?', [periodoId]))[0];
  const esquema = esquemaActual();
  await transaccion(async (c) => {
    const x: X = async (sql, p = []) => (await c.query(preparar(sql, esquema), p)).rows;
    await guardarNotasSea(x, uid, sec, periodoId, pend.map((n) => ({ estudiante_id: n.estudiante_id, clave: n.clave, valor: Number(n.valor) })), per?.numero === 2);
    await x(`DELETE FROM {S}.notas_importadas WHERE seccion_id=? AND periodo_id=? AND clave<>'asistencia'`, [sec.id, periodoId]);
  });
}
