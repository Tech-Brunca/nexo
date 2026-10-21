import type { APIRoute } from 'astro';
import { plantillaEstudiantes } from '../lib/excel';
import { hoy } from '../lib/util';

export const GET: APIRoute = async ({ locals }) => {
  const [a, m, d] = hoy().split('-');
  return new Response(await plantillaEstudiantes(locals.inst?.nombre ?? '', `${Number(d)}/${Number(m)}/${a}`), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="plantilla-estudiantes.xlsx"',
    },
  });
};
