// «Preparar el curso»: lo que un docente necesita configurar antes de trabajar. Se muestra en Inicio
// mientras falte algo (reemplaza los pasos 1–5 del menú anterior) y en la página Configurar el curso.
import { one } from './db';

export type PasoPreparar = { clave: string; titulo: string; ayuda: string; h: string; listo: boolean; opcional?: boolean };

export async function pasosPreparar(usuarioId: number): Promise<PasoPreparar[]> {
  const c = await one<any>(
    `SELECT
       (SELECT COUNT(*) FROM general.asignaturas WHERE usuario_id=?) AS materias,
       (SELECT COUNT(*) FROM {S}.secciones WHERE usuario_id=?) AS secciones,
       (SELECT COUNT(*) FROM {S}.matriculas m JOIN {S}.secciones s ON s.id=m.seccion_id WHERE s.usuario_id=?) AS matriculas,
       (SELECT COUNT(*) FROM {S}.periodos WHERE usuario_id=? AND fecha_ini IS NOT NULL AND fecha_fin IS NOT NULL) AS periodos,
       (SELECT COUNT(*) FROM {S}.componentes WHERE usuario_id=?) AS componentes,
       (SELECT COUNT(*) FROM general.indicadores WHERE usuario_id=?) AS indicadores,
       (SELECT COUNT(*) FROM {S}.planes WHERE usuario_id=?) AS planes`,
    Array(7).fill(usuarioId));
  const n = (k: string) => Number(c?.[k] ?? 0);
  return [
    { clave: 'materias', titulo: 'Materias', ayuda: 'Sus materias con el tipo del MEP', h: '/ajustes', listo: n('materias') > 0 },
    { clave: 'secciones', titulo: 'Secciones', ayuda: 'Grupos, subgrupos y su materia', h: '/secciones', listo: n('secciones') > 0 },
    { clave: 'estudiantes', titulo: 'Estudiantes', ayuda: 'Lista de cada sección (a mano o del SEA)', h: '/estudiantes', listo: n('matriculas') > 0 },
    { clave: 'periodos', titulo: 'Periodos', ayuda: 'Fechas del I y II periodo', h: '/periodos', listo: n('periodos') > 0 },
    { clave: 'componentes', titulo: 'Componentes', ayuda: 'Porcentajes de cada materia y nivel', h: '/componentes', listo: n('componentes') > 0 },
    { clave: 'indicadores', titulo: 'Indicadores', ayuda: 'Indicadores del trabajo cotidiano', h: '/indicadores', listo: n('indicadores') > 0 },
    { clave: 'plan', titulo: 'Plan anual', ayuda: 'Cargar el plan para ver el avance', h: '/plan', listo: n('planes') > 0, opcional: true },
  ];
}
