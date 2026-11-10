// Agregar estudiantes a una sección: uno por uno, desde una lista escrita, desde la lista del SEA (Excel o CSV)
// o desde la plantilla de notas del SEA (Id, Nombre…). Lo usan la sección y el asistente.
import { exec, one } from './db';
import { parseCsv, etiquetaSeccion } from './util';
import { leerExcel, CEDULA_EJEMPLO } from './excel';
import { COLUMNAS_SEA, separarNombre } from './sea';

export async function guardarEstudiante(uid: number, seccionId: number, d: Record<string, string>, subgrupo = '') {
  const ced = (d.cedula || '').replace(/[-–\s]/g, '');
  if (!ced || !d.apellidos || !d.nombre) return false;
  const fecha = (d.fecha_nac || '').trim();
  let fn: string | null = /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha
    : /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.test(fecha) ? fecha.replace(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/, (_, a, b, c) => `${c}-${b.padStart(2, '0')}-${a.padStart(2, '0')}`) : null;
  if (fn && Number.isNaN(new Date(fn + 'T00:00:00').getTime())) fn = null; // fecha imposible: se ignora
  await exec(
    `INSERT INTO {S}.estudiantes (usuario_id, cedula, apellidos, nombre, fecha_nac, genero, encargado, telefono, extranjero)
     VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT (usuario_id, cedula) DO UPDATE SET apellidos=EXCLUDED.apellidos, nombre=EXCLUDED.nombre,
     fecha_nac=COALESCE(EXCLUDED.fecha_nac, {S}.estudiantes.fecha_nac), genero=COALESCE(EXCLUDED.genero, {S}.estudiantes.genero),
     encargado=CASE WHEN EXCLUDED.encargado<>'' THEN EXCLUDED.encargado ELSE {S}.estudiantes.encargado END,
     telefono=CASE WHEN EXCLUDED.telefono<>'' THEN EXCLUDED.telefono ELSE {S}.estudiantes.telefono END, activo=1`,
    [uid, ced, d.apellidos.trim(), d.nombre.trim(), fn, (d.genero || '').trim().slice(0, 1).toUpperCase() || null,
     (d.encargado || '').trim(), (d.telefono || '').trim(), /^(s|si|sí|1|x)$/i.test(d.extranjero || '') ? 1 : 0]);
  const e = await one<any>('SELECT id FROM {S}.estudiantes WHERE usuario_id=? AND cedula=?', [uid, ced]);
  await exec('INSERT INTO {S}.matriculas (estudiante_id, seccion_id, subgrupo) VALUES (?,?,?) ON CONFLICT (estudiante_id, seccion_id) DO UPDATE SET subgrupo=EXCLUDED.subgrupo',
    [e.id, seccionId, subgrupo.trim().toUpperCase().slice(0, 5)]);
  return true;
}

const norm = (c: string) => c.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Importa un archivo de estudiantes: lista del SEA o plantilla de Nexo (.xlsx o .csv), o la plantilla de notas del SEA (.csv) */
export async function importarEstudiantes(uid: number, sec: { id: number; nivel: string; nombre: string; subgrupo: string | null }, archivo: File) {
  const ext = (archivo.name.split('.').pop() ?? '').toLowerCase();
  if (ext === 'xls') return { error: 'El formato .xls (Excel 97-2003) no se puede leer. En Excel use «Guardar como» → «Libro de Excel (.xlsx)».' };
  if (!archivo.size) return { error: 'Elija un archivo de Excel (.xlsx) o CSV.' };
  const filas = ext === 'xlsx' ? await leerExcel(await archivo.arrayBuffer()) : parseCsv(await archivo.text());
  // Plantilla de notas del SEA: Id, Nombre completo y los componentes
  const enc = (filas[0] ?? []).map(norm);
  if (enc.length >= 2 && enc[0] === norm(COLUMNAS_SEA[0]) && enc[1] === norm(COLUMNAS_SEA[1])) {
    let n = 0, malas = 0;
    for (const r of filas.slice(1)) {
      const ced = (r[0] ?? '').trim(), completo = (r[1] ?? '').trim();
      if (!ced && !completo) continue;
      const { apellidos, nombre } = separarNombre(completo);
      try { if (await guardarEstudiante(uid, sec.id, { cedula: ced, apellidos, nombre })) n++; else malas++; } catch { malas++; }
    }
    return { n, ok: `${n} estudiantes importados desde la plantilla del SEA.` + (malas ? ` ${malas} fila(s) omitidas por datos incompletos.` : '') };
  }
  // Lista con columnas: la cabecera puede venir debajo de filas de título (nombre del colegio, fecha…)
  const h = filas.findIndex((r) => r.some((c) => norm(c).startsWith('cedula')));
  const cab = h >= 0 ? filas[h].map(norm) : [];
  const col = (n: string) => cab.findIndex((c) => c.startsWith(n));
  const idx = { cedula: col('cedula'), apellidos: col('apellido'), apellido1: col('primer apellido'), apellido2: col('segundo apellido'), nombre: col('nombre'),
    seccion: col('seccion'), fecha_nac: col('fecha'), genero: col('genero'), encargado: col('encargad'), telefono: col('telefono'), extranjero: col('extranjer'), subgrupo: col('subgrupo') };
  if (idx.cedula < 0 || (idx.apellidos < 0 && idx.apellido1 < 0) || idx.nombre < 0)
    return { error: 'No se reconoció el archivo. Debe ser la lista de estudiantes del SEA (con Cédula, apellidos y Nombre), la plantilla de Nexo o la plantilla de notas del SEA.' };
  const clave = (v: string) => v.replace(/\s/g, '').split(/[-–]/).map((p) => p.replace(/^0+(?=.)/, '').toUpperCase()).join('-');
  // Un medio grupo (7-1A) recibe las filas de su sección completa (7-1)
  const estas = [clave(etiquetaSeccion({ ...sec, subgrupo: null })), clave(etiquetaSeccion(sec))];
  let n = 0, malas = 0, otras = 0;
  for (const r of filas.slice(h + 1)) {
    const d: any = {}; for (const [k, i] of Object.entries(idx)) d[k] = i >= 0 ? r[i] ?? '' : '';
    if (idx.apellidos < 0) d.apellidos = `${d.apellido1.trim()} ${d.apellido2.trim()}`.trim();
    if (d.cedula.replace(/[-–\s]/g, '') === CEDULA_EJEMPLO) continue; // fila de ejemplo de la plantilla
    if (d.seccion.trim() && !estas.includes(clave(d.seccion))) { otras++; continue; }
    try { if (await guardarEstudiante(uid, sec.id, d, d.subgrupo)) n++; else malas++; } catch { malas++; }
  }
  return { n, ok: `${n} estudiantes importados o actualizados.` + (malas ? ` ${malas} fila(s) omitidas por datos incompletos.` : '')
    + (otras ? ` ${otras} fila(s) de otras secciones no se importaron aquí.` : '') };
}
