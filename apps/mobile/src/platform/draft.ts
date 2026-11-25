import type { MediaKind } from '@nopi/upload-queue';
import { useSyncExternalStore } from 'react';

/** File vừa chụp/quay/ghi âm, chờ "Gửi cho cô" (giữ trong bộ nhớ theo từng bài). */
export interface DraftFile {
  localUri: string;
  kind: MediaKind;
  mimeType: string;
  sizeBytes: number;
  durationS?: number;
}

const drafts = new Map<string, DraftFile[]>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const EMPTY: DraftFile[] = [];

export const draftStore = {
  get: (saId: string) => drafts.get(saId) ?? EMPTY,
  add(saId: string, f: DraftFile) {
    drafts.set(saId, [...(drafts.get(saId) ?? []), f]);
    emit();
  },
  remove(saId: string, index: number) {
    drafts.set(saId, (drafts.get(saId) ?? []).filter((_, i) => i !== index));
    emit();
  },
  clear(saId: string) {
    drafts.delete(saId);
    emit();
  },
};

export function useDraft(saId: string) {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => draftStore.get(saId),
    () => draftStore.get(saId),
  );
}
