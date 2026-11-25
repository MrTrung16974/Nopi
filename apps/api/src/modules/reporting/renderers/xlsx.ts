import ExcelJS from 'exceljs';
import type { ReportDoc, ReportRenderer } from '../application/report-doc.js';

export class XlsxRenderer implements ReportRenderer {
  readonly format = 'xlsx' as const;
  readonly mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

  async render(doc: ReportDoc, outPath: string) {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Nopi';
    for (const sheet of doc.sheets) {
      const ws = wb.addWorksheet(sheet.name.slice(0, 31));
      const intro = sheet.intro ?? [];
      intro.forEach((line, i) => {
        ws.addRow([line]);
        if (i === 0) ws.getRow(1).font = { bold: true, size: 14 };
      });
      if (intro.length) ws.addRow([]);
      const header = ws.addRow(sheet.columns.map((c) => c.header));
      header.font = { bold: true };
      header.alignment = { wrapText: true, vertical: 'middle' };
      header.eachCell((c) => (c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFEDD5' } }));
      sheet.rows.forEach((r) => ws.addRow(r));
      sheet.columns.forEach((c, i) => (ws.getColumn(i + 1).width = c.width ?? 14));
      ws.views = [{ state: 'frozen', ySplit: header.number, xSplit: Math.min(2, sheet.columns.length) }];
    }
    await wb.xlsx.writeFile(outPath);
  }
}
