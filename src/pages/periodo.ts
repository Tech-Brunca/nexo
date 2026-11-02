import type { APIRoute } from 'astro';

// Elige el periodo de trabajo (menú lateral): lo guarda en una cookie y vuelve a la página,
// sin el parámetro ?periodo= para que se use el elegido.
export const GET: APIRoute = ({ url, cookies, locals, redirect }) => {
  const id = Number(url.searchParams.get('id') ?? 0);
  if (locals.periodos.some((p) => p.id === id)) cookies.set('rd_per', String(id), { path: '/', sameSite: 'lax', maxAge: 400 * 86400 });
  const volver = url.searchParams.get('volver') ?? '/';
  const destino = volver.startsWith('/') && !volver.startsWith('//') ? new URL(volver, url) : new URL('/', url);
  destino.searchParams.delete('periodo');
  return redirect(destino.pathname + destino.search);
};
