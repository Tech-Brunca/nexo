// Menú lateral: «Mis secciones» con las que tienen clase hoy y los pendientes de cada una.
// «Clase hoy» se deduce de la asistencia: si se pasó lista el mismo día de la semana anterior
// (o dos semanas antes, por si hubo feriado), hoy toca esa sección. No hace falta un horario.
// Los conteos se guardan unos minutos por docente para no consultar en cada página;
// cualquier cambio (POST) del docente los borra (ver middleware).
import { q, esquemaActual, getAjustes } from './db';
import { etiquetaSeccion } from './util';

/** Páginas que trabajan sobre una sección: sin ?seccion= abren la sección activa (cookie rd_sec) */
export const PAGINAS_SECCION = ['/asistencia', '/evaluaciones', '/notas', '/anual', '/sea', '/comunicados', '/bitacora'];

export type SeccionMenu = {
  id: number;
  etiqueta: string;
  asignatura: string | null;
  color: string;
  tocaHoy: boolean;
  listaHoy: boolean;
  ultima: string | null;
  /** Pendientes: lista de hoy sin pasar, minuta sin escribir, evaluaciones sin calificar; alerta aparte */
  lista: boolean;
  minuta: boolean;
  porCalificar: number;
  alerta: number;
  pendientes: number;
  detalle: string;
};

// Colores para distinguir las secciones en el menú (contraste suficiente sobre el azul marino)
const COLORES = ['#49E1FF', '#7fe3a8', '#ffd27a', '#f4a3c0', '#b9a7ff', '#ff9f80', '#9be7d8', '#e6e97a'];

const cache = new Map<string, { t: number; datos: SeccionMenu[] }>();
const VIGENCIA = 3 * 60 * 1000;

/** Borra los conteos guardados de un docente (se llama cuando guarda algo) */
export function invalidarMenu(usuarioId: number) {
  for (const k of cache.keys()) if (k.split('|')[1] === String(usuarioId)) cache.delete(k);
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

export async function seccionesMenu(usuarioId: number, fecha: string, periodoId: number | null): Promise<SeccionMenu[]> {
  const clave = `${esquemaActual()}|${usuarioId}|${fecha}|${periodoId ?? 0}`;
  const guardado = cache.get(clave);
  if (guardado && Date.now() - guardado.t < VIGENCIA) return guardado.datos;

  const aj = await getAjustes(usuarioId);
  const filas = await q<any>(
    `SELECT s.id, s.nivel, s.nombre, s.subgrupo, a.nombre AS asignatura,
       EXISTS (SELECT 1 FROM {S}.lecciones_dia d WHERE d.seccion_id=s.id AND d.fecha IN (?::date - 7, ?::date - 14) AND d.cantidad > 0) AS toca_hoy,
       EXISTS (SELECT 1 FROM {S}.lecciones_dia d WHERE d.seccion_id=s.id AND d.fecha=?::date) AS lista_hoy,
       (SELECT MAX(d.fecha) FROM {S}.lecciones_dia d WHERE d.seccion_id=s.id AND d.fecha <= ?::date AND d.cantidad > 0) AS ultima,
       EXISTS (SELECT 1 FROM {S}.lecciones_dia d WHERE d.seccion_id=s.id AND d.cantidad > 0
                 AND d.fecha = (SELECT MAX(x.fecha) FROM {S}.lecciones_dia x WHERE x.seccion_id=s.id AND x.fecha <= ?::date AND x.fecha > ?::date - 7 AND x.cantidad > 0)
                 AND NOT EXISTS (SELECT 1 FROM {S}.bitacora b WHERE b.seccion_id=s.id AND b.fecha=d.fecha AND b.tipo='minuta')) AS sin_minuta
     FROM {S}.secciones s LEFT JOIN general.asignaturas a ON a.id=s.asignatura_id
     WHERE s.usuario_id=? ORDER BY length(s.nivel), s.nivel, s.nombre, s.subgrupo NULLS FIRST`,
    [fecha, fecha, fecha, fecha, fecha, fecha, usuarioId]);
  // La minuta solo se cuenta como pendiente si el docente usa la bitácora
  const usaBitacora = (await q<any>(`SELECT 1 FROM {S}.bitacora WHERE usuario_id=? AND tipo='minuta' LIMIT 1`, [usuarioId])).length > 0;
  const evals = periodoId ? await q<any>(
    `SELECT e.seccion_id, COUNT(*) AS n FROM {S}.evaluaciones e JOIN {S}.secciones s ON s.id=e.seccion_id
     WHERE s.usuario_id=? AND e.periodo_id=? AND (e.fecha IS NULL OR e.fecha <= ?::date)
       AND (SELECT COUNT(*) FROM {S}.matriculas m JOIN {S}.estudiantes x ON x.id=m.estudiante_id WHERE m.seccion_id=e.seccion_id AND x.activo=1)
         > (SELECT COUNT(*) FROM {S}.notas n WHERE n.evaluacion_id=e.id AND (n.puntos IS NOT NULL OR n.no_entrego))
         + (SELECT COUNT(DISTINCT v.estudiante_id) FROM {S}.valoraciones v WHERE v.evaluacion_id=e.id AND v.nivel IS NOT NULL)
     GROUP BY e.seccion_id`, [usuarioId, periodoId, fecha]) : [];
  const alertas = await q<any>(
    `SELECT seccion_id, COUNT(*) AS n FROM (
       SELECT a.estudiante_id, a.seccion_id FROM {S}.asistencia a JOIN {S}.secciones s ON s.id=a.seccion_id
       WHERE s.usuario_id=? AND a.tipo='AI' AND a.fecha BETWEEN ?::date - ?::int AND ?::date
       GROUP BY a.estudiante_id, a.seccion_id HAVING SUM(a.lecciones) >= ?) t GROUP BY seccion_id`,
    [usuarioId, fecha, aj.alerta_dias, fecha, aj.alerta_ausencias]);

  const datos = filas.map((s, i): SeccionMenu => {
    const porCalificar = Number(evals.find((e) => e.seccion_id === s.id)?.n ?? 0);
    const alerta = Number(alertas.find((a) => a.seccion_id === s.id)?.n ?? 0);
    const tocaHoy = !!s.toca_hoy;
    const lista = tocaHoy && !s.lista_hoy;
    const minuta = usaBitacora && !!s.sin_minuta;
    const partes = [
      lista && 'lista de hoy sin pasar',
      minuta && 'minuta sin escribir',
      porCalificar > 0 && plural(porCalificar, 'evaluación sin calificar', 'evaluaciones sin calificar'),
      alerta > 0 && plural(alerta, 'estudiante en alerta temprana', 'estudiantes en alerta temprana'),
    ].filter(Boolean) as string[];
    const cuando = tocaHoy || s.lista_hoy ? 'clase hoy' : s.ultima ? `última lista: ${s.ultima.split('-').reverse().slice(0, 2).join('/')}` : 'sin listas todavía';
    return {
      id: s.id, etiqueta: etiquetaSeccion(s), asignatura: s.asignatura, color: COLORES[i % COLORES.length],
      tocaHoy: tocaHoy || !!s.lista_hoy, listaHoy: !!s.lista_hoy, ultima: s.ultima,
      lista, minuta, porCalificar, alerta,
      pendientes: (lista ? 1 : 0) + (minuta ? 1 : 0) + porCalificar,
      detalle: `${etiquetaSeccion(s)}${s.asignatura ? ` · ${s.asignatura}` : ''} · ${cuando}${partes.length ? ' · ' + partes.join(', ') : ' · al día'}`,
    };
  });
  cache.set(clave, { t: Date.now(), datos });
  return datos;
}

/**
 * Orden del menú: primero las que tienen clase hoy; si son menos de tres, se completa con las de
 * lista más reciente (ayer, antier…); al final las que nunca han tenido lista.
 */
export function ordenarParaMenu(secciones: SeccionMenu[]) {
  const hoyS = secciones.filter((s) => s.tocaHoy);
  const resto = secciones.filter((s) => !s.tocaHoy)
    .sort((a, b) => (b.ultima ?? '').localeCompare(a.ultima ?? ''));
  return [...hoyS, ...resto];
}
