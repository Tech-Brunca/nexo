import { createHmac, timingSafeEqual, randomBytes, scrypt as _scrypt } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(_scrypt) as (p: string, s: Buffer, n: number) => Promise<Buffer>;
// En línea (DATABASE_URL definida) se exige una clave propia: el código es público y la
// clave de ejemplo permitiría falsificar sesiones.
const secret = () => {
  const s = process.env.SESSION_SECRET ?? '';
  if (process.env.DATABASE_URL && (s.length < 16 || s === 'cambie-esta-clave-secreta'))
    throw new Error('Falta SESSION_SECRET (mínimo 16 caracteres) en las variables de entorno.');
  return s || 'cambie-esta-clave-secreta';
};
export const COOKIE = 'rd_sesion';
export const COOKIE_INST = 'rd_inst';
export const DURACION_H = 12;

export type Usuario = { id: number; correo: string; nombre: string; rol: 'admin' | 'docente'; estado: string };
export type Institucion = { id: number; nombre: string; codigo: string; direccion_regional: string; circuito: string; director: string; esquema: string };

// ── Contraseñas (scrypt con sal aleatoria) ─────────────────────────────────
export async function hashClave(clave: string) {
  const sal = randomBytes(16);
  const h = await scrypt(clave, sal, 64);
  return `scrypt$${sal.toString('hex')}$${h.toString('hex')}`;
}
export async function verificarClave(clave: string, guardado: string) {
  const [alg, salHex, hHex] = (guardado || '').split('$');
  if (alg !== 'scrypt' || !salHex || !hHex) return false;
  const h = await scrypt(clave, Buffer.from(salHex, 'hex'), 64);
  const esperado = Buffer.from(hHex, 'hex');
  return esperado.length === h.length && timingSafeEqual(esperado, h);
}
export const claveValida = (c: string) => c.length >= 8;

// ── Sesión firmada: "uid:vence.firma" ──────────────────────────────────────
function firmar(valor: string) {
  return `${valor}.${createHmac('sha256', secret()).update(valor).digest('hex')}`;
}
export function nuevaSesion(uid: number) {
  return firmar(`${uid}:${Date.now() + DURACION_H * 3600 * 1000}`);
}
/** Devuelve el id de usuario si la cookie es válida y no venció */
export function leerSesion(token: string | undefined): number | null {
  if (!token) return null;
  const i = token.lastIndexOf('.');
  if (i < 0) return null;
  const a = Buffer.from(firmar(token.slice(0, i))), b = Buffer.from(token);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const [uid, vence] = token.slice(0, i).split(':').map(Number);
  return Number.isFinite(uid) && vence > Date.now() ? uid : null;
}

/** Correos que entran como administradores (variable ADMIN_EMAILS, separados por coma) */
export const esCorreoAdmin = (correo: string) =>
  (process.env.ADMIN_EMAILS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean).includes(correo.toLowerCase());
