import ExcelJS from 'exceljs';

/** Cédula de la fila de ejemplo de la plantilla: esa fila no se importa */
export const CEDULA_EJEMPLO = '100000000';

/** Plantilla de estudiantes con el formato de «ListaCurso» del MEP (título, fecha y cabecera en la fila 5) */
export async function plantillaEstudiantes(colegio: string, fecha: string) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Lista', { views: [{ state: 'frozen', ySplit: 5 }] });
  ws.columns = [10.5, 20.8, 20.8, 20.8, 10.5, 22.8, 11.6].map((width) => ({ width }));
  ws.getColumn(1).numFmt = '@'; // cédula como texto
  ws.getColumn(7).numFmt = '@';

  ws.mergeCells('A1:D1');
  ws.getCell('A1').value = colegio.toUpperCase();
  ws.getCell('A1').font = { bold: true };
  ws.getCell('A3').value = 'Fecha:';
  ws.getCell('B3').value = fecha;

  const borde = { style: 'thin' as const };
  const cab = ws.getRow(5);
  cab.values = ['Cédula', 'Primer apellido', 'Segundo apellido', 'Nombre', 'Sección', 'Encargado', 'Teléfono (móvil)'];
  cab.height = 30;
  cab.eachCell((c) => {
    c.font = { bold: true };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4BACC6' } };
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    c.border = { top: borde, left: borde, bottom: borde, right: borde };
  });
  const nota = 'Este campo es opcional, es para el envío de notificaciones.';
  ws.getCell('F5').note = nota;
  ws.getCell('G5').note = nota;

  ws.getRow(6).values = ['1-0000-0000', 'xxx', 'yyy', 'zzz', '7-1', 'xxx', '0000-0000'];
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** Lee la primera hoja de un .xlsx como filas de texto (igual que parseCsv) */
export async function leerExcel(datos: ArrayBuffer): Promise<string[][]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(datos);
  const ws = wb.worksheets[0];
  const out: string[][] = [];
  ws?.eachRow((row) => {
    const r: string[] = [];
    for (let i = 1; i <= ws.columnCount; i++) r.push(row.getCell(i).text?.trim() ?? '');
    if (r.some((c) => c !== '')) out.push(r);
  });
  return out;
}

/** Niveles de la lista desplegable de la plantilla de indicadores y el nivel que usa Nexo */
export const NIVELES: [string, string][] = [
  ['Materno', 'Materno'], ['Transición', 'Transición'], ['Primero', '1'], ['Segundo', '2'], ['Tercero', '3'],
  ['Cuarto', '4'], ['Quinto', '5'], ['Sexto', '6'], ['Sétimo', '7'], ['Octavo', '8'], ['Noveno', '9'],
  ['Décimo', '10'], ['Undécimo', '11'], ['Duodécimo', '12'],
];
const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** «Sétimo», «7», «7°» o «7.°» → «7»; un texto que no reconoce queda igual */
export function nivelDesdeTexto(t: string) {
  const v = t.trim();
  const n = v.match(/^(\d{1,2})\s*\.?\s*[°º]?$/);
  if (n) return String(Number(n[1]));
  const k = sinTildes(v).replace('setimo', 'septimo');
  return NIVELES.find(([nom]) => sinTildes(nom).replace('setimo', 'septimo') === k)?.[1] ?? v;
}

/** Celdas de la plantilla de indicadores: las usan tanto la descarga como la importación */
const PI = { nivel: 'C5', periodo: 'E5', asignatura: 'E4', primeraFila: 9, filas: 60 };

export async function plantillaIndicadores(d: { colegio: string; codigo: string; docente: string; asignaturas: string[]; nivel: string }) {
  const marino = 'FF0B3C5D', cian = 'FF1F8FB3', hielo = 'FFEAF4F8', claro = 'FFF6FAFC', amarillo = 'FFFFF6D5';
  const fino = { style: 'thin' as const, color: { argb: 'FFB7C9D6' } };
  const bordes = { top: fino, left: fino, bottom: fino, right: fino };
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Indicadores', {
    views: [{ state: 'frozen', ySplit: 8, showGridLines: false }],
    pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: '7:8' },
  });
  ws.columns = [5, 48, 30, 30, 30].map((width) => ({ width }));

  // Listas de las validaciones, en una hoja oculta
  const ls = wb.addWorksheet('Listas', { state: 'veryHidden' });
  NIVELES.forEach(([nom], i) => (ls.getCell(i + 1, 1).value = nom));
  ['Todos', '1', '2', '3'].forEach((p, i) => (ls.getCell(i + 1, 2).value = p));
  d.asignaturas.forEach((a, i) => (ls.getCell(i + 1, 3).value = a));

  ws.mergeCells('A1:E1');
  Object.assign(ws.getCell('A1'), {
    value: 'INDICADORES DE APRENDIZAJE',
    font: { bold: true, size: 15, color: { argb: 'FFFFFFFF' } },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: marino } },
    alignment: { horizontal: 'center', vertical: 'middle' },
  });
  ws.getRow(1).height = 30;
  ws.mergeCells('A2:E2');
  Object.assign(ws.getCell('A2'), {
    value: 'Elija el nivel y el periodo, escriba un indicador por fila y luego importe este archivo en Nexo → Indicadores.',
    font: { italic: true, size: 9, color: { argb: 'FF5B7083' } },
    alignment: { horizontal: 'center' },
  });

  const nivelNombre = NIVELES.find(([, v]) => v === d.nivel)?.[0] ?? '';
  const datos: [string, string, string, string, string, string][] = [
    ['B3', 'Institución', d.colegio, 'D3', 'Código presupuestario', d.codigo],
    ['B4', 'Docente', d.docente, 'D4', 'Asignatura', ''],
    ['B5', 'Nivel *', nivelNombre, 'D5', 'Periodo', 'Todos'],
  ];
  for (const [c1, l1, v1, c2, l2, v2] of datos) {
    for (const [c, l, v] of [[c1, l1, v1], [c2, l2, v2]]) {
      const et = ws.getCell(c), val = et.address.replace(/^[A-Z]/, (x) => String.fromCharCode(x.charCodeAt(0) + 1));
      Object.assign(et, { value: l, font: { bold: true, color: { argb: marino } }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: hielo } }, alignment: { horizontal: 'right', vertical: 'middle' }, border: bordes });
      Object.assign(ws.getCell(val), { value: v, alignment: { vertical: 'middle' }, border: bordes });
    }
  }
  for (const r of [3, 4, 5]) ws.getRow(r).height = 20;
  ws.getCell(PI.nivel).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: amarillo } };
  const lista = (titulo: string, rango: string) => ({
    type: 'list' as const, allowBlank: true, formulae: [rango],
    showInputMessage: true, promptTitle: titulo, prompt: 'Elija una opción de la lista',
    showErrorMessage: true, errorTitle: 'Valor no válido', error: 'Elija una opción de la lista desplegable.',
  });
  ws.getCell(PI.nivel).dataValidation = lista('Nivel', `Listas!$A$1:$A$${NIVELES.length}`);
  ws.getCell(PI.periodo).dataValidation = lista('Periodo', 'Listas!$B$1:$B$4');
  if (d.asignaturas.length) {
    ws.getCell(PI.asignatura).dataValidation = { ...lista('Asignatura', `Listas!$C$1:$C$${d.asignaturas.length}`), showErrorMessage: false };
  }
  ws.getCell(PI.periodo).note = '«Todos» = el indicador sirve en cualquier periodo.';

  // Cabecera de la tabla en dos filas, como la plantilla del MEP
  ws.mergeCells('A7:A8'); ws.mergeCells('B7:B8'); ws.mergeCells('C7:E7');
  ws.getCell('A7').value = 'N.º';
  ws.getCell('B7').value = 'INDICADOR O APRENDIZAJE ESPERADO *';
  ws.getCell('C7').value = 'NIVEL DE LOGRO';
  ws.getCell('C8').value = 'Inicial (1 pt)';
  ws.getCell('D8').value = 'Intermedio (2 pts)';
  ws.getCell('E8').value = 'Avanzado (3 pts)';
  for (const r of [7, 8]) {
    ws.getRow(r).height = 22;
    for (let c = 1; c <= 5; c++) {
      Object.assign(ws.getCell(r, c), {
        font: { bold: true, color: { argb: 'FFFFFFFF' } },
        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: r === 7 ? marino : cian } },
        alignment: { horizontal: 'center', vertical: 'middle', wrapText: true }, border: bordes,
      });
    }
  }

  for (let i = 0; i < PI.filas; i++) {
    const row = ws.getRow(PI.primeraFila + i);
    row.height = 48;
    row.getCell(1).value = i + 1;
    for (let c = 1; c <= 5; c++) {
      Object.assign(row.getCell(c), {
        alignment: { vertical: 'top', wrapText: true, horizontal: c === 1 ? 'center' : 'left' }, border: bordes,
        ...(i % 2 ? { fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: claro } } } : {}),
      });
    }
    row.getCell(1).font = { bold: true, color: { argb: 'FF8C9BA8' } };
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** Lee la plantilla de indicadores; null si el archivo no tiene esa forma */
export async function leerPlantillaIndicadores(datos: ArrayBuffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(datos);
  const ws = wb.getWorksheet('Indicadores') ?? wb.worksheets[0];
  if (!ws || !/^nivel/i.test(ws.getCell('B5').text.trim())) return null;
  const t = (c: string) => ws.getCell(c).text?.trim() ?? '';
  const periodo = Number(t(PI.periodo));
  const filas: { nombre: string; inicial: string; intermedio: string; avanzado: string }[] = [];
  for (let r = PI.primeraFila; r <= Math.max(ws.rowCount, PI.primeraFila); r++) {
    const row = ws.getRow(r), v = (c: number) => row.getCell(c).text?.trim() ?? '';
    if (v(2)) filas.push({ nombre: v(2), inicial: v(3), intermedio: v(4), avanzado: v(5) });
  }
  return { nivel: t(PI.nivel) ? nivelDesdeTexto(t(PI.nivel)) : '', periodo: periodo >= 1 ? periodo : null, asignatura: t(PI.asignatura), filas };
}
