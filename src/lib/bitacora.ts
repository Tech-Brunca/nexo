// Bitácora del docente: una minuta por sección y día, anotaciones sobre estudiantes y, en las mismas
// vistas, los comunicados enviados (WhatsApp o impresos). Todo es solo del docente que lo escribe.
import { q, one, exec, transaccion, preparar, esquemaActual } from './db';

export type Anotacion = { id: number; seccion_id: number; fecha: string; tipo: 'minuta' | 'estudiante'; texto: string; creado: string; actualizado: string;
  estudiantes: { id: number; nombre: string }[] };
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** Sección del docente o null */
export const seccionPropia = (uid: number, id: number) => one<any>('SELECT id, nivel, nombre, subgrupo FROM {S}.secciones WHERE id=? AND usuario_id=?', [id, uid]);

/**
 * Crea o actualiza una anotación. La minuta es única por sección y día; una anotación existente conserva
 * su fecha (la del día en que se empezó). Solo se ligan estudiantes matriculados en esa sección.
 */
export async function guardarAnotacion(uid: number, d: { id?: number; seccion_id: number; fecha: string; tipo: 'minuta' | 'estudiante'; texto: string; estudiantes: number[] }) {
  const sec = await seccionPropia(uid, d.seccion_id);
  if (!sec) throw new Error('Sección no encontrada');
  if (!FECHA.test(d.fecha)) throw new Error('Fecha no válida');
  if (!['minuta', 'estudiante'].includes(d.tipo)) throw new Error('Tipo no válido');
  const texto = String(d.texto ?? '').slice(0, 20000);
  const validos = new Set((await q<any>('SELECT estudiante_id FROM {S}.matriculas WHERE seccion_id=?', [sec.id])).map((r) => r.estudiante_id));
  const ests = [...new Set(d.estudiantes.map(Number))].filter((e) => validos.has(e));
  const esquema = esquemaActual();
  return transaccion(async (c) => {
    const x = async (sql: string, p: unknown[] = []) => (await c.query(preparar(sql, esquema), p)).rows;
    let fila: any;
    if (d.id) {
      fila = (await x(`UPDATE {S}.bitacora SET texto=?, actualizado=now() WHERE id=? AND usuario_id=? AND seccion_id=? RETURNING id, fecha, to_char(actualizado AT TIME ZONE 'America/Costa_Rica', 'YYYY-MM-DD HH24:MI') AS actualizado`,
        [texto, d.id, uid, sec.id]))[0];
      if (!fila) throw new Error('Anotación no encontrada');
    } else if (d.tipo === 'minuta') {
      fila = (await x(`INSERT INTO {S}.bitacora (usuario_id, seccion_id, fecha, tipo, texto) VALUES (?,?,?::date,'minuta',?)
        ON CONFLICT (seccion_id, fecha) WHERE tipo='minuta' DO UPDATE SET texto=EXCLUDED.texto, actualizado=now()
        RETURNING id, fecha, to_char(actualizado AT TIME ZONE 'America/Costa_Rica', 'YYYY-MM-DD HH24:MI') AS actualizado`, [uid, sec.id, d.fecha, texto]))[0];
    } else {
      fila = (await x(`INSERT INTO {S}.bitacora (usuario_id, seccion_id, fecha, tipo, texto) VALUES (?,?,?::date,'estudiante',?) RETURNING id, fecha, to_char(actualizado AT TIME ZONE 'America/Costa_Rica', 'YYYY-MM-DD HH24:MI') AS actualizado`,
        [uid, sec.id, d.fecha, texto]))[0];
    }
    await x('DELETE FROM {S}.bitacora_estudiantes WHERE bitacora_id=?', [fila.id]);
    for (const e of ests) await x('INSERT INTO {S}.bitacora_estudiantes VALUES (?,?) ON CONFLICT DO NOTHING', [fila.id, e]);
    return { id: fila.id as number, fecha: fila.fecha as string, actualizado: fila.actualizado as string };
  });
}

export const borrarAnotacion = (uid: number, id: number) => exec(`DELETE FROM {S}.bitacora WHERE id=? AND usuario_id=? AND tipo='estudiante'`, [id, uid]);

const conEstudiantes = async (filas: any[]): Promise<Anotacion[]> => {
  if (!filas.length) return [];
  const rel = await q<any>(`SELECT be.bitacora_id, e.id, e.apellidos || ' ' || e.nombre AS nombre FROM {S}.bitacora_estudiantes be
    JOIN {S}.estudiantes e ON e.id=be.estudiante_id WHERE be.bitacora_id = ANY(?) ORDER BY e.apellidos, e.nombre`, [filas.map((f) => f.id)]);
  return filas.map((f) => ({ ...f, estudiantes: rel.filter((r) => r.bitacora_id === f.id).map((r) => ({ id: r.id, nombre: r.nombre })) }));
};

/** Comunicados de una sección en un rango: los de esa sección, o sin sección de un estudiante matriculado en ella */
async function comunicadosDe(uid: number, seccionId: number, desde: string, hasta: string) {
  return q<any>(`SELECT c.id, c.tipo, c.medio, c.mensaje, to_char(c.creado AT TIME ZONE 'America/Costa_Rica', 'YYYY-MM-DD HH24:MI') AS creado, (c.creado AT TIME ZONE 'America/Costa_Rica')::date AS fecha,
      e.id AS estudiante_id, e.apellidos || ' ' || e.nombre AS estudiante
    FROM {S}.comunicados c LEFT JOIN {S}.estudiantes e ON e.id=c.estudiante_id
    WHERE c.usuario_id=? AND (c.creado AT TIME ZONE 'America/Costa_Rica')::date BETWEEN ?::date AND ?::date
      AND (c.seccion_id=? OR (c.seccion_id IS NULL AND EXISTS (SELECT 1 FROM {S}.matriculas m WHERE m.estudiante_id=c.estudiante_id AND m.seccion_id=?)))
    ORDER BY c.id`, [uid, desde, hasta, seccionId, seccionId]);
}

/** Todo lo de una sección entre dos fechas, agrupado por día (para la página Bitácora y el resumen) */
export async function bitacoraRango(uid: number, seccionId: number, desde: string, hasta: string) {
  const filas = await conEstudiantes(await q<any>(`SELECT id, seccion_id, fecha, tipo, texto, to_char(creado AT TIME ZONE 'America/Costa_Rica', 'YYYY-MM-DD HH24:MI') AS creado, to_char(actualizado AT TIME ZONE 'America/Costa_Rica', 'YYYY-MM-DD HH24:MI') AS actualizado FROM {S}.bitacora
    WHERE usuario_id=? AND seccion_id=? AND fecha BETWEEN ?::date AND ?::date ORDER BY fecha DESC, tipo, creado`, [uid, seccionId, desde, hasta]));
  const com = await comunicadosDe(uid, seccionId, desde, hasta);
  const dias = [...new Set([...filas.map((f) => f.fecha), ...com.map((c) => c.fecha)])].sort().reverse();
  return dias.map((fecha) => ({
    fecha,
    minuta: filas.find((f) => f.fecha === fecha && f.tipo === 'minuta') ?? null,
    notas: filas.filter((f) => f.fecha === fecha && f.tipo === 'estudiante'),
    comunicados: com.filter((c) => c.fecha === fecha),
  }));
}

/** Línea de tiempo de un estudiante: anotaciones que lo mencionan y comunicados */
export async function historiaEstudiante(uid: number, estudianteId: number) {
  const notas = await conEstudiantes(await q<any>(`SELECT b.id, b.seccion_id, b.fecha, b.tipo, b.texto, to_char(b.creado AT TIME ZONE 'America/Costa_Rica', 'YYYY-MM-DD HH24:MI') AS creado, to_char(b.actualizado AT TIME ZONE 'America/Costa_Rica', 'YYYY-MM-DD HH24:MI') AS actualizado FROM {S}.bitacora b
    JOIN {S}.bitacora_estudiantes be ON be.bitacora_id=b.id WHERE b.usuario_id=? AND be.estudiante_id=? ORDER BY b.fecha DESC, b.creado DESC`, [uid, estudianteId]));
  const com = await q<any>(`SELECT id, tipo, medio, mensaje, to_char(creado AT TIME ZONE 'America/Costa_Rica', 'YYYY-MM-DD HH24:MI') AS creado, (creado AT TIME ZONE 'America/Costa_Rica')::date AS fecha, seccion_id
    FROM {S}.comunicados WHERE usuario_id=? AND estudiante_id=? ORDER BY id DESC`, [uid, estudianteId]);
  return { notas, comunicados: com };
}

// ── Comunicados al hogar ─────────────────────────────────────────────────────
export const PLANTILLAS_HOGAR: [string, string][] = [
  ['Felicitación', 'Estimado(a) {encargado}: le saluda {docente}, docente de {asignatura} en {colegio}. Me complace informarle que {estudiante} ({seccion}) ha mostrado un excelente desempeño y compromiso en clase. ¡Felicidades por su esfuerzo!'],
  ['Tareas o evaluaciones pendientes', 'Estimado(a) {encargado}: le saluda {docente}, docente de {asignatura} en {colegio}. Le informo que {estudiante} ({seccion}) tiene trabajos o evaluaciones pendientes de entregar. Le agradezco apoyarle para ponerse al día.'],
  ['Conducta', 'Estimado(a) {encargado}: le saluda {docente}, docente de {asignatura} en {colegio}. Le comunico una situación de conducta de {estudiante} ({seccion}) el día {fecha}: ____. Agradezco conversarlo en casa.'],
  ['Citación a reunión', 'Estimado(a) {encargado}: le saluda {docente}, docente de {asignatura} en {colegio}. Le solicito presentarse a una reunión para conversar sobre {estudiante} ({seccion}) el día ____ a las ____. Gracias.'],
  ['Mensaje libre', 'Estimado(a) {encargado}: le saluda {docente}, docente de {asignatura} en {colegio}. '],
];
export async function plantillasHogar(uid: number) {
  let p = await q<any>('SELECT id, nombre, texto FROM general.plantillas_hogar WHERE usuario_id=? ORDER BY orden, id', [uid]);
  const ya = await one<any>(`SELECT valor FROM general.meta WHERE clave=?`, [`hogar:${uid}`]);
  if (!p.length && !ya) {
    // Primera vez: se crean las predeterminadas (si después las borra todas, no se vuelven a crear)
    for (const [i, [n, t]] of PLANTILLAS_HOGAR.entries()) await exec('INSERT INTO general.plantillas_hogar (usuario_id, nombre, texto, orden) VALUES (?,?,?,?)', [uid, n, t, i + 1]);
    await exec(`INSERT INTO general.meta VALUES (?, '1') ON CONFLICT (clave) DO NOTHING`, [`hogar:${uid}`]);
    p = await q<any>('SELECT id, nombre, texto FROM general.plantillas_hogar WHERE usuario_id=? ORDER BY orden, id', [uid]);
  }
  return p as { id: number; nombre: string; texto: string }[];
}

/** «2026-11-03 16:40» → «4:40 p. m.» (las horas ya vienen en hora de Costa Rica) */
export function horaCorta(t?: string | null) {
  const m = t?.match(/(\d{2}):(\d{2})/); if (!m) return '';
  const h = Number(m[1]);
  return `${h % 12 || 12}:${m[2]} ${h < 12 ? 'a. m.' : 'p. m.'}`;
}
