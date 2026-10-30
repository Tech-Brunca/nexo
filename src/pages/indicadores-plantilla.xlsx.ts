import type { APIRoute } from 'astro';
import { q } from '../lib/db';
import { plantillaIndicadores } from '../lib/excel';

export const GET: APIRoute = async ({ locals, url }) => {
  const asignaturas = (await q<any>('SELECT nombre FROM general.asignaturas WHERE usuario_id=? ORDER BY nombre', [locals.user.id])).map((a) => a.nombre);
  const archivo = await plantillaIndicadores({
    colegio: locals.inst?.nombre ?? '', codigo: locals.inst?.codigo ?? '', docente: locals.user.nombre,
    asignaturas, nivel: url.searchParams.get('nivel') ?? '',
  });
  return new Response(archivo, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="plantilla-indicadores.xlsx"',
    },
  });
};
