import type { APIRoute } from 'astro';
import { marcarTema } from '../../lib/plan';
import { hoy } from '../../lib/util';

// Marca o desmarca un tema del plan anual como visto en una sección (desde el plan o la bitácora)
export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.inst) return Response.json({ error: 'Sin colegio' }, { status: 400 });
  const b = await request.json().catch(() => null);
  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(b?.fecha ?? '') ? b.fecha : hoy();
  try {
    await marcarTema(locals.user.id, Number(b?.seccion_id), Number(b?.tema_id), !!b?.visto, fecha);
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
};
