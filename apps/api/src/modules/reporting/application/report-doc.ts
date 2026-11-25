/**
 * Báo cáo ở dạng trung lập (không phụ thuộc định dạng). Định nghĩa báo cáo tạo ReportDoc,
 * renderer biến thành Excel hoặc PDF — thêm loại báo cáo hay định dạng mới không sửa cái cũ.
 */
export type Cell = string | number | null;

export interface ReportSheet {
  name: string;
  /** Dòng giới thiệu ở đầu sheet (tên lớp, môn, khoảng thời gian…) */
  intro?: string[];
  columns: { header: string; width?: number }[];
  rows: Cell[][];
}

export interface ReportDoc {
  title: string;
  fileBase: string; // tên file không dấu, không đuôi
  sheets: ReportSheet[];
}

export interface ReportRenderer {
  readonly format: 'xlsx' | 'pdf';
  readonly mimeType: string;
  render(doc: ReportDoc, outPath: string): Promise<void>;
}

/** "Báo cáo lớp 1A" → "bao-cao-lop-1a" */
export const slug = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
