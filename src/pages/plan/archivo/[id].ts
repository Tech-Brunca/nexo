import type { APIRoute } from 'astro';
import { one } from '../../../lib/db';

// Descarga el archivo original del plan anual (solo su dueño)
export const GET: APIRoute = async ({ params, locals }) => {
  const p = await one<any>('SELECT archivo, archivo_nombre, archivo_tipo FROM {S}.planes WHERE id=? AND usuario_id=?', [Number(params.id), locals.user.id]);
  if (!p?.archivo) return new Response('No encontrado', { status: 404 });
  return new Response(p.archivo, {
    headers: { 'Content-Type': p.archivo_tipo || 'application/octet-stream',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(p.archivo_nombre || 'plan-anual')}` },
  });
};
