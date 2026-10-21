export const num = (v: FormDataEntryValue | null, d = 0) => {
  if (v === null || String(v).trim() === '') return d;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : d;
};
export const numOrNull = (v: FormDataEntryValue | null) => {
  if (v === null || String(v).trim() === '') return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};
export const str = (v: FormDataEntryValue | null) => (v === null ? '' : String(v).trim());
export const r2 = (n: number) => Math.round(n * 100) / 100;
export const fmt = (n: number | null | undefined) =>
  n === null || n === undefined || Number.isNaN(n) ? '—' : r2(n).toLocaleString('es-CR', { maximumFractionDigits: 2 });
export const hoy = () => {
  const d = new Date(Date.now() - 6 * 3600 * 1000); // America/Costa_Rica (UTC-6, sin horario de verano)
  return d.toISOString().slice(0, 10);
};
export const nombreCompleto = (e: { apellidos: string; nombre: string }) => `${e.apellidos} ${e.nombre}`;

/** Nombre visible de una sección: "7-1", "11-2" o con subgrupo "7-1A". No repite el nivel si el nombre ya lo trae. */
export const etiquetaSeccion = (s: { nivel: string; nombre: string; subgrupo?: string | null }) =>
  (String(s.nombre).startsWith(`${s.nivel}-`) ? s.nombre : `${s.nivel}-${s.nombre}`) + (s.subgrupo ?? '');
/** Lo mismo en SQL, para consultas que no traen la fila completa (a = alias de la tabla de secciones) */
export const sqlEtiquetaSeccion = (a = 's', conSubgrupo = true) =>
  `(CASE WHEN ${a}.nombre LIKE ${a}.nivel || '-%' THEN ${a}.nombre ELSE ${a}.nivel || '-' || ${a}.nombre END${conSubgrupo ? ` || COALESCE(${a}.subgrupo, '')` : ''})`;

/** Subgrupo de sección (medio grupo de taller): solo A o B, y solo en 7.°, 8.° y 9.° */
export const nivelConSubgrupo = (nivel: string) => ['7', '8', '9'].includes(nivel.trim());
export function validarSubgrupo(nivel: string, valor: string): { subgrupo: string | null; error?: string } {
  const v = valor.trim().toUpperCase();
  if (!v) return { subgrupo: null };
  if (v !== 'A' && v !== 'B') return { subgrupo: null, error: 'El subgrupo solo puede ser A o B.' };
  if (!nivelConSubgrupo(nivel)) return { subgrupo: null, error: `El subgrupo solo se usa en 7.°, 8.° y 9.°; una sección de nivel ${nivel} va sin subgrupo.` };
  return { subgrupo: v };
}

export function csv(rows: (string | number | null | undefined)[][]) {
  const esc = (v: any) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + rows.map((r) => r.map(esc).join(';')).join('\r\n');
}

/** Lee CSV separado por ; o , (detecta el separador por la primera línea) */
export function parseCsv(text: string): string[][] {
  text = text.replace(/^﻿/, '');
  const first = text.split(/\r?\n/)[0] ?? '';
  const sep = (first.match(/;/g)?.length ?? 0) >= (first.match(/,/g)?.length ?? 0) ? ';' : ',';
  const out: string[][] = [];
  let row: string[] = [], cell = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') inQ = false;
      else cell += c;
    } else if (c === '"') inQ = true;
    else if (c === sep) { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell.replace(/\r$/, '')); out.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); out.push(row); }
  return out.filter((r) => r.some((c) => c.trim() !== ''));
}

export const TIPOS_AUSENCIA: Record<string, string> = {
  AI: 'Ausencia injustificada',
  AJ: 'Ausencia justificada',
  TI: 'Tardía injustificada',
  TJ: 'Tardía justificada',
};
export const NIVELES_LOGRO: Record<string, string> = {
  '': 'Sin calificar',
  '0': 'Sin entregar',
  '1': 'Inicial',
  '2': 'Intermedio',
  '3': 'Avanzado',
};
