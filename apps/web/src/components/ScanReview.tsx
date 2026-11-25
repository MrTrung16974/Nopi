'use client';
import { ITEM_TYPE_LABELS, ITEM_TYPES, type AssignmentItemInput, type ScanJobDto } from '@nopi/contracts';

export type ReviewItem = AssignmentItemInput & { key: string };

/**
 * Soát lại đề AI đã đọc (mục 6.5): ảnh gốc ở trên, các câu ở dưới; chữ AI không chắc được tô vàng;
 * sửa, bỏ hoặc đổi thứ tự từng câu. Ảnh gốc luôn được đính kèm bài.
 */
export function ScanReview({ job, items, onChange }: { job: ScanJobDto; items: ReviewItem[]; onChange: (items: ReviewItem[]) => void }) {
  const update = (key: string, patch: Partial<ReviewItem>) => onChange(items.map((it) => (it.key === key ? { ...it, ...patch, aiConfidence: patch.promptText !== undefined ? null : it.aiConfidence } : it)));
  const move = (i: number, d: -1 | 1) => {
    const next = [...items];
    const [x] = next.splice(i, 1);
    next.splice(i + d, 0, x!);
    onChange(next);
  };
  return (
    <div className="stack">
      <div className="row" style={{ alignItems: 'start' }}>
        {job.sourceMedia.map((m, i) => (
          <a key={m.id} href={m.url ?? '#'} target="_blank" rel="noreferrer">
            <img src={m.url ?? ''} alt={`Trang ${i + 1} (ảnh gốc)`} style={{ maxHeight: 260, borderRadius: 8, border: '1px solid var(--border)' }} />
          </a>
        ))}
      </div>
      <p className="muted" style={{ fontSize: 13 }}>
        {job.cached ? 'Trang này đã được quét trước đây trong trường — dùng lại kết quả, không tốn lượt. ' : ''}
        Ô tô vàng là chỗ AI chưa chắc, thầy cô xem kỹ. AI chỉ chép đề, không giải.
      </p>
      {items.map((it, i) => {
        const unsure = it.aiConfidence !== null && it.aiConfidence !== undefined && it.aiConfidence < 0.7;
        return (
          <div key={it.key} className="card stack" style={{ gap: 8, background: unsure ? '#FEF9C3' : undefined, borderColor: unsure ? '#FACC15' : undefined }}>
            <div className="row" style={{ alignItems: 'center' }}>
              <strong>Câu {i + 1}</strong>
              <select aria-label={`Kiểu câu ${i + 1}`} value={it.itemType} onChange={(e) => update(it.key, { itemType: e.target.value as ReviewItem['itemType'] })}>
                {ITEM_TYPES.map((t) => <option key={t} value={t}>{ITEM_TYPE_LABELS[t]}</option>)}
              </select>
              {unsure && <span className="badge" style={{ background: '#FACC15', color: '#713F12' }}>AI chưa chắc</span>}
              <span style={{ flex: 1 }} />
              <button aria-label={`Đưa câu ${i + 1} lên`} disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
              <button aria-label={`Đưa câu ${i + 1} xuống`} disabled={i === items.length - 1} onClick={() => move(i, 1)}>↓</button>
              <button aria-label={`Bỏ câu ${i + 1}`} onClick={() => onChange(items.filter((x) => x.key !== it.key))}>Bỏ</button>
            </div>
            <textarea aria-label={`Nội dung câu ${i + 1}`} value={it.promptText} rows={2} onChange={(e) => update(it.key, { promptText: e.target.value })} style={{ font: 'inherit', padding: 10, borderRadius: 10, border: '1.5px solid var(--border)' }} />
            {it.options && it.options.length > 0 && (
              <div className="row" style={{ gap: 6 }}>
                {it.options.map((o, j) => (
                  <input key={j} aria-label={`Phương án ${j + 1} câu ${i + 1}`} value={o} onChange={(e) => update(it.key, { options: it.options!.map((x, k) => (k === j ? e.target.value : x)) })} style={{ width: 160 }} />
                ))}
              </div>
            )}
          </div>
        );
      })}
      {items.length === 0 && <p className="muted">Đã bỏ hết các câu — thầy cô có thể soạn lời dặn bằng tay bên dưới.</p>}
    </div>
  );
}
