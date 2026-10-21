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
