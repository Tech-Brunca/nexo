import type { APIRoute } from 'astro';
import { one } from '../../lib/db';

// Escudo del colegio: solo para docentes de ese colegio o administradores.
export const GET: APIRoute = async ({ params, locals }) => {
  const id = Number(params.id);
  const permitido = locals.user?.rol === 'admin' || locals.instituciones?.some((i) => i.id === id);
  if (!permitido) return new Response('No encontrado', { status: 404 });
  const l = await one<any>('SELECT imagen, tipo FROM general.colegio_logos WHERE colegio_id=?', [id]);
  if (!l) return new Response('No encontrado', { status: 404 });
  return new Response(l.imagen, { headers: { 'Content-Type': l.tipo, 'Cache-Control': 'private, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' } });
};
