// Plan anual: lectura del Excel o Word, interpretación de las columnas, estado de cada sección
// (por dónde debería ir y qué tiene atrasado) y registro automático de atrasos en la bitácora.
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { q, one, exec, transaccion, preparar, esquemaActual } from './db';

export type Tema = { id: number; plan_id: number; orden: number; unidad: string; tema: string; inicio: string | null; fin: string | null; horas: number | null };
export type Tabla = { nombre: string; filas: string[][] };

// ── Lectura de archivos ───────────────────────────────────────────────────────
const iso = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;

function textoCelda(v: any): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return iso(v);
  if (typeof v === 'object') {
    if ('result' in v) return textoCelda(v.result);
    if ('richText' in v) return v.richText.map((r: any) => r.text).join('');
    if ('text' in v) return String(v.text);
    if ('error' in v) return '';
  }
  return String(v);
}

/** Todas las hojas de un .xlsx (las celdas combinadas repiten el valor; las fechas quedan AAAA-MM-DD) */
export async function tablasExcel(datos: ArrayBuffer): Promise<Tabla[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(datos);
  return wb.worksheets.map((ws) => {
    const filas: string[][] = [];
    const ancho = Math.min(ws.columnCount, 80);
    ws.eachRow({ includeEmpty: false }, (row) => {
      const r: string[] = [];
      for (let i = 1; i <= ancho; i++) r.push(textoCelda(row.getCell(i).value).replace(/\s+/g, ' ').trim());
      if (r.some((c) => c)) filas.push(r);
    });
    return { nombre: ws.name, filas };
  }).filter((t) => t.filas.length > 1);
}

const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decodificar = (s: string) => s.replace(/&(amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);/gi, (m, e) =>
  e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENT[e.toLowerCase()] ?? m);

/** Tablas de un .docx (solo las de primer nivel; celdas combinadas a lo ancho y a lo alto se rellenan) */
export async function tablasWord(datos: ArrayBuffer): Promise<Tabla[]> {
  const zip = await JSZip.loadAsync(datos);
  const xml = await zip.file('word/document.xml')?.async('string');
  if (!xml) throw new Error('El archivo no parece un documento de Word (.docx).');
  type Celda = { texto: string; span: number; continua: boolean };
  const tablas: Celda[][][] = [];
  let prof = 0, fila: Celda[] | null = null, celda: Celda | null = null, inicioT = -1;
  const re = /<(\/?)w:(tbl|tr|tc|p|t|gridSpan|vMerge|tab|br)\b([^>]*?)(\/?)>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const [, cierre, tag, attrs, auto] = m;
    if (tag === 'tbl') { if (cierre) prof--; else { prof++; if (prof === 1) tablas.push([]); } continue; }
    if (prof !== 1 && !(celda && prof > 1 && (tag === 't' || tag === 'p'))) continue;
    if (tag === 'tr' && prof === 1) { if (cierre) { if (fila) tablas[tablas.length - 1].push(fila); fila = null; } else fila = []; }
    else if (tag === 'tc' && prof === 1) { if (cierre) { if (celda && fila) fila.push(celda); celda = null; } else celda = { texto: '', span: 1, continua: false }; }
    else if (!celda) continue;
    else if (tag === 'gridSpan') celda.span = Math.max(1, Number(/w:val="(\d+)"/.exec(attrs)?.[1] ?? 1));
    else if (tag === 'vMerge') celda.continua = !/w:val="restart"/.test(attrs);
    else if (tag === 't') { if (!cierre && !auto) inicioT = re.lastIndex; else if (cierre && inicioT >= 0) { celda.texto += decodificar(xml.slice(inicioT, m.index)); inicioT = -1; } }
    else if ((tag === 'p' && cierre) || tag === 'br' || tag === 'tab') celda.texto += tag === 'tab' ? ' ' : '\n';
  }
  return tablas.map((t, i) => {
    const filas: string[][] = [];
    for (const f of t) {
      const r: string[] = [];
      for (const c of f) {
        const col = r.length;
        // Las líneas repetidas seguidas (pasa al combinar celdas) quedan una sola vez
        const limpio = c.texto.replace(/[ \t]+/g, ' ').split('\n').map((l) => l.trim()).filter((l, k, arr) => l && l !== arr[k - 1]).join('\n');
        const texto = c.continua ? (filas[filas.length - 1]?.[col] ?? '') : limpio;
        r.push(texto);
        for (let k = 1; k < c.span; k++) r.push(texto);
      }
      if (r.some((x) => x)) filas.push(r);
    }
    const ancho = Math.max(0, ...filas.map((f) => f.length));
    return { nombre: `Tabla ${i + 1}`, filas: filas.map((f) => [...f, ...Array(ancho - f.length).fill('')]) };
  }).filter((t) => t.filas.length > 1);
}

export async function leerPlan(nombre: string, datos: ArrayBuffer): Promise<Tabla[]> {
  const ext = nombre.toLowerCase().split('.').pop();
  if (ext === 'xlsx' || ext === 'xlsm') return tablasExcel(datos);
  if (ext === 'docx') return tablasWord(datos);
  if (ext === 'xls' || ext === 'doc') throw new Error('Ese es el formato antiguo de Office. Ábralo y guárdelo como .xlsx (Excel) o .docx (Word).');
  throw new Error('Suba el plan en Excel (.xlsx) o Word (.docx), o use la plantilla de Nexo.');
}

// ── Columnas ──────────────────────────────────────────────────────────────────
export const CAMPOS: [string, string][] = [
  ['', 'No usar'], ['unidad', 'Unidad / RA'], ['tema', 'Tema / saberes'], ['inicio', 'Fecha de inicio'], ['fin', 'Fecha de fin'],
  ['fechas', 'Fechas (rango)'], ['mes', 'Mes'], ['semana', 'Semana(s)'], ['horas', 'Horas'],
];
const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Adivina la fila de encabezados y qué es cada columna */
export function adivinar(filas: string[][]): { cab: number; campos: string[] } {
  const claves: [RegExp, string][] = [
    [/^(unidad|resultado|r\.?a\.?\b|ra\s*\d|modulo|eje|competencia)/, 'unidad'],
    [/(saber|tema|contenido|indicador|aprendizaje|actividad)/, 'tema'],
    [/(inicio|desde|empieza)/, 'inicio'], [/(fin\b|final|hasta|termina)/, 'fin'],
    [/(fecha|periodo de ejecucion|cronograma|tiempo)/, 'fechas'], [/^mes/, 'mes'], [/semana/, 'semana'], [/(hora|lecciones)/, 'horas'],
  ];
  let mejor = { cab: 0, puntos: -1, campos: [] as string[] };
  for (let i = 0; i < Math.min(filas.length, 10); i++) {
    const campos = filas[i].map((c) => { const t = sinTildes(c); return claves.find(([re]) => re.test(t))?.[1] ?? ''; });
    // una columna por campo (la primera que coincide)
    const vistos = new Set<string>();
    const unicos = campos.map((c) => (c && !vistos.has(c) ? (vistos.add(c), c) : ''));
    const puntos = unicos.filter(Boolean).length;
    if (puntos > mejor.puntos) mejor = { cab: i, puntos, campos: unicos };
  }
  return mejor.puntos > 0 ? { cab: mejor.cab, campos: mejor.campos } : { cab: 0, campos: filas[0]?.map(() => '') ?? [] };
}

// ── Fechas ────────────────────────────────────────────────────────────────────
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'setiembre', 'octubre', 'noviembre', 'diciembre'];
const mesDe = (t: string) => { const s = sinTildes(t).replace('septiembre', 'setiembre'); return MESES.findIndex((m) => s.startsWith(m.slice(0, 3))); };
const fin_de_mes = (a: number, m: number) => iso(new Date(Date.UTC(a, m + 1, 0)));
const sumar = (f: string, dias: number) => iso(new Date(Date.parse(f + 'T00:00:00Z') + dias * 86400000));

/** Fechas que aparecen en un texto: «03/02/2026», «3-2-26», «3/2», «2026-02-03», «3 de febrero» */
function fechasEn(t: string, anio: number): string[] {
  const out: string[] = [];
  const re = /(\d{4})-(\d{1,2})-(\d{1,2})|(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{2,4}))?|(\d{1,2})\s*(?:de\s+)?(ene|feb|mar|abr|may|jun|jul|ago|set|sep|oct|nov|dic)[a-z]*\.?(?:\s*(?:de|del)?\s*(\d{4}))?/gi;
  let m: RegExpExecArray | null;
  const s = sinTildes(t);
  while ((m = re.exec(s))) {
    let a: number, mes: number, d: number;
    if (m[1]) { a = +m[1]; mes = +m[2] - 1; d = +m[3]; }
    else if (m[4]) { d = +m[4]; mes = +m[5] - 1; a = m[6] ? (m[6].length === 2 ? 2000 + +m[6] : +m[6]) : anio; }
    else { d = +m[7]; mes = mesDe(m[8]); a = m[9] ? +m[9] : anio; }
    if (mes < 0 || mes > 11 || d < 1 || d > 31) continue;
    out.push(iso(new Date(Date.UTC(a, mes, d))));
  }
  return out;
}

/**
 * Formato de cuadrícula del MEP (plantilla de Educación Técnica): una fila con los meses (celdas combinadas),
 * debajo los números de semana de cada mes, y cada RA marcado con 1 (o 0.5) en las semanas que se trabaja.
 * Devuelve null si la tabla no tiene ese formato.
 */
export function cuadricula(filas: string[][], anio: number) {
  // Fila de meses: la que tiene más columnas con nombre de mes
  let fm = -1, mejor = 0;
  filas.slice(0, 25).forEach((f, i) => { const n = f.filter((c) => c && mesDe(c) >= 0 && c.length <= 12).length; if (n > mejor) { mejor = n; fm = i; } });
  if (fm < 0 || mejor < 4 || !filas[fm + 1]) return null;
  // Mes y número de semana de cada columna (el mes se arrastra si la celda combinada viene vacía)
  const semanas = new Map<number, { mes: number; sem: number }>();
  let mes = -1;
  filas[fm].forEach((c, j) => {
    const m = c && c.length <= 12 ? mesDe(c) : -1;
    if (m >= 0) mes = m;
    const sem = Number(filas[fm + 1][j]);
    if (mes >= 0 && Number.isInteger(sem) && sem >= 1 && sem <= 5) semanas.set(j, { mes, sem });
  });
  if (semanas.size < 8) return null;
  const primerLunes = (m: number) => { const d = new Date(Date.UTC(anio, m, 1)); d.setUTCDate(1 + ((8 - d.getUTCDay()) % 7)); return iso(d); };
  const inicioSem = (x: { mes: number; sem: number }) => sumar(primerLunes(x.mes), (x.sem - 1) * 7);
  const colsSem = [...semanas.keys()];
  const primeraSem = Math.min(...colsSem);
  // Columna de texto: la que más texto largo tiene antes de las semanas
  const cuerpo = filas.slice(fm + 2);
  let ct = 0, maxTxt = 0;
  for (let j = 0; j < primeraSem; j++) { const n = cuerpo.filter((f) => (f[j] ?? '').length > 15).length; if (n > maxTxt) { maxTxt = n; ct = j; } }
  const temas: { unidad: string; tema: string; inicio: string | null; fin: string | null; horas: number | null }[] = [];
  let unidad = '';
  for (const f of cuerpo) {
    const texto = (f[ct] ?? '').trim();
    if (!texto) continue;
    if (/^total/i.test(sinTildes(texto))) break;
    const marcadas = colsSem.filter((j) => Number((f[j] ?? '').replace(',', '.')) > 0).sort((a, b) => a - b);
    if (/^unidad\b/i.test(sinTildes(texto)) && !marcadas.length) { unidad = texto.split('\n')[0].replace(/\s+\d+\s*horas?\b.*$/i, '').trim(); continue; }
    if (!marcadas.length) continue;
    const horasTxt = f.slice(Math.max(...colsSem) + 1).find((c) => /\d+\s*horas?/i.test(c)) ?? '';
    const h = Number(horasTxt.match(/(\d+(?:[.,]\d+)?)\s*horas?/i)?.[1]?.replace(',', '.'));
    temas.push({ unidad, tema: texto.replace(/\s*\n\s*/g, ' '), inicio: inicioSem(semanas.get(marcadas[0])!),
      fin: sumar(inicioSem(semanas.get(marcadas[marcadas.length - 1])!), 4), horas: Number.isFinite(h) && h > 0 ? h : null });
  }
  return temas.length ? temas : null;
}

/** Hoja o tabla que más se parece al plan de esa subárea (por el nombre que aparece en el encabezado) */
export function tablaSugerida(tablas: Tabla[], asignatura: string | null) {
  const palabras = sinTildes(asignatura ?? '').split(/[^a-z]+/).filter((w) => w.length > 3);
  let mejor = 0, puntos = -1;
  tablas.forEach((t, i) => {
    const enc = sinTildes(t.nombre + ' ' + t.filas.slice(0, 9).flat().join(' '));
    // La fila «Subárea:» pesa más que el resto del encabezado; una hoja con cuadrícula de semanas suma
    const sub = sinTildes(t.filas.slice(0, 12).find((f) => f.some((c) => /subarea/i.test(sinTildes(c))))?.join(' ') ?? '');
    const p = palabras.filter((w) => sub.includes(w)).length * 20 + palabras.filter((w) => enc.includes(w)).length * 5
      + (cuadricula(t.filas, 2026) ? 3 : 0) + (t.filas.length > 5 ? 1 : 0);
    if (p > puntos) { puntos = p; mejor = i; }
  });
  return mejor;
}

/** Fila de la tabla + columnas elegidas → tema con fechas (o sin fechas si no se pudieron leer) */
export function interpretar(filas: string[][], cab: number, campos: string[], anio: number, inicioCurso: string) {
  const col = (c: string) => campos.indexOf(c);
  const val = (f: string[], c: string) => (col(c) >= 0 ? (f[col(c)] ?? '').trim() : '');
  const temas: { unidad: string; tema: string; inicio: string | null; fin: string | null; horas: number | null }[] = [];
  let unidad = '';
  for (const f of filas.slice(cab + 1)) {
    const u = val(f, 'unidad'), t = val(f, 'tema');
    if (u) unidad = u;
    if (!t && !u) continue;
    if (!t && u && !val(f, 'inicio') && !val(f, 'fechas') && !val(f, 'mes') && !val(f, 'semana')) continue; // fila de título de unidad
    let inicio: string | null = null, fin: string | null = null;
    const fi = fechasEn(val(f, 'inicio'), anio)[0], ff = fechasEn(val(f, 'fin'), anio).pop();
    const rango = fechasEn(val(f, 'fechas'), anio);
    if (fi || ff) { inicio = fi ?? null; fin = ff ?? null; }
    else if (rango.length) { inicio = rango[0]; fin = rango[rango.length - 1]; }
    else {
      // Meses: «Febrero», «Febrero - marzo», «Febrero a abril»
      const texto = val(f, 'mes') || val(f, 'fechas');
      const meses = sinTildes(texto).split(/[^a-zñ]+/).filter((w) => w.length >= 3 && w !== 'del').map(mesDe).filter((m) => m >= 0);
      if (meses.length) { inicio = iso(new Date(Date.UTC(anio, meses[0], 1))); fin = fin_de_mes(anio, meses[meses.length - 1]); }
      // Semanas del curso: «Semana 3», «3-5», «Semanas 3 a 5»
      const sem = (val(f, 'semana').match(/\d+/g) ?? []).map(Number);
      if (!meses.length && sem.length) { inicio = sumar(inicioCurso, (sem[0] - 1) * 7); fin = sumar(inicioCurso, sem[sem.length - 1] * 7 - 3); }
    }
    if (inicio && fin && fin < inicio) [inicio, fin] = [fin, inicio];
    const horas = Number((val(f, 'horas').match(/\d+([.,]\d+)?/)?.[0] ?? '').replace(',', '.'));
    temas.push({ unidad, tema: t || u, inicio, fin, horas: Number.isFinite(horas) && horas > 0 ? horas : null });
  }
  // Solo inicio: termina el día antes del siguiente tema (o una semana después)
  temas.forEach((t, i) => {
    if (t.inicio && !t.fin) { const sig = temas.slice(i + 1).find((x) => x.inicio && x.inicio > t.inicio!); t.fin = sig ? sumar(sig.inicio!, -1) : sumar(t.inicio, 6); }
    if (!t.inicio && t.fin) t.inicio = t.fin;
  });
  return temas;
}

// ── Plantilla ─────────────────────────────────────────────────────────────────
export async function plantillaPlan(anio: number) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Plan anual', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = [{ header: 'Unidad / Resultado de aprendizaje', width: 38 }, { header: 'Tema / saberes esenciales', width: 52 },
    { header: 'Fecha de inicio', width: 15 }, { header: 'Fecha de fin', width: 15 }, { header: 'Horas', width: 9 }];
  const borde = { style: 'thin' as const };
  ws.getRow(1).eachCell((c) => {
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0A3D91' } };
    c.alignment = { vertical: 'middle', wrapText: true };
    c.border = { top: borde, left: borde, bottom: borde, right: borde };
  });
  ws.getRow(1).height = 30;
  const d = (m: number, dia: number) => new Date(Date.UTC(anio, m - 1, dia));
  const ejemplo: [string, string, Date, Date, number][] = [
    ['Unidad 1: (ejemplo) Fundamentos', 'Primer tema de la unidad', d(2, 9), d(2, 20), 12],
    ['', 'Segundo tema (si la unidad se repite, puede dejarla vacía)', d(2, 23), d(3, 6), 12],
    ['Unidad 2: (ejemplo) …', 'Primer tema de la unidad 2', d(3, 9), d(3, 27), 18],
  ];
  for (const r of ejemplo) ws.addRow(r);
  for (let i = 2; i <= 200; i++) { ws.getCell(`C${i}`).numFmt = 'dd/mm/yyyy'; ws.getCell(`D${i}`).numFmt = 'dd/mm/yyyy'; }
  ws.getCell('A1').note = 'Escriba la unidad o el RA solo en el primer tema; los siguientes la heredan. Borre las filas de ejemplo.';
  return Buffer.from(await wb.xlsx.writeBuffer());
}

// ── Consultas ─────────────────────────────────────────────────────────────────
export const planPropio = (uid: number, id: number) => one<any>(`SELECT p.id, p.usuario_id, p.asignatura_id, p.nivel, p.anio, p.tolerancia, p.seguimiento_desde, p.archivo_nombre,
  p.borrador IS NOT NULL AS hay_borrador, a.nombre AS asignatura FROM {S}.planes p LEFT JOIN general.asignaturas a ON a.id=p.asignatura_id WHERE p.id=? AND p.usuario_id=?`, [id, uid]);
export const temasDe = (planId: number) => q<Tema>('SELECT id, plan_id, orden, unidad, tema, inicio, fin, horas::float AS horas FROM {S}.plan_temas WHERE plan_id=? ORDER BY orden, id', [planId]);
/** Secciones del docente que usan un plan (misma subárea, nivel y año) */
export const seccionesDePlan = (uid: number, p: { asignatura_id: number | null; nivel: string; anio: number }) =>
  q<any>(`SELECT id, nivel, nombre, subgrupo FROM {S}.secciones WHERE usuario_id=? AND COALESCE(asignatura_id,0)=? AND nivel=? AND anio=?
    ORDER BY nombre, subgrupo NULLS FIRST`, [uid, p.asignatura_id ?? 0, p.nivel, p.anio]);
/** Plan de una sección, si lo hay */
export const planDeSeccion = (uid: number, seccionId: number) => one<any>(`SELECT p.id, p.tolerancia, p.seguimiento_desde FROM {S}.planes p
  JOIN {S}.secciones s ON s.usuario_id=p.usuario_id AND COALESCE(s.asignatura_id,0)=COALESCE(p.asignatura_id,0) AND s.nivel=p.nivel AND s.anio=p.anio
  WHERE s.id=? AND s.usuario_id=? AND p.borrador IS NULL`, [seccionId, uid]);
export const avanceDe = async (seccionId: number) =>
  new Map((await q<any>('SELECT tema_id, fecha FROM {S}.plan_avance WHERE seccion_id=?', [seccionId])).map((r) => [r.tema_id as number, r.fecha as string]));

export type EstadoTema = 'visto' | 'atrasado' | 'encurso' | 'pendiente' | 'sinfecha';
/** Estado de cada tema para una sección y resumen: qué debería estar viendo y qué tiene atrasado */
export function estadoPlan(temas: Tema[], avance: Map<number, string>, hoy: string, tolerancia: number) {
  const limite = sumar(hoy, -tolerancia);
  const estado = new Map<number, EstadoTema>();
  for (const t of temas) {
    estado.set(t.id, avance.has(t.id) ? 'visto' : !t.inicio || !t.fin ? 'sinfecha' : t.fin < hoy ? 'atrasado' : t.inicio <= hoy ? 'encurso' : 'pendiente');
  }
  const atrasados = temas.filter((t) => estado.get(t.id) === 'atrasado' && t.fin! < limite);
  const debe = temas.filter((t) => t.inicio && t.fin && t.inicio <= hoy && hoy <= t.fin);
  const proximo = temas.find((t) => estado.get(t.id) === 'pendiente');
  const vistos = temas.filter((t) => avance.has(t.id)).length;
  const previstos = temas.filter((t) => t.fin && t.fin < hoy).length;
  const diasAtraso = atrasados.length ? Math.round((Date.parse(hoy) - Date.parse(atrasados[0].fin!)) / 86400000) : 0;
  return { estado, atrasados, debe, proximo, vistos, previstos, total: temas.length, semanasAtraso: Math.max(1, Math.round(diasAtraso / 7)) };
}

const corta = (f: string) => f.split('-').reverse().slice(0, 2).join('/');

/**
 * Revisa los planes del docente: un tema que pasó su fecha de fin (más los días de gracia) sin marcarse como visto
 * deja una anotación de atraso en la bitácora de la sección (una sola vez); cuando se ponen al día, otra de recuperación.
 */
export async function revisarAtrasos(uid: number, hoy: string) {
  const planes = await q<any>('SELECT id, asignatura_id, nivel, anio, tolerancia, seguimiento_desde FROM {S}.planes WHERE usuario_id=? AND borrador IS NULL', [uid]);
  for (const p of planes) {
    const temas = await temasDe(p.id);
    if (!temas.length) continue;
    const limite = sumar(hoy, -p.tolerancia);
    for (const s of await seccionesDePlan(uid, p)) {
      const avance = await avanceDe(s.id);
      const alertas = await q<any>(`SELECT a.tema_id, a.resuelto FROM {S}.plan_alertas a JOIN {S}.plan_temas t ON t.id=a.tema_id WHERE a.seccion_id=? AND t.plan_id=?`, [s.id, p.id]);
      const ya = new Set(alertas.map((a) => a.tema_id));
      const nuevos = temas.filter((t) => t.fin && !avance.has(t.id) && t.fin < limite && t.fin >= p.seguimiento_desde && !ya.has(t.id));
      const resueltos = alertas.filter((a) => !a.resuelto && avance.has(a.tema_id));
      if (!nuevos.length && !resueltos.length) continue;
      const esquema = esquemaActual();
      await transaccion(async (c) => {
        const x = async (sql: string, prm: unknown[] = []) => (await c.query(preparar(sql, esquema), prm)).rows;
        if (nuevos.length) {
          const texto = `Atraso en el plan anual: ${nuevos.length === 1 ? 'un tema pasó' : `${nuevos.length} temas pasaron`} su fecha sin marcarse como visto.\n` +
            nuevos.map((t) => `• ${t.unidad ? t.unidad + ': ' : ''}${t.tema} (previsto hasta el ${corta(t.fin!)})`).join('\n') + '\nCausa: ';
          const b = (await x(`INSERT INTO {S}.bitacora (usuario_id, seccion_id, fecha, tipo, texto) VALUES (?,?,?::date,'plan',?) RETURNING id`, [uid, s.id, hoy, texto]))[0];
          for (const t of nuevos) await x('INSERT INTO {S}.plan_alertas (seccion_id, tema_id, bitacora_id, detectado) VALUES (?,?,?,?::date) ON CONFLICT DO NOTHING', [s.id, t.id, b.id, hoy]);
        }
        if (resueltos.length) {
          await x('UPDATE {S}.plan_alertas SET resuelto=?::date WHERE seccion_id=? AND tema_id = ANY(?) AND resuelto IS NULL', [hoy, s.id, resueltos.map((r) => r.tema_id)]);
          const pendientes = alertas.filter((a) => !a.resuelto && !avance.has(a.tema_id)).length + nuevos.length;
          if (!pendientes) {
            const nombres = resueltos.map((r) => temas.find((t) => t.id === r.tema_id)?.tema).filter(Boolean);
            await x(`INSERT INTO {S}.bitacora (usuario_id, seccion_id, fecha, tipo, texto) VALUES (?,?,?::date,'plan',?)`,
              [uid, s.id, hoy, `Se recuperó el atraso del plan anual: ya se ${nombres.length === 1 ? 'vio' : 'vieron'} ${nombres.map((n) => `«${n}»`).join(', ')}.`]);
          }
        }
      });
    }
  }
}

/** Marca o desmarca un tema como visto en una sección (validando que ambos sean del docente) */
export async function marcarTema(uid: number, seccionId: number, temaId: number, visto: boolean, fecha: string) {
  const ok = await one<any>(`SELECT 1 FROM {S}.plan_temas t JOIN {S}.planes p ON p.id=t.plan_id
    JOIN {S}.secciones s ON s.usuario_id=p.usuario_id AND COALESCE(s.asignatura_id,0)=COALESCE(p.asignatura_id,0) AND s.nivel=p.nivel AND s.anio=p.anio
    WHERE t.id=? AND s.id=? AND p.usuario_id=?`, [temaId, seccionId, uid]);
  if (!ok) throw new Error('Tema no encontrado');
  if (visto) await exec('INSERT INTO {S}.plan_avance VALUES (?,?,?::date) ON CONFLICT (seccion_id, tema_id) DO UPDATE SET fecha=EXCLUDED.fecha', [seccionId, temaId, fecha]);
  else await exec('DELETE FROM {S}.plan_avance WHERE seccion_id=? AND tema_id=?', [seccionId, temaId]);
}

/** Estado del plan de cada sección del docente (para Inicio): plan, temas atrasados y lo que corresponde ahora */
export async function resumenPlanes(uid: number, hoy: string) {
  const out = new Map<number, { plan: number; atrasados: number; debe: string | null }>();
  const planes = await q<any>('SELECT id, asignatura_id, nivel, anio, tolerancia FROM {S}.planes WHERE usuario_id=? AND borrador IS NULL', [uid]);
  for (const p of planes) {
    const temas = await temasDe(p.id);
    if (!temas.length) continue;
    for (const s of await seccionesDePlan(uid, p)) {
      const e = estadoPlan(temas, await avanceDe(s.id), hoy, p.tolerancia);
      out.set(s.id, { plan: p.id, atrasados: e.atrasados.length, debe: e.debe[0]?.tema ?? null });
    }
  }
  return out;
}
