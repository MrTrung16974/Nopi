'use client';
import {
  authTokensSchema,
  errorResponseSchema,
  mediaViewSchema,
  studentAssignmentDetailSchema,
  studentAssignmentItemSchema,
  studentHomeSchema,
  uploadTicketSchema,
  type MediaView,
  type StudentAssignmentDetail,
  type StudentAssignmentItem,
} from '@nopi/contracts';
import { uiModeOfGrade, type Grade } from '@nopi/domain';
import { z } from 'zod';
import { ApiError } from './client';
import { studentWebSession, type DraftFile, type StudentPortalData, type StudentSubject, type StudentTask } from './student-client';

/**
 * Gọi API bằng phiên HỌC SINH (token trong localStorage, gửi kèm header Authorization;
 * BFF chuyển tiếp nguyên, không đụng cookie của người lớn). Hết hạn thì tự refresh một lần;
 * refresh hỏng → xoá phiên, về trang đăng nhập học sinh.
 */
async function send(path: string, init: RequestInit) {
  const s = studentWebSession.get();
  const headers = new Headers(init.headers);
  if (s) headers.set('authorization', `Bearer ${s.accessToken}`);
  try {
    return await fetch(`/api/v1${path}`, { ...init, headers });
  } catch {
    throw new ApiError('network', 'Mạng đang yếu, đợi một chút rồi thử lại nhé');
  }
}

let refreshing: Promise<boolean> | null = null;
async function refresh(): Promise<boolean> {
  const s = studentWebSession.get();
  if (!s) return false;
  refreshing ??= (async () => {
    const res = await fetch('/api/v1/auth/refresh', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken: s.refreshToken }),
    }).catch(() => null);
    if (!res?.ok) return false;
    studentWebSession.set({ ...s, ...authTokensSchema.parse(await res.json()) });
    return true;
  })().finally(() => (refreshing = null));
  return refreshing;
}

export const STUDENT_LOGIN = '/dang-nhap-hoc-sinh';

export async function studentCall<T extends z.ZodType = z.ZodUnknown>(
  path: string,
  opts: { method?: string; body?: unknown; schema?: T } = {},
): Promise<z.infer<T>> {
  const init: RequestInit = { method: opts.method ?? 'GET' };
  if (opts.body !== undefined) {
    init.body = JSON.stringify(opts.body);
    init.headers = { 'content-type': 'application/json' };
  }
  let res = await send(path, init);
  if (res.status === 401 && (await refresh())) res = await send(path, init);
  if (res.status === 401) {
    studentWebSession.set(null);
    if (typeof window !== 'undefined') location.href = STUDENT_LOGIN;
    throw new ApiError('unauthenticated', 'Phiên đăng nhập đã hết, con đăng nhập lại nhé');
  }
  if (res.status === 204) return undefined as z.infer<T>;
  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const e = errorResponseSchema.safeParse(json);
    throw new ApiError(e.data?.error.code ?? 'internal', e.data?.error.message ?? 'Có lỗi xảy ra, thử lại nhé', e.data?.error.details);
  }
  return (opts.schema ? opts.schema.parse(json) : json) as z.infer<T>;
}

// ---------------- Ánh xạ dữ liệu API → dữ liệu Cổng Học sinh ----------------

const subjectOf = (s: StudentAssignmentItem['subject']): StudentSubject => ({ id: s.id, code: s.code, shortName: s.shortName, icon: s.icon, color: s.color });

/** Học sinh không thấy "quá hạn" (API đã lọc theo audience), nhưng phòng hờ vẫn ánh xạ an toàn. */
function taskFromItem(i: StudentAssignmentItem): StudentTask {
  return {
    id: i.id,
    title: i.title,
    instructions: '',
    subject: subjectOf(i.subject),
    status: i.status,
    dueAt: i.dueAt,
    fromFamily: i.fromFamily,
    isPractice: i.isPractice,
    isLate: i.isLate,
    submissionKinds: [],
    submittedAt: i.lastSubmittedAt,
    loaded: false,
  };
}

const MEDIA_LABEL: Record<string, string> = { photo: 'Ảnh', audio: 'Ghi âm', video: 'Video', document: 'Tài liệu' };

/** Gộp chi tiết bài (đề, cách nộp, nhận xét, bài đã gửi) vào thẻ bài. */
export function mergeDetail(t: StudentTask, d: StudentAssignmentDetail): StudentTask {
  const latest = d.attempts.at(-1);
  const itemsText = d.items.map((it, n) => `${n + 1}. ${it.promptText}`).join('\n');
  return {
    ...t,
    title: d.title,
    status: d.status,
    dueAt: d.dueAt,
    instructions: [d.instructions, itemsText].filter(Boolean).join('\n\n') || 'Con làm bài theo lời cô dặn trên lớp nhé.',
    submissionKinds: d.submissionKinds.filter((k): k is 'photo' | 'video' | 'audio' => k !== 'document'),
    canSubmit: d.canSubmit,
    maxPhotos: d.maxPhotos,
    maxMediaSeconds: d.maxMediaSeconds,
    originals: d.originals.filter((m) => m.url).map((m) => ({ kind: m.kind, url: m.url! })),
    instructionsAudioUrl: d.instructionsAudio?.url ?? null,
    feedback: d.feedback
      ? { requiresRedo: d.feedback.requiresRedo, sticker: d.feedback.sticker, label: d.feedback.label, comment: d.feedback.comment, commentAudioUrl: d.feedback.commentAudio?.url ?? null }
      : null,
    submittedAt: latest?.submittedAt ?? t.submittedAt,
    submittedPreview: latest?.media.map((m: MediaView, n) => ({ kind: m.kind === 'document' ? 'photo' : m.kind, label: `${MEDIA_LABEL[m.kind]} ${n + 1}`, url: m.url ?? undefined })),
    loaded: true,
  };
}

export async function loadTaskDetail(task: StudentTask): Promise<StudentTask> {
  const d = await studentCall(`/student-assignments/${task.id}`, { schema: studentAssignmentDetailSchema });
  return mergeDetail(task, d);
}

/** Trang chủ thật của học sinh đang đăng nhập. */
export async function loadStudentPortal(): Promise<StudentPortalData> {
  const [home, items] = await Promise.all([
    studentCall('/student/me', { schema: studentHomeSchema }),
    studentCall('/student/assignments', { schema: z.array(studentAssignmentItemSchema) }),
  ]);
  const grade = home.grade as Grade | null;
  const mode = grade && uiModeOfGrade(grade) === 'teen' ? 'teen' : 'nhi';
  const subjects = new Map<number, StudentSubject>();
  for (const c of home.classes) for (const s of c.subjects) subjects.set(s.id, s);
  let tasks = items.map(taskFromItem);
  for (const t of tasks) if (!subjects.has(t.subject.id)) subjects.set(t.subject.id, t.subject);

  // Sticker/nhận xét chỉ có trong chi tiết bài → nạp chi tiết các bài đã chấm gần nhất (tối đa 30)
  const graded = tasks.filter((t) => t.status === 'graded' || t.status === 'returned').slice(0, 30);
  const details = await Promise.allSettled(graded.map((t) => loadTaskDetail(t)));
  const byId = new Map(details.flatMap((r) => (r.status === 'fulfilled' ? [[r.value.id, r.value] as const] : [])));
  tasks = tasks.map((t) => byId.get(t.id) ?? t);

  const schoolClass = home.classes.find((c) => c.schoolKind === 'school') ?? home.classes[0];
  return {
    mode,
    isDemo: false,
    studentName: home.student.fullName,
    nickname: home.student.nickname ?? home.student.fullName.split(' ').pop() ?? home.student.fullName,
    grade: grade ?? 1,
    className: schoolClass?.name ?? '',
    // Mỗi bài đã nộp = 1 giọt nước cho Chép Con
    waterDrops: tasks.filter((t) => t.status === 'submitted' || t.status === 'graded').length,
    subjects: [...subjects.values()],
    tasks,
  };
}

// ---------------- Nộp bài ----------------

async function putBlob(url: string, body: Blob, headers: Record<string, string> = {}) {
  let r: Response;
  try {
    r = await fetch(url, { method: 'PUT', headers, body });
  } catch {
    throw new ApiError('network', 'Mạng đang yếu, bài chưa gửi được. Con bấm gửi lại nhé');
  }
  if (!r.ok) throw new ApiError('network', 'Gửi file chưa được, con bấm gửi lại nhé');
  return r;
}

/** Tải một file lên kho (một lần hoặc theo từng phần với video lớn), trả về mediaId. */
async function uploadOne(saId: string, f: DraftFile): Promise<string> {
  if (!f.blob) throw new ApiError('validation_failed', 'File này không còn, con làm lại nhé');
  const mimeType = f.blob.type || (f.kind === 'audio' ? 'audio/webm' : f.kind === 'video' ? 'video/mp4' : 'image/jpeg');
  const ticket = await studentCall(`/student-assignments/${saId}/uploads`, {
    method: 'POST',
    body: { kind: f.kind, mimeType, sizeBytes: f.blob.size, durationS: f.durationS },
    schema: uploadTicketSchema,
  });
  let parts: { partNumber: number; etag: string }[] | undefined;
  if (ticket.method === 'put') {
    await putBlob(ticket.url, f.blob, ticket.headers);
  } else {
    parts = [];
    for (const p of ticket.parts) {
      const start = (p.partNumber - 1) * ticket.partSize;
      const r = await putBlob(p.url, f.blob.slice(start, start + ticket.partSize));
      const etag = r.headers.get('etag');
      if (!etag) throw new ApiError('internal', 'Kho lưu trữ chưa trả mã phần (ETag)');
      parts.push({ partNumber: p.partNumber, etag });
    }
  }
  await studentCall(`/media/${ticket.mediaId}/complete`, { method: 'POST', body: { parts }, schema: mediaViewSchema });
  return ticket.mediaId;
}

/**
 * Nộp bài: tải từng file rồi nộp một lần. API nộp idempotent theo bộ media,
 * nên bấm gửi lại sau lỗi mạng không tạo bài trùng.
 */
export async function submitStudentWork(saId: string, files: DraftFile[], onProgress?: (done: number, total: number) => void) {
  const ids: string[] = [];
  for (const [n, f] of files.entries()) {
    onProgress?.(n, files.length + 1);
    ids.push(f.mediaId ?? (f.mediaId = await uploadOne(saId, f)));
  }
  onProgress?.(files.length, files.length + 1);
  return studentCall(`/student-assignments/${saId}/submissions`, { method: 'POST', body: { mediaIds: ids }, schema: studentAssignmentDetailSchema });
}

export async function studentLogout() {
  await studentCall('/auth/logout', { method: 'POST' }).catch(() => undefined);
  studentWebSession.set(null);
}
