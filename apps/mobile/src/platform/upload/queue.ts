import { UploadQueue, type UploadJob } from '@nopi/upload-queue';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { queueStorage, queueTransport } from './adapters';

/** Một hàng đợi cho cả app. */
export const uploadQueue = new UploadQueue(queueStorage, queueTransport);

let started = false;
/** Chạy hàng đợi: khi mở app, khi quay lại app, và mỗi 15 giây. Gọi một lần ở layout gốc. */
export function startUploadLoop() {
  if (started) return;
  started = true;
  const kick = () => void uploadQueue.processDue().catch(() => undefined);
  kick();
  setInterval(kick, 15_000);
  AppState.addEventListener('change', (s) => s === 'active' && kick());
  if (typeof window !== 'undefined' && 'addEventListener' in window) window.addEventListener('online', kick);
}

export const kickUploads = () => void uploadQueue.processDue().catch(() => undefined);

/** Các việc đang gửi của một bài (để hiện "Đang gửi…" và lỗi nếu có). */
export function useUploadJobs(studentAssignmentId?: string): UploadJob[] {
  const [jobs, setJobs] = useState<UploadJob[]>(() => (studentAssignmentId ? uploadQueue.forAssignment(studentAssignmentId) : uploadQueue.list()));
  useEffect(() => {
    void uploadQueue.load();
    return uploadQueue.subscribe((all) =>
      setJobs(studentAssignmentId ? all.filter((j) => j.studentAssignmentId === studentAssignmentId && j.state !== 'done') : all),
    );
  }, [studentAssignmentId]);
  return jobs;
}
