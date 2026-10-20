import type { APIRoute } from 'astro';
import { csv } from '../lib/util';

export const GET: APIRoute = () =>
  new Response(
    csv([
      ['cedula', 'apellidos', 'nombre', 'fecha_nacimiento', 'genero', 'encargado', 'telefono', 'extranjero', 'subgrupo'],
      ['101110111', 'Pérez Mora', 'Ana', '2010-03-15', 'F', 'María Mora', '88888888', 'no', 'A'],
    ]),
    { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="plantilla-estudiantes.csv"' } },
  );
