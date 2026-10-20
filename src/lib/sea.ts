// Componentes fijos de la plantilla del SEA (MEP). El nombre y el orden no se pueden cambiar
// porque son las columnas del archivo; cada docente ajusta solo el porcentaje (y la forma de calificar).
import { q, exec } from './db';

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
