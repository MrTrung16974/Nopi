import type {} from '@fastify/multipart'; // bổ sung kiểu req.file() cho Fastify
import type { FastifyRequest } from 'fastify';
import { AppError } from '../../../platform/index.js';

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Đọc file .xlsx từ multipart/form-data (trường "file"). */
export async function readXlsxUpload(req: FastifyRequest): Promise<Buffer> {
  if (!req.isMultipart()) throw new AppError('validation_failed', 'Vui lòng chọn file Excel để tải lên');
  const file = await req.file();
  if (!file) throw new AppError('validation_failed', 'Vui lòng chọn file Excel để tải lên');
  const okType = file.mimetype === XLSX || file.filename.toLowerCase().endsWith('.xlsx');
  if (!okType) throw new AppError('validation_failed', 'Chỉ nhận file Excel dạng .xlsx');
  const buf = await file.toBuffer();
  if (file.file.truncated) throw new AppError('validation_failed', 'File quá lớn (tối đa 5 MB)');
  return buf;
}

export const XLSX_MIME = XLSX;
