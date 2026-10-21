import type { APIRoute } from 'astro';
import { csv } from '../lib/util';

export const GET: APIRoute = () =>
  new Response(
    csv([
      ['Cédula', 'Primer apellido', 'Segundo apellido', 'Nombre', 'Sección', 'Encargado', 'Teléfono (móvil)'],
      ['1-0000-0000', 'Pérez', 'Mora', 'Ana', '7-1', 'María Mora', '8888-8888'],
    ]),
    { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="plantilla-estudiantes.csv"' } },
  );
