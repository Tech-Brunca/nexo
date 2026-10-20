import type { APIRoute } from 'astro';
import { exec, one } from '../../lib/db';

// Registra en la bitácora que el docente abrió WhatsApp para un estudiante suyo
export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.inst) return new Response('Sin colegio', { status: 400 });
  const b = await request.json().catch(() => null);
  const est = Number(b?.estudiante_id);
  const propio = await one('SELECT id FROM {S}.estudiantes WHERE id=? AND usuario_id=?', [est, locals.user.id]);
  if (!propio) return new Response('No encontrado', { status: 404 });
  await exec('INSERT INTO {S}.comunicados (usuario_id, estudiante_id, tipo, referencia, telefono, mensaje) VALUES (?,?,?,?,?,?)',
    [locals.user.id, est, String(b.tipo ?? '').slice(0, 30), String(b.referencia ?? '').slice(0, 200), String(b.telefono ?? '').slice(0, 30), String(b.mensaje ?? '').slice(0, 2000)]);
  return new Response(null, { status: 204 });
};
