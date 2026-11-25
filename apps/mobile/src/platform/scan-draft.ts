import type { AssignmentItemInput } from '@nopi/contracts';

/** Kết quả quét đã soát, chuyển từ màn quét sang màn giao bài (giữ trong bộ nhớ). */
export interface ScanDraft {
  scanJobId: string;
  teachingAssignmentId: string;
  title: string;
  instructions: string | null;
  items: AssignmentItemInput[];
  originalMediaIds: string[];
}

let current: ScanDraft | null = null;
export const scanDraft = {
  set: (d: ScanDraft | null) => (current = d),
  take: (taId: string) => {
    const d = current && current.teachingAssignmentId === taId ? current : null;
    current = null;
    return d;
  },
};
