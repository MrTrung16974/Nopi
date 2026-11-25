import PDFDocument from 'pdfkit';
import { createWriteStream } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { finished } from 'node:stream/promises';
import type { ReportDoc, ReportRenderer } from '../application/report-doc.js';

// Be Vietnam Pro (OFL) — đủ dấu tiếng Việt, đóng gói kèm app (không phụ thuộc font của máy chủ)
const fontDir = dirname(createRequire(import.meta.url).resolve('@expo-google-fonts/be-vietnam-pro/package.json'));
const FONT = join(fontDir, '400Regular', 'BeVietnamPro_400Regular.ttf');
const FONT_BOLD = join(fontDir, '700Bold', 'BeVietnamPro_700Bold.ttf');

/** Bảng PDF khổ A4 ngang; bảng rộng thì tự thu nhỏ chữ, dòng dài thì xuống dòng, tự sang trang. */
export class PdfRenderer implements ReportRenderer {
  readonly format = 'pdf' as const;
  readonly mimeType = 'application/pdf';

  async render(doc: ReportDoc, outPath: string) {
    const pdf = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 32, info: { Title: doc.title, Creator: 'Nopi' } });
    const stream = createWriteStream(outPath);
    pdf.pipe(stream);
    pdf.registerFont('r', FONT);
    pdf.registerFont('b', FONT_BOLD);
    const left = pdf.page.margins.left;
    const usable = pdf.page.width - pdf.page.margins.left - pdf.page.margins.right;
    const bottom = () => pdf.page.height - pdf.page.margins.bottom;

    doc.sheets.forEach((sheet, si) => {
      if (si > 0) pdf.addPage();
      (sheet.intro ?? []).forEach((line, i) => pdf.font(i === 0 ? 'b' : 'r').fontSize(i === 0 ? 15 : 10).text(line));
      pdf.moveDown(0.6);
      const totalW = sheet.columns.reduce((n, c) => n + (c.width ?? 14), 0);
      const widths = sheet.columns.map((c) => ((c.width ?? 14) / totalW) * usable);
      const size = Math.max(6.5, Math.min(10, 10 * (60 / Math.max(60, totalW))));
      const drawRow = (cells: (string | number | null)[], bold: boolean): void => {
        pdf.font(bold ? 'b' : 'r').fontSize(size);
        const texts = cells.map((c) => (c === null || c === undefined ? '' : String(c)));
        const h = Math.max(...texts.map((t, i) => pdf.heightOfString(t, { width: widths[i]! - 6 }))) + 6;
        if (pdf.y + h > bottom()) {
          pdf.addPage();
          pdf.y = pdf.page.margins.top;
          if (!bold) drawRow(header, true); // lặp lại dòng tiêu đề cột ở trang mới
        }
        const y = pdf.y;
        let x = left;
        texts.forEach((t, i) => {
          if (bold) pdf.rect(x, y, widths[i]!, h).fill('#FFEDD5').fillColor('#000');
          pdf.rect(x, y, widths[i]!, h).strokeColor('#CBD5E1').lineWidth(0.5).stroke();
          pdf.fillColor('#0F172A').text(t, x + 3, y + 3, { width: widths[i]! - 6 });
          x += widths[i]!;
        });
        pdf.x = left;
        pdf.y = y + h;
      };
      const header = sheet.columns.map((c) => c.header);
      drawRow(header, true);
      sheet.rows.forEach((r) => drawRow(r, false));
    });
    pdf.end();
    await finished(stream);
  }
}
