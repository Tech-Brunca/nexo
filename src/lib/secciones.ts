// Crear una sección con los componentes del MEP de su materia (lo usan Secciones y el asistente)
import { one, q, getAjustes } from './db';
import { asegurarComponentes } from './sea';
import { reglaDeMateria, crearEvaluacionesPlan, resumenRegla } from './reac';
import { seccionDuplicada } from './calc';
import { etiquetaSeccion, validarSubgrupo } from './util';

export async function crearSeccion(uid: number, d: { nivel: string; nombre: string; subgrupo?: string; asignatura_id: number | null; nota_aprobatoria?: number | null }) {
  const cfg = await getAjustes(uid);
  const nivel = d.nivel.trim(), nombre = d.nombre.trim();
  const { subgrupo, error } = validarSubgrupo(nivel, d.subgrupo ?? '');
  if (!nivel || !nombre) return { error: 'Indique nivel y nombre.' };
  if (error) return { error };
  const propia = d.asignatura_id && (await q('SELECT id FROM general.asignaturas WHERE id=? AND usuario_id=?', [d.asignatura_id, uid])).length ? d.asignatura_id : null;
  const nueva = { nivel, nombre, subgrupo, asignatura_id: propia, anio: cfg.curso_lectivo };
  if (await seccionDuplicada(uid, nueva)) return { error: `Ya existe la sección ${etiquetaSeccion(nueva)} con esa materia en el curso ${cfg.curso_lectivo}.` };
  // Con la regla del MEP de la materia: nota aprobatoria del reglamento (si no se indicó), componentes y pruebas
  const m = propia ? await reglaDeMateria(uid, propia) : null;
  const creada = await one<any>('INSERT INTO {S}.secciones (usuario_id, nivel, nombre, subgrupo, asignatura_id, nota_aprobatoria, anio) VALUES (?,?,?,?,?,?,?) RETURNING id',
    [uid, nivel, nombre, subgrupo, propia, d.nota_aprobatoria ?? m?.regla.aprobatoria ?? null, cfg.curso_lectivo]);
  await asegurarComponentes(uid, nivel, propia);
  const etq = etiquetaSeccion({ nivel, nombre, subgrupo });
  if (!m) return { id: creada!.id as number, etiqueta: etq, creadas: [] as string[],
    ok: `Sección ${etq} creada.${propia ? ' Su materia no tiene tipo del MEP: elíjalo en Ajustes para crear los componentes solos.' : ''}` };
  const creadas = await crearEvaluacionesPlan(uid, { id: creada!.id, nivel, asignatura_id: propia }, m.regla, m.tc);
  return { id: creada!.id as number, etiqueta: etq, creadas, regla: m.regla,
    ok: `Sección ${etq} creada con los componentes del MEP (${resumenRegla(m.regla)}).` +
      (creadas.length ? ` Se crearon en cada periodo: ${creadas.join('; ')}.` : '') + ' Puede ajustarlos en Componentes y Evaluaciones.' };
}
