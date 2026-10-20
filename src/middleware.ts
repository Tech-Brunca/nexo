import { defineMiddleware } from 'astro:middleware';
import { COOKIE, COOKIE_INST, leerSesion, type Usuario, type Institucion } from './lib/auth';
import { one, q } from './lib/db';

const PUBLICAS = ['/login', '/registro'];
// Páginas que funcionan sin institución activa
const SIN_INST = ['/cuenta', '/admin'];

export const onRequest = defineMiddleware(async (ctx, next) => {
  const ruta = ctx.url.pathname;
  if (PUBLICAS.includes(ruta) || ruta.startsWith('/_astro') || ruta === '/favicon.svg') return next();

  const uid = leerSesion(ctx.cookies.get(COOKIE)?.value);
  const user = uid ? await one<Usuario>('SELECT id, correo, nombre, rol, estado FROM usuarios WHERE id=?', [uid]) : undefined;
  if (!user || user.estado !== 'activo') {
    ctx.cookies.delete(COOKIE, { path: '/' });
    return ctx.redirect('/login?r=' + encodeURIComponent(ruta + ctx.url.search));
  }
  if (ruta.startsWith('/admin') && user.rol !== 'admin') return ctx.redirect('/');

  const instituciones = await q<Institucion>(
    `SELECT i.* FROM instituciones i JOIN usuario_instituciones ui ON ui.institucion_id=i.id WHERE ui.usuario_id=? ORDER BY i.nombre`, [user.id]);
  const elegida = Number(ctx.cookies.get(COOKIE_INST)?.value ?? 0);
  const inst = instituciones.find((i) => i.id === elegida) ?? instituciones[0] ?? null;

  ctx.locals.user = user;
  ctx.locals.instituciones = instituciones;
  ctx.locals.inst = inst;
  if (!inst && !SIN_INST.some((p) => ruta.startsWith(p))) return ctx.redirect('/cuenta?bienvenida=1');
  return next();
});
