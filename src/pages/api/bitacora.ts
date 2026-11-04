import type { APIRoute } from 'astro';
import { guardarAnotacion, borrarAnotacion } from '../../lib/bitacora';

// Guardado automático de la bitácora (minuta del día o anotación sobre estudiantes)
export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.inst) return Response.json({ error: 'Sin colegio' }, { status: 400 });
  const b = await request.json().catch(() => null);
  if (!b) return Response.json({ error: 'Datos no válidos' }, { status: 400 });
  try {
    const r = await guardarAnotacion(locals.user.id, {
      id: Number(b.id) || undefined, seccion_id: Number(b.seccion_id), fecha: String(b.fecha ?? ''),
      tipo: b.tipo === 'estudiante' || b.tipo === 'plan' ? b.tipo : 'minuta', texto: String(b.texto ?? ''),
      estudiantes: Array.isArray(b.estudiantes) ? b.estudiantes.map(Number).filter(Boolean) : [],
    });
    return Response.json(r);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
};

export const DELETE: APIRoute = async ({ url, locals }) => {
  if (!locals.inst) return new Response(null, { status: 400 });
  await borrarAnotacion(locals.user.id, Number(url.searchParams.get('id')));
  return new Response(null, { status: 204 });
};
