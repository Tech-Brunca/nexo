// Crea las tablas en la base indicada por las variables DB_* (útil para TiDB Cloud u otro MySQL).
// Uso:  node scripts/init-db.mjs        (lee las variables del entorno o de un archivo .env)
import { readFileSync, existsSync } from 'node:fs';
import mysql from 'mysql2/promise';

if (existsSync('.env')) {
  for (const linea of readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const m = linea.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
const e = process.env;
const conn = await mysql.createConnection({
  host: e.DB_HOST, port: Number(e.DB_PORT || 3306), user: e.DB_USER, password: e.DB_PASSWORD,
  database: e.DB_NAME, multipleStatements: true,
  ssl: e.DB_SSL === 'true' ? { minVersion: 'TLSv1.2', rejectUnauthorized: true } : undefined,
});
await conn.query(readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8'));
const [t] = await conn.query('SHOW TABLES');
console.log(`Listo: ${t.length} tablas en ${e.DB_NAME} @ ${e.DB_HOST}`);
await conn.end();
