import { defineMiddleware } from 'astro:middleware';
import { COOKIE, COOKIE_INST, leerSesion, type Usuario, type Institucion } from './lib/auth';
import { one, q, asegurarEsquema, conEsquema } from './lib/db';

const PUBLICAS = ['/login', '/registro'];
// Páginas que funcionan sin colegio activo
const SIN_COLEGIO = ['/cuenta', '/admin', '/ajustes', '/indicadores', '/plantillas'];

export const onRequest = defineMiddleware(async (ctx, next) => {
  const ruta = ctx.url.pathname;
  if (ruta.startsWith('/_astro') || ruta === '/favicon.svg') return next();
  await asegurarEsquema();
  if (PUBLICAS.includes(ruta)) return conEsquema(null, next);

  const uid = leerSesion(ctx.cookies.get(COOKIE)?.value);
  const user = uid ? await one<Usuario>('SELECT id, correo, nombre, rol, estado FROM general.usuarios WHERE id=?', [uid]) : undefined;
  if (!user || user.estado !== 'activo') {
    ctx.cookies.delete(COOKIE, { path: '/' });
    return ctx.redirect('/login?r=' + encodeURIComponent(ruta + ctx.url.search));
  }
  if (ruta.startsWith('/admin') && user.rol !== 'admin') return ctx.redirect('/');

  // Colegios del docente; el activo determina a qué esquema se conecta toda la petición
  const instituciones = await q<Institucion>(
    `SELECT c.* FROM general.colegios c JOIN general.usuario_colegios uc ON uc.colegio_id=c.id
     WHERE uc.usuario_id=? AND c.esquema IS NOT NULL ORDER BY c.nombre`, [user.id]);
  const elegido = Number(ctx.cookies.get(COOKIE_INST)?.value ?? 0);
  const inst = instituciones.find((i) => i.id === elegido) ?? instituciones[0] ?? null;

  ctx.locals.user = user;
  ctx.locals.instituciones = instituciones;
  ctx.locals.inst = inst;
  if (!inst && !SIN_COLEGIO.some((p) => ruta.startsWith(p))) return ctx.redirect('/cuenta?bienvenida=1');
  return conEsquema(inst?.esquema ?? null, next);
});
