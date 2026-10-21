import pg from 'pg';
import { AsyncLocalStorage } from 'node:async_hooks';
import sqlGeneral from '../../db/general.sql?raw';
import sqlColegio from '../../db/colegio.sql?raw';

// ── Tipos: números como number y fechas como texto 'AAAA-MM-DD' ─────────────
pg.types.setTypeParser(20, (v) => Number(v));       // int8 (COUNT, SUM)
pg.types.setTypeParser(1700, (v) => Number(v));     // numeric
pg.types.setTypeParser(1082, (v) => v);             // date
pg.types.setTypeParser(1114, (v) => v.slice(0, 16)); // timestamp
pg.types.setTypeParser(1184, (v) => v.slice(0, 16)); // timestamptz

const env = (k: string, d = '') => process.env[k] ?? d;

let pool: pg.Pool | undefined;
export function db() {
  if (!pool) {
    // DATABASE_URL (Supabase: usar el "Transaction pooler", puerto 6543) o variables DB_*
    const url = env('DATABASE_URL').replace(/[?&]sslmode=[^&]*/g, '');
    const ssl = env('DB_SSL') === 'true'
      ? (env('DB_CA') ? { ca: env('DB_CA').replace(/\\n/g, '\n') } : { rejectUnauthorized: false })
      : undefined;
    pool = new pg.Pool({
      ...(url ? { connectionString: url } : {
        host: env('DB_HOST', 'localhost'), port: Number(env('DB_PORT', '5432')),
        user: env('DB_USER', 'nexo'), password: env('DB_PASSWORD', 'nexo123'), database: env('DB_NAME', 'nexo'),
      }),
      ssl,
      max: Number(env('DB_POOL', '5')),
      idleTimeoutMillis: 10_000,
    });
  }
  return pool;
}

// ── Colegio activo de la petición: {S} en el SQL se reemplaza por su esquema ──
const ctx = new AsyncLocalStorage<{ esquema: string | null }>();
export const conEsquema = <T>(esquema: string | null, fn: () => T) => ctx.run({ esquema }, fn);
export const esquemaActual = () => ctx.getStore()?.esquema ?? null;
export const nombreEsquema = (colegioId: number) => `c_${Math.trunc(colegioId)}`;

/** Convierte "?" en $1, $2… y {S} en el esquema del colegio activo */
export function preparar(sql: string, esquema = esquemaActual()) {
  if (sql.includes('{S}')) {
    if (!esquema || !/^c_\d+$/.test(esquema)) throw new Error('Consulta de colegio sin colegio activo');
    sql = sql.replaceAll('{S}', esquema);
  }
  let n = 0, enTexto = false, out = '';
  for (const ch of sql) {
    if (ch === "'") enTexto = !enTexto;
    out += ch === '?' && !enTexto ? `$${++n}` : ch;
  }
  return out;
}

type Ejecutor = { query: (t: string, p?: any[]) => Promise<pg.QueryResult> };
export async function q<T = any>(sql: string, params: any[] = [], c: Ejecutor = db()): Promise<T[]> {
  return (await c.query(preparar(sql), params)).rows as T[];
}
export async function one<T = any>(sql: string, params: any[] = [], c?: Ejecutor): Promise<T | undefined> {
  return (await q<T>(sql, params, c))[0];
}
export async function exec(sql: string, params: any[] = [], c: Ejecutor = db()) {
  return c.query(preparar(sql), params);
}
/** Ejecuta fn dentro de una transacción con su propia conexión */
export async function transaccion<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const c = await db().connect();
  try {
    await c.query('BEGIN');
    const r = await fn(c);
    await c.query('COMMIT');
    return r;
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    throw e;
  } finally { c.release(); }
}

// ── Esquemas y migraciones ──────────────────────────────────────────────────
// Subir VERSION cuando cambien general.sql o colegio.sql: la primera petición migra todo.
export const VERSION = '3.4.0';
let listo: Promise<void> | null = null;

export const sqlDeColegio = (esquema: string) => sqlColegio.replaceAll('__ESQUEMA__', esquema);

export async function crearEsquemaColegio(colegioId: number, c: Ejecutor = db()) {
  const esquema = nombreEsquema(colegioId);
  await c.query(sqlDeColegio(esquema));
  await c.query('UPDATE general.colegios SET esquema=$1 WHERE id=$2', [esquema, colegioId]);
  return esquema;
}

async function versionActual(c: Ejecutor): Promise<string | null> {
  try {
    const v = await c.query(`SELECT valor FROM general.meta WHERE clave='version'`);
    return v.rows[0]?.valor ?? null;
  } catch {
    return null; // aún no existe el esquema general
  }
}

export async function migrar() {
  // Si ya está al día no se toca nada (arranques en frío de Netlify más rápidos)
  if ((await versionActual(db())) === VERSION) return;
  const c = await db().connect();
  try {
    // Candado de transacción: funciona con el Transaction pooler de Supabase,
    // donde un candado de sesión podría quedar trabado en otra conexión.
    await c.query('BEGIN');
    await c.query('SELECT pg_advisory_xact_lock(424242)');
    await c.query(sqlGeneral);
    if ((await versionActual(c)) !== VERSION) {
      const colegios = await c.query('SELECT id FROM general.colegios ORDER BY id');
      for (const col of colegios.rows) await crearEsquemaColegio(col.id, c);
      await c.query(`INSERT INTO general.meta VALUES ('version', $1) ON CONFLICT (clave) DO UPDATE SET valor=EXCLUDED.valor`, [VERSION]);
    }
    await c.query('COMMIT');
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}
/** Se llama en cada petición; solo migra la primera vez de cada proceso */
export function asegurarEsquema() {
  listo ??= migrar().catch((e) => { listo = null; throw e; });
  return listo;
}

// ── Ajustes del docente ─────────────────────────────────────────────────────
export type Ajustes = {
  curso_lectivo: number; nota_aprobatoria: number; tardias_por_ausencia: number;
  alerta_dias: number; alerta_ausencias: number; ne_cuenta_cero: boolean;
};

const ESCALA_INICIAL = [[0, 1, 100], [1, 10, 90], [10, 20, 80], [20, 30, 70], [30, 40, 60], [40, 50, 50],
  [50, 60, 40], [60, 70, 30], [70, 80, 20], [80, 90, 10], [90, 101, 0]];

export async function getAjustes(uid: number): Promise<Ajustes> {
  let a = await one<Ajustes>('SELECT * FROM general.ajustes WHERE usuario_id=?', [uid]);
  if (!a) {
    await exec('INSERT INTO general.ajustes (usuario_id, curso_lectivo) VALUES (?, ?) ON CONFLICT DO NOTHING', [uid, new Date().getFullYear()]);
    a = (await one<Ajustes>('SELECT * FROM general.ajustes WHERE usuario_id=?', [uid]))!;
  }
  return a;
}
export async function getEscala(uid: number) {
  let e = await q<{ desde: number; hasta: number; porcentaje: number }>(
    'SELECT desde, hasta, porcentaje FROM general.escala_asistencia WHERE usuario_id=? ORDER BY desde', [uid]);
  if (!e.length) {
    for (const [d, h, p] of ESCALA_INICIAL)
      await exec('INSERT INTO general.escala_asistencia VALUES (?,?,?,?) ON CONFLICT DO NOTHING', [uid, d, h, p]);
    e = await q('SELECT desde, hasta, porcentaje FROM general.escala_asistencia WHERE usuario_id=? ORDER BY desde', [uid]);
  }
  return e;
}

/** Al entrar a un colegio por primera vez, el docente recibe dos periodos */
export async function prepararColegio(uid: number, esquema: string) {
  if (!/^c_\d+$/.test(esquema)) throw new Error('Esquema inválido');
  const hay = await one(`SELECT id FROM ${esquema}.periodos WHERE usuario_id=? LIMIT 1`, [uid]);
  if (!hay) {
    await exec(`INSERT INTO ${esquema}.periodos (usuario_id, numero, nombre, ponderado) VALUES (?,1,'I Periodo',50),(?,2,'II Periodo',50)`, [uid, uid]);
  }
}
