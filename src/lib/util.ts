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
