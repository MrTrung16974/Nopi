import ExcelJS from 'exceljs';

/** Bỏ dấu tiếng Việt + chữ thường để so tiêu đề cột: "Họ và tên" → "ho va ten" */
export const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

/** Đọc giá trị ô Excel về chuỗi hoặc Date (ô có thể là số, công thức, rich text, hyperlink…). */
export function cellValue(v: ExcelJS.CellValue): string | Date | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v;
  if (typeof v === 'string') return v.trim() || null;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (typeof v === 'object') {
    if ('richText' in v) return v.richText.map((r) => r.text).join('').trim() || null;
    if ('text' in v && typeof v.text === 'string') return v.text.trim() || null;
    if ('result' in v) return cellValue(v.result as ExcelJS.CellValue);
  }
  return String(v);
}

export interface ColumnSpec<K extends string> {
  key: K;
  header: string;
  /** Các cách viết tiêu đề được chấp nhận (đã bỏ dấu) */
  aliases: string[];
  required?: boolean;
  width?: number;
  example?: string;
}

export interface ParsedSheet<K extends string> {
  rows: { rowNumber: number; values: Record<K, string | Date | null> }[];
  missingColumns: string[];
}

/** Tìm dòng tiêu đề trong 10 dòng đầu, ánh xạ cột theo tên, đọc các dòng dữ liệu (bỏ dòng trống). */
export async function readSheet<K extends string>(buffer: Buffer, columns: ColumnSpec<K>[]): Promise<ParsedSheet<K>> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  const ws = wb.worksheets[0];
  if (!ws) return { rows: [], missingColumns: columns.filter((c) => c.required).map((c) => c.header) };

  let headerRow = 0;
  const colIndex = new Map<K, number>();
  for (let r = 1; r <= Math.min(10, ws.rowCount); r++) {
    const row = ws.getRow(r);
    const found = new Map<K, number>();
    row.eachCell((cell, col) => {
      const text = cellValue(cell.value);
      if (typeof text !== 'string') return;
      const f = fold(text);
      const spec = columns.find((c) => c.aliases.some((a) => f === a || f.startsWith(`${a} `) || f.startsWith(`${a}(`)));
      if (spec && !found.has(spec.key)) found.set(spec.key, col);
    });
    if (found.size > colIndex.size) {
      headerRow = r;
      colIndex.clear();
      found.forEach((v, k) => colIndex.set(k, v));
    }
  }
  const missingColumns = columns.filter((c) => c.required && !colIndex.has(c.key)).map((c) => c.header);
  if (missingColumns.length || headerRow === 0) return { rows: [], missingColumns };

  const rows: ParsedSheet<K>['rows'] = [];
  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const values = {} as Record<K, string | Date | null>;
    let any = false;
    for (const c of columns) {
      const idx = colIndex.get(c.key);
      const v = idx ? cellValue(row.getCell(idx).value) : null;
      values[c.key] = v;
      if (v !== null) any = true;
    }
    if (any) rows.push({ rowNumber: r, values });
  }
  return { rows, missingColumns };
}

/** File mẫu: dòng tiêu đề đậm, một dòng ví dụ in nghiêng, ghi chú ở sheet "Hướng dẫn". */
export async function buildTemplate<K extends string>(title: string, columns: ColumnSpec<K>[], notes: string[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Nopi';
  const ws = wb.addWorksheet(title);
  ws.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width ?? 20 }));
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFEDD5' } };
  const example = ws.addRow(Object.fromEntries(columns.map((c) => [c.key, c.example ?? ''])));
  example.font = { italic: true, color: { argb: 'FF64748B' } };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  const help = wb.addWorksheet('Hướng dẫn');
  help.getColumn(1).width = 100;
  notes.forEach((n) => help.addRow([n]));
  return Buffer.from(await wb.xlsx.writeBuffer());
}
