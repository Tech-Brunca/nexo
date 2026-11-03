import type { APIRoute } from 'astro';
import { exec, one } from '../../lib/db';

// Registra un comunicado enviado a un estudiante suyo (WhatsApp, impreso para el cuaderno de comunicaciones
// o ambos). Queda en el historial de comunicados, en la bitácora del día y en el perfil del estudiante.
const MEDIOS = ['whatsapp', 'impreso', 'ambos'];
export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.inst) return new Response('Sin colegio', { status: 400 });
  const b = await request.json().catch(() => null);
  const est = Number(b?.estudiante_id);
  const propio = await one('SELECT id FROM {S}.estudiantes WHERE id=? AND usuario_id=?', [est, locals.user.id]);
  if (!propio) return new Response('No encontrado', { status: 404 });
  const medio = MEDIOS.includes(b.medio) ? b.medio : 'whatsapp';
  // La sección solo se guarda si es del docente y el estudiante está matriculado en ella
  const sec = Number(b.seccion_id) > 0 ? await one<any>(`SELECT s.id FROM {S}.secciones s JOIN {S}.matriculas m ON m.seccion_id=s.id
    WHERE s.id=? AND s.usuario_id=? AND m.estudiante_id=?`, [Number(b.seccion_id), locals.user.id, est]) : null;
  await exec('INSERT INTO {S}.comunicados (usuario_id, estudiante_id, tipo, referencia, telefono, mensaje, medio, seccion_id) VALUES (?,?,?,?,?,?,?,?)',
    [locals.user.id, est, String(b.tipo ?? '').slice(0, 30), String(b.referencia ?? '').slice(0, 200), String(b.telefono ?? '').slice(0, 30),
     String(b.mensaje ?? '').slice(0, 2000), medio, sec?.id ?? null]);
  return new Response(null, { status: 204 });
};
