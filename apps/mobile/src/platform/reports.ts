import { reportJobSchema, type CreateReportInput, type ReportJobDto } from '@nopi/contracts';
import { api } from './api';

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Khoảng ngày (theo hạn nộp) của cả tháng: 0 = tháng này, -1 = tháng trước. */
export function monthRange(offset: 0 | -1) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0);
  return { from: iso(start), to: iso(end) };
}

/** Gửi yêu cầu xuất báo cáo rồi chờ (tối đa ~1 phút). Chưa xong thì trả về job đang chạy — sẽ có thông báo khi xong. */
export async function requestReport(input: CreateReportInput): Promise<ReportJobDto> {
  let job = await api('/reports', { method: 'POST', body: input, schema: reportJobSchema });
  const until = Date.now() + 60_000;
  while ((job.status === 'queued' || job.status === 'running') && Date.now() < until) {
    await new Promise((r) => setTimeout(r, 1500));
    job = await api(`/reports/${job.id}`, { schema: reportJobSchema });
  }
  return job;
}
