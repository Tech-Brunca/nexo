import type { APIRoute } from 'astro';
import { one } from '../lib/db';
import { PAGINAS_SECCION } from '../lib/menu';

// Cambia la sección activa (selector de la barra superior): la guarda en la cookie y vuelve a la misma
// página con esa sección. Desde una página que no es de sección, abre «Pasar lista» de esa sección.
export const GET: APIRoute = async ({ url, cookies, locals, redirect }) => {
  const id = Number(url.searchParams.get('id') ?? 0);
  const mia = id > 0 && (await one('SELECT 1 FROM {S}.secciones WHERE id=? AND usuario_id=?', [id, locals.user.id]));
  if (!mia) return redirect('/');
  cookies.set('rd_sec', String(id), { path: '/', sameSite: 'lax', maxAge: 400 * 86400 });
  const volver = url.searchParams.get('volver') ?? '/';
  const destino = volver.startsWith('/') && !volver.startsWith('//') ? new URL(volver, url) : new URL('/', url);
  if (PAGINAS_SECCION.includes(destino.pathname)) {
    destino.searchParams.set('seccion', String(id));
    return redirect(destino.pathname + destino.search);
  }
  if (/^\/(secciones|estudiantes)\/\d+$/.test(destino.pathname) || destino.pathname.startsWith('/plan')) {
    destino.searchParams.set('seccion', String(id));
    return redirect(/^\/secciones\/\d+$/.test(destino.pathname) ? `/secciones/${id}` : destino.pathname + destino.search);
  }
  return redirect(`/asistencia?seccion=${id}`);
};
