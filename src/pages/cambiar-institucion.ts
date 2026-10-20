import type { APIRoute } from 'astro';
import { COOKIE_INST } from '../lib/auth';

export const GET: APIRoute = ({ url, locals, cookies, redirect }) => {
  const id = Number(url.searchParams.get('id'));
  if (locals.instituciones.some((i) => i.id === id)) {
    cookies.set(COOKIE_INST, String(id), { path: '/', httpOnly: true, sameSite: 'lax', maxAge: 365 * 86400 });
  }
  // Al cambiar de institución las secciones elegidas ya no aplican: vuelve a la página sin parámetros
  const volver = url.searchParams.get('volver') || '/';
  const ruta = volver.startsWith('/') && !volver.startsWith('//') ? volver : '/';
  return redirect(/^\/(secciones|evaluaciones)\/\d+/.test(ruta) ? '/' : ruta);
};
