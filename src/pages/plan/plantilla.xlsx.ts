import type { APIRoute } from 'astro';
import { plantillaPlan } from '../../lib/plan';
import { getAjustes } from '../../lib/db';

export const GET: APIRoute = async ({ locals }) => {
  const anio = (await getAjustes(locals.user.id)).curso_lectivo || new Date().getFullYear();
  return new Response(await plantillaPlan(anio), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="plantilla-plan-anual.xlsx"',
    },
  });
};
