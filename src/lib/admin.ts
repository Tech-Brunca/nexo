// Resetear un docente (solo administradores): borrar sus datos de un colegio, de todos sus colegios
// (y sus materias y ajustes), o eliminar la cuenta completa.
import type pg from 'pg';
import { q, transaccion } from './db';

/** Colegios del docente, con su esquema */
export const colegiosDe = (uid: number) => q<any>(`SELECT c.id, c.nombre, c.esquema FROM general.colegios c
  JOIN general.usuario_colegios uc ON uc.colegio_id=c.id WHERE uc.usuario_id=? AND c.esquema IS NOT NULL ORDER BY c.nombre`, [uid]);

const ESQUEMA = /^c_\d+$/;
// Orden que respeta las referencias entre tablas; lo que se cuelga de secciones o estudiantes se borra en cascada
const ORDEN = ['comunicados', 'bitacora', 'planes', 'secciones', 'estudiantes', 'componentes', 'periodos'];

/** Borra todo lo del docente en un esquema de colegio; devuelve cuántas filas por tabla */
async function borrarEnEsquema(c: pg.PoolClient, esquema: string, uid: number) {
  if (!ESQUEMA.test(esquema)) throw new Error('Esquema no válido');
  const tablas = (await c.query(`SELECT table_name FROM information_schema.columns WHERE table_schema=$1 AND column_name='usuario_id'`, [esquema])).rows
    .map((r) => r.table_name as string)
    .sort((a, b) => (ORDEN.indexOf(a) + 1 || 99) - (ORDEN.indexOf(b) + 1 || 99));
  const cuenta: Record<string, number> = {};
  // Varias pasadas por si alguna tabla nueva depende de otra: cada intento en su propio savepoint
  let pendientes = tablas;
  for (let pasada = 0; pasada < 4 && pendientes.length; pasada++) {
    const fallan: string[] = [];
    for (const t of pendientes) {
      await c.query('SAVEPOINT borrar');
      try {
        const r = await c.query(`DELETE FROM ${esquema}."${t}" WHERE usuario_id=$1`, [uid]);
        cuenta[t] = (cuenta[t] ?? 0) + (r.rowCount ?? 0);
        await c.query('RELEASE SAVEPOINT borrar');
      } catch { await c.query('ROLLBACK TO SAVEPOINT borrar'); fallan.push(t); }
    }
    pendientes = fallan;
  }
  if (pendientes.length) throw new Error(`No se pudo borrar: ${pendientes.join(', ')}`);
  return cuenta;
}

/** Materias, ajustes, escala, indicadores y plantillas del docente (lo general, común a sus colegios) */
async function borrarGeneral(c: pg.PoolClient, uid: number) {
  for (const t of ['plantillas_hogar', 'plantillas', 'indicadores', 'asignaturas', 'escala_asistencia', 'ajustes'])
    await c.query(`DELETE FROM general.${t} WHERE usuario_id=$1`, [uid]);
  await c.query(`DELETE FROM general.meta WHERE clave=$1`, [`hogar:${uid}`]);
}

const resumen = (c: Record<string, number>) => {
  const n = (t: string) => c[t] ?? 0;
  return `${n('secciones')} secciones, ${n('estudiantes')} estudiantes, ${n('bitacora')} registros de bitácora, ${n('planes')} planes`;
};

/** Borra los datos del docente en un colegio (la cuenta, sus materias y los otros colegios quedan) */
export async function resetearColegio(uid: number, colegioId: number) {
  const col = (await colegiosDe(uid)).find((x) => x.id === colegioId);
  if (!col) throw new Error('El docente no está en ese colegio.');
  const c = await transaccion((cx) => borrarEnEsquema(cx, col.esquema, uid));
  return `Se borraron los datos de ${col.nombre}: ${resumen(c)}.`;
}

/** Borra todos los datos del docente en todos sus colegios, más sus materias y ajustes; la cuenta queda */
export async function resetearTodo(uid: number) {
  const cols = await colegiosDe(uid);
  const total: Record<string, number> = {};
  await transaccion(async (cx) => {
    for (const col of cols) for (const [t, n] of Object.entries(await borrarEnEsquema(cx, col.esquema, uid))) total[t] = (total[t] ?? 0) + n;
    await borrarGeneral(cx, uid);
  });
  return `Se borraron todos sus datos (${resumen(total)}) y sus materias y ajustes. La cuenta y su contraseña quedan.`;
}

/** Elimina la cuenta y todo lo suyo */
export async function eliminarCuenta(uid: number) {
  const cols = await colegiosDe(uid);
  await transaccion(async (cx) => {
    for (const col of cols) await borrarEnEsquema(cx, col.esquema, uid);
    await borrarGeneral(cx, uid);
    await cx.query('DELETE FROM general.usuarios WHERE id=$1', [uid]);
  });
  return 'Cuenta eliminada con todos sus datos.';
}
