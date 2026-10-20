// Crea o actualiza el esquema general y el de cada colegio (lo mismo que hace la app en su primera petición).
// Uso:  node scripts/migrar.mjs      (lee DATABASE_URL o DB_* del entorno o de un archivo .env)
import { readFileSync, existsSync } from 'node:fs';
import pg from 'pg';

if (existsSync('.env')) {
  for (const linea of readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const m = linea.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
const e = process.env;
const url = (e.DATABASE_URL || '').replace(/[?&]sslmode=[^&]*/g, '');
const c = new pg.Client({
  ...(url ? { connectionString: url } : { host: e.DB_HOST || 'localhost', port: Number(e.DB_PORT || 5432), user: e.DB_USER || 'nexo', password: e.DB_PASSWORD || 'nexo123', database: e.DB_NAME || 'nexo' }),
  ssl: e.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
});
await c.connect();
const leer = (f) => readFileSync(new URL(`../db/${f}`, import.meta.url), 'utf8');
await c.query(leer('general.sql'));
const { rows } = await c.query('SELECT id FROM general.colegios ORDER BY id');
for (const r of rows) {
  const esquema = `c_${r.id}`;
  await c.query(leer('colegio.sql').replaceAll('__ESQUEMA__', esquema));
  await c.query('UPDATE general.colegios SET esquema=$1 WHERE id=$2', [esquema, r.id]);
}
console.log(`Listo: esquema general y ${rows.length} colegio(s) al día.`);
await c.end();
