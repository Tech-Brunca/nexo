import mysql from 'mysql2/promise';

const env = (k: string, d = '') => process.env[k] ?? d;

let pool: mysql.Pool | undefined;
export function db() {
  if (!pool) {
    // DB_SSL=true para servicios en la nube (TiDB Cloud exige TLS)
    const ssl = env('DB_SSL') === 'true' ? { minVersion: 'TLSv1.2', rejectUnauthorized: true } : undefined;
    pool = mysql.createPool({
      host: env('DB_HOST', 'localhost'),
      port: Number(env('DB_PORT', '3306')),
      user: env('DB_USER', 'registro'),
      password: env('DB_PASSWORD', 'registro123'),
      database: env('DB_NAME', 'registro'),
      connectionLimit: Number(env('DB_POOL', '5')),
      dateStrings: true,
      decimalNumbers: true,
      charset: 'utf8mb4',
      ssl,
    });
  }
  return pool;
}

export async function q<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  const [rows] = await db().query(sql, params);
  return rows as T[];
}
export async function one<T = any>(sql: string, params: any[] = []): Promise<T | undefined> {
  return (await q<T>(sql, params))[0];
}
export async function exec(sql: string, params: any[] = []) {
  const [r] = await db().query(sql, params);
  return r as mysql.ResultSetHeader;
}

export type Ajustes = {
  curso_lectivo: number; nota_aprobatoria: number; tardias_por_ausencia: number; alerta_dias: number; alerta_ausencias: number;
};

const ESCALA_INICIAL = [[0, 1, 100], [1, 10, 90], [10, 20, 80], [20, 30, 70], [30, 40, 60], [40, 50, 50],
  [50, 60, 40], [60, 70, 30], [70, 80, 20], [80, 90, 10], [90, 101, 0]];

/** Ajustes del docente; los crea con valores por defecto la primera vez */
export async function getAjustes(uid: number): Promise<Ajustes> {
  let a = await one<Ajustes>('SELECT * FROM ajustes WHERE usuario_id=?', [uid]);
  if (!a) {
    await exec('INSERT IGNORE INTO ajustes (usuario_id, curso_lectivo) VALUES (?, ?)', [uid, new Date().getFullYear()]);
    a = (await one<Ajustes>('SELECT * FROM ajustes WHERE usuario_id=?', [uid]))!;
  }
  return a;
}
export async function getEscala(uid: number) {
  let e = await q<{ desde: number; hasta: number; porcentaje: number }>('SELECT desde, hasta, porcentaje FROM escala_asistencia WHERE usuario_id=? ORDER BY desde', [uid]);
  if (!e.length) {
    await exec('INSERT IGNORE INTO escala_asistencia (usuario_id, desde, hasta, porcentaje) VALUES ?', [ESCALA_INICIAL.map((r) => [uid, ...r])]);
    e = await q('SELECT desde, hasta, porcentaje FROM escala_asistencia WHERE usuario_id=? ORDER BY desde', [uid]);
  }
  return e;
}

/** Al asociar un docente a una institución le crea dos periodos si no tiene ninguno */
export async function prepararInstitucion(uid: number, instId: number) {
  const hay = await one<any>('SELECT id FROM periodos WHERE usuario_id=? AND institucion_id=? LIMIT 1', [uid, instId]);
  if (!hay) {
    await exec('INSERT INTO periodos (usuario_id, institucion_id, numero, nombre, ponderado) VALUES (?,?,1,?,50),(?,?,2,?,50)',
      [uid, instId, 'I Periodo', uid, instId, 'II Periodo']);
  }
}
