'use client';
import { friendlyDue, vi } from '@nopi/copy';
import { statusStyle, subjectIcon } from '@nopi/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { ChepConSvg, type ChepConMood } from './ChepConSvg';
import { ConfettiBurst, ParentGateModal, StickerBadge, useReadAloud } from './StudentEffects';
import {
  buildDemoNhi,
  buildDemoTeen,
  studentWebSession,
  type StudentPortalData,
  type StudentSubject,
  type StudentTask,
} from '@/lib/student-client';

const STATUS_ICON: Record<string, string> = {
  backpack: '🎒',
  hourglass: '⏳',
  'rotate-ccw': '🔄',
  sticker: '⭐',
  'alarm-clock': '⏰',
};

const isTodo = (t: StudentTask) => t.status === 'assigned' || t.status === 'returned' || t.status === 'overdue';

function StatusPill({ status, isNhi }: { status: StudentTask['status']; isNhi: boolean }) {
  const s = statusStyle[status];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        background: s.bg,
        color: s.fg,
        padding: isNhi ? '6px 14px' : '4px 10px',
        borderRadius: 999,
        fontWeight: 800,
        fontSize: isNhi ? 15 : 12.5,
      }}
    >
      <span aria-hidden="true">{STATUS_ICON[s.icon]}</span>
      <span>{vi.status.student[status]}</span>
    </span>
  );
}

/** Ghi âm trực tiếp trên trình duyệt (nút tròn đỏ to + đồng hồ đếm). */
function BrowserAudioRecorder({ onRecorded, isNhi }: { onRecorded: (label: string, url?: string) => void; isNhi: boolean }) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      recRef.current?.stream.getTracks().forEach((tr) => tr.stop());
    };
  }, []);

  const toggle = async () => {
    setErr(null);
    if (recording) {
      recRef.current?.stop();
      if (timerRef.current) clearInterval(timerRef.current);
      setRecording(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      mr.onstop = () => {
        stream.getTracks().forEach((tr) => tr.stop());
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);
        onRecorded(`Ghi âm (${Math.max(1, seconds)} giây)`, url);
      };
      recRef.current = mr;
      setSeconds(0);
      mr.start();
      setRecording(true);
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch {
      setErr('Trình duyệt chưa cấp quyền micro. Bạn có thể bấm nút bên dưới để dùng bản ghi mẫu thử trải nghiệm.');
    }
  };

  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');

  return (
    <div
      style={{
        display: 'grid',
        justifyItems: 'center',
        gap: 14,
        padding: 24,
        borderRadius: isNhi ? 24 : 18,
        background: '#FFFFFF',
        border: `2px solid ${recording ? '#FCA5A5' : '#E2E8F0'}`,
      }}
    >
      <div style={{ fontSize: 38, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: '#0F172A' }}>
        {mm}:{ss}
      </div>
      <button
        type="button"
        onClick={toggle}
        aria-label={recording ? 'Dừng ghi âm' : 'Bắt đầu ghi âm'}
        style={{
          width: isNhi ? 116 : 96,
          height: isNhi ? 116 : 96,
          borderRadius: 999,
          border: `${recording ? 10 : 6}px solid #FECACA`,
          background: '#DC2626',
          padding: 0,
          boxShadow: '0 10px 24px -6px rgba(220,38,38,0.45)',
        }}
      >
        <span
          style={{
            width: recording ? 32 : 40,
            height: recording ? 32 : 40,
            borderRadius: recording ? 8 : 999,
            background: '#FFFFFF',
            display: 'block',
          }}
        />
      </button>
      <div style={{ fontWeight: 700, color: '#475569', fontSize: isNhi ? 17 : 14 }}>
        {recording ? 'Đang ghi âm… bấm nút đỏ để dừng' : 'Bấm nút đỏ để bắt đầu ghi âm'}
      </div>
      {err && (
        <div style={{ display: 'grid', gap: 8, justifyItems: 'center', textAlign: 'center' }}>
          <div className="muted" style={{ fontSize: 13.5 }}>{err}</div>
          <button type="button" onClick={() => onRecorded('Bản ghi âm đọc bài (12 giây)')} style={{ minHeight: 40, fontSize: 13.5 }}>
            🎙️ Dùng bản ghi mẫu để thử nộp bài
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Toàn bộ trải nghiệm Cổng Học sinh trên Web:
 * - Chế độ Nhí (lớp 1–5): 3 tab (Nhà · Bài đã nộp · Sticker của con), Chép Con đồng hành, loa đọc, nút 2×2cm, Cổng phụ huynh.
 * - Chế độ Teen (lớp 6–9): 4 tab (Việc cần làm · Môn học · Thông báo · Tôi), giao diện hiện đại gọn gàng.
 */
export function StudentPortal({ initialMode = 'nhi', initialData }: { initialMode?: 'nhi' | 'teen'; initialData?: StudentPortalData }) {
  const router = useRouter();
  const [data, setData] = useState<StudentPortalData>(() => initialData ?? (initialMode === 'teen' ? buildDemoTeen() : buildDemoNhi()));
  const [nhiTab, setNhiTab] = useState<'home' | 'submitted' | 'stickers'>('home');
  const [teenTab, setTeenTab] = useState<'todo' | 'subjects' | 'notify' | 'me'>('todo');
  const [activeSubject, setActiveSubject] = useState<StudentSubject | null>(null);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [draftFiles, setDraftFiles] = useState<{ kind: 'photo' | 'audio' | 'video'; label: string; url?: string }[]>([]);
  const [showAudioPanel, setShowAudioPanel] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  const [gateOpen, setGateOpen] = useState(false);

  const isNhi = data.mode === 'nhi';
  const { speaking, speak, stop } = useReadAloud(isNhi ? 0.88 : 0.96);

  const switchDemoMode = (mode: 'nhi' | 'teen') => {
    stop();
    setData(mode === 'teen' ? buildDemoTeen() : buildDemoNhi());
    setActiveSubject(null);
    setActiveTaskId(null);
    setDraftFiles([]);
    setShowAudioPanel(false);
    setNhiTab('home');
    setTeenTab('todo');
  };

  const todoTasks = data.tasks.filter(isTodo);
  const doneTasks = data.tasks.filter((t) => t.status === 'submitted' || t.status === 'graded');
  const gradedStickers = data.tasks.filter((t) => t.feedback?.sticker);
  const activeTask = activeTaskId ? data.tasks.find((t) => t.id === activeTaskId) ?? null : null;

  const hour = new Date().getHours();
  const isLateNight = hour >= 21 || hour < 5;
  const heroMood: ChepConMood = isLateNight ? 'sleep' : todoTasks.length === 0 ? 'bubbles' : 'wave';
  const heroLine = isLateNight
    ? 'Khuya rồi, mai mình học tiếp nhé!'
    : todoTasks.length === 0
      ? 'Hôm nay hết bài rồi, đi chơi thôi!'
      : `${data.nickname} ơi, hôm nay mình có ${todoTasks.length} bài nè!`;

  const pendingOf = (subjectId: number) => todoTasks.filter((t) => t.subject.id === subjectId).length;

  const openTask = (task: StudentTask) => {
    stop();
    setActiveTaskId(task.id);
    setDraftFiles([]);
    setShowAudioPanel(false);
  };

  const handleFilePick = (kind: 'photo' | 'video') => (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setDraftFiles((prev) => [...prev, { kind, label: file.name, url }]);
    e.target.value = '';
  };

  const submitTask = () => {
    if (!activeTask || draftFiles.length === 0) return;
    setSubmitting(true);
    setTimeout(() => {
      setSubmitting(false);
      setCelebrate(true);
      setData((prev) => ({
        ...prev,
        waterDrops: prev.waterDrops + 1,
        tasks: prev.tasks.map((t) =>
          t.id === activeTask.id
            ? { ...t, status: 'submitted', submittedAt: new Date().toISOString(), submittedPreview: draftFiles }
            : t,
        ),
      }));
      setDraftFiles([]);
      setShowAudioPanel(false);
      setTimeout(() => setCelebrate(false), 3400);
    }, 1100);
  };

  const handleExit = () => {
    stop();
    studentWebSession.set(null);
    setGateOpen(false);
    router.push('/dang-nhap');
  };

  const waterTarget = 5;
  const currentGateDrops = data.waterDrops % waterTarget;
  const gatesPassed = Math.floor(data.waterDrops / waterTarget);

  // Phân nhóm việc cần làm cho Teen (mục 7.2)
  const now = Date.now();
  const todayTasks = todoTasks.filter((t) => new Date(t.dueAt).getTime() - now <= 24 * 3600_000);
  const weekTasks = todoTasks.filter((t) => new Date(t.dueAt).getTime() - now > 24 * 3600_000);

  return (
    <div
      style={{
        minHeight: '100vh',
        paddingBottom: 112,
        background: isNhi
          ? 'radial-gradient(900px 520px at 10% -5%, rgba(254,215,170,0.65), transparent 58%), radial-gradient(750px 500px at 95% 5%, rgba(186,230,253,0.55), transparent 55%), #FFFBF5'
          : 'radial-gradient(800px 450px at 90% -5%, rgba(224,242,254,0.55), transparent 55%), #F8FAFC',
        fontFamily: isNhi ? "'Nunito', 'Be Vietnam Pro', sans-serif" : "'Be Vietnam Pro', system-ui, sans-serif",
      }}
    >
      <ConfettiBurst active={celebrate} />

      {/* Thanh chuyển thử chế độ Nhí / Teen khi đang ở chế độ trải nghiệm */}
      {data.isDemo && (
        <div
          style={{
            background: 'rgba(15,23,42,0.92)',
            color: '#fff',
            padding: '10px 16px',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap',
            fontSize: 13.5,
          }}
        >
          <span style={{ opacity: 0.85 }}>✨ Chế độ trải nghiệm nhanh:</span>
          <div style={{ display: 'inline-flex', gap: 6 }}>
            <button
              type="button"
              onClick={() => switchDemoMode('nhi')}
              style={{
                minHeight: 34,
                padding: '0 14px',
                borderRadius: 999,
                border: 'none',
                fontSize: 13,
                background: isNhi ? '#EA580C' : 'rgba(255,255,255,0.14)',
                color: '#fff',
              }}
            >
              🐟 Chế độ Nhí (Lớp 1–5)
            </button>
            <button
              type="button"
              onClick={() => switchDemoMode('teen')}
              style={{
                minHeight: 34,
                padding: '0 14px',
                borderRadius: 999,
                border: 'none',
                fontSize: 13,
                background: !isNhi ? '#0284C7' : 'rgba(255,255,255,0.14)',
                color: '#fff',
              }}
            >
              ⚡ Chế độ Teen (Lớp 6–9)
            </button>
          </div>
          <Link href="/dang-nhap-hoc-sinh" style={{ color: '#FDBA74', fontWeight: 700 }}>
            Đăng nhập bằng thẻ thật →
          </Link>
        </div>
      )}

      <main style={{ maxWidth: 760, margin: '0 auto', padding: isNhi ? '20px 18px 28px' : '22px 18px 28px' }}>
        {/* ===== HEADER HỌC SINH ===== */}
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              aria-hidden="true"
              style={{
                width: isNhi ? 54 : 44,
                height: isNhi ? 54 : 44,
                borderRadius: 999,
                background: isNhi ? 'linear-gradient(135deg, #FF8A3D, #EA580C)' : 'linear-gradient(135deg, #0EA5E9, #2563EB)',
                color: '#fff',
                fontSize: isNhi ? 24 : 18,
                fontWeight: 800,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 6px 14px -4px rgba(15,23,42,0.2)',
              }}
            >
              {data.nickname.charAt(0).toUpperCase()}
            </div>
            <div>
              <div style={{ fontSize: isNhi ? 24 : 20, fontWeight: 800, lineHeight: 1.2, color: '#0F172A' }}>
                {isNhi ? `Chào ${data.nickname}!` : data.studentName}
              </div>
              <div className="muted" style={{ fontSize: isNhi ? 15 : 13.5, fontWeight: 600 }}>
                Lớp {data.className} · {isNhi ? 'Tiểu học' : 'THCS'}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {isNhi && (
              <button
                type="button"
                onClick={() => speak(`Chào ${data.nickname}! ${heroLine}`)}
                aria-label="Nghe Chép Con chào"
                style={{
                  minHeight: 46,
                  padding: '0 14px',
                  borderRadius: 999,
                  background: '#E0F2FE',
                  border: '2px solid #7DD3FC',
                  color: '#075985',
                  fontSize: 15,
                }}
              >
                {speaking ? '⏹️ Dừng' : '🔊 Nghe'}
              </button>
            )}
            <button
              type="button"
              onClick={() => (isNhi ? setGateOpen(true) : handleExit())}
              style={{ minHeight: 44, padding: '0 14px', borderRadius: 999, fontSize: 14 }}
            >
              {isNhi ? '🔒 Thoát' : 'Thoát'}
            </button>
          </div>
        </header>

        {/* ===== MÀN CHI TIẾT & NỘP BÀI ===== */}
        {activeTask ? (
          <section className="stack" style={{ gap: 18 }}>
            <button
              type="button"
              onClick={() => {
                stop();
                setActiveTaskId(null);
              }}
              style={{ alignSelf: 'flex-start', minHeight: 44, borderRadius: 999, padding: '0 18px' }}
            >
              ← Quay lại
            </button>

            <div
              className="card stack"
              style={{
                borderRadius: isNhi ? 28 : 20,
                padding: isNhi ? 24 : 22,
                border: isNhi ? '2px solid #FED7AA' : '1px solid var(--border-soft)',
                gap: 16,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '6px 14px',
                    borderRadius: 999,
                    background: `${activeTask.subject.color}1C`,
                    fontWeight: 800,
                    fontSize: isNhi ? 16 : 13.5,
                  }}
                >
                  <span>{subjectIcon(activeTask.subject.icon)}</span>
                  <span>{activeTask.subject.shortName}</span>
                </span>
                <StatusPill status={activeTask.status} isNhi={isNhi} />
              </div>

              <h1 style={{ fontSize: isNhi ? 26 : 22, margin: 0 }}>{activeTask.title}</h1>
              {activeTask.status !== 'graded' && (
                <div className="muted" style={{ fontWeight: 700, fontSize: isNhi ? 16 : 14 }}>
                  🕒 {friendlyDue(new Date(activeTask.dueAt), new Date())}
                </div>
              )}

              {/* Đề bài + Chép Con đeo tai nghe (bong bóng thoại = nút loa) */}
              <div
                style={{
                  background: isNhi ? '#FFFBF5' : '#F8FAFC',
                  borderRadius: isNhi ? 22 : 16,
                  padding: isNhi ? 20 : 16,
                  border: '1.5px solid #E2E8F0',
                  display: 'grid',
                  gap: 14,
                }}
              >
                <div style={{ fontSize: isNhi ? 20 : 16, lineHeight: 1.55, color: '#0F172A', fontWeight: 600 }}>
                  {activeTask.instructions}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  {isNhi && <ChepConSvg size={64} mood="headphones" />}
                  <button
                    type="button"
                    className="chep-bubble"
                    onClick={() => speak(`${activeTask.title}. ${activeTask.instructions}`)}
                  >
                    <span style={{ fontSize: 22 }}>{speaking ? '⏹️' : '🔊'}</span>
                    <span>{speaking ? 'Dừng đọc đề' : 'Bấm để nghe đọc đề'}</span>
                  </button>
                </div>
              </div>

              {/* Nhận xét / Khen thưởng của cô */}
              {activeTask.feedback && (
                <div
                  style={{
                    borderRadius: isNhi ? 24 : 18,
                    padding: 20,
                    background: activeTask.feedback.requiresRedo ? '#F3E8FF' : '#DCFCE7',
                    border: `2px solid ${activeTask.feedback.requiresRedo ? '#D8B4FE' : '#86EFAC'}`,
                    display: 'grid',
                    gap: 12,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                    {activeTask.feedback.requiresRedo && isNhi && <ChepConSvg size={64} mood="cheer" />}
                    {activeTask.feedback.sticker && !activeTask.feedback.requiresRedo && (
                      <StickerBadge id={activeTask.feedback.sticker} size="large" />
                    )}
                    <div style={{ flex: 1, display: 'grid', gap: 6 }}>
                      <div style={{ fontWeight: 800, fontSize: isNhi ? 20 : 16, color: activeTask.feedback.requiresRedo ? '#6B21A8' : '#166534' }}>
                        {activeTask.feedback.requiresRedo
                          ? isNhi
                            ? `Mình thử lại nhé, Chép tin ${data.nickname} làm được!`
                            : 'Cô nhờ em làm lại bài này'
                          : 'Cô đã chấm & khen con!'}
                      </div>
                      {activeTask.feedback.label && (
                        <div style={{ fontSize: isNhi ? 24 : 22, fontWeight: 800, color: '#0F172A' }}>
                          {activeTask.feedback.label}
                        </div>
                      )}
                      {activeTask.feedback.comment && (
                        <div style={{ fontSize: isNhi ? 18 : 15, color: '#1E293B', lineHeight: 1.5 }}>
                          “{activeTask.feedback.comment}”
                        </div>
                      )}
                    </div>
                  </div>
                  {activeTask.feedback.comment && (
                    <button
                      type="button"
                      className="chep-bubble"
                      style={{ justifySelf: 'start' }}
                      onClick={() => speak(activeTask.feedback?.comment ?? '')}
                    >
                      <span>🔊</span>
                      <span>Nghe lời cô nhận xét</span>
                    </button>
                  )}
                </div>
              )}

              {/* Đang gửi bài: Chép Con bơi vòng tròn */}
              {submitting && (
                <div
                  style={{
                    borderRadius: 22,
                    padding: 22,
                    background: '#E0F2FE',
                    border: '2px solid #7DD3FC',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 16,
                  }}
                >
                  <ChepConSvg size={68} mood="swim" />
                  <div>
                    <div style={{ fontWeight: 800, fontSize: isNhi ? 20 : 17, color: '#075985' }}>Đang gửi bài cho cô…</div>
                    <div style={{ color: '#0369A1', fontSize: 14 }}>Chép Con đang mang bài tới cô giáo nè!</div>
                  </div>
                </div>
              )}

              {/* Nộp xong: Chép Con nhảy bắn bọt + pháo giấy */}
              {celebrate && (
                <div
                  style={{
                    borderRadius: 24,
                    padding: 22,
                    background: 'linear-gradient(135deg, #FFEDD5, #FEF3C7)',
                    border: '2.5px solid #FDBA74',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 16,
                  }}
                >
                  <ChepConSvg size={76} mood="jump" />
                  <div>
                    <div style={{ fontWeight: 800, fontSize: isNhi ? 22 : 18, color: '#9A3412' }}>
                      🎉 Cô nhận được bài rồi!
                    </div>
                    <div style={{ fontWeight: 700, color: '#B45309', fontSize: isNhi ? 17 : 14.5, marginTop: 4 }}>
                      {data.nickname} giỏi lắm! Chép Con vừa nhận thêm +1 giọt nước 💧
                    </div>
                  </div>
                </div>
              )}

              {/* Khu vực chụp ảnh / ghi âm / quay video */}
              {isTodo(activeTask) && !submitting && (
                <div className="stack" style={{ gap: 14, marginTop: 4 }}>
                  {draftFiles.length > 0 && (
                    <div
                      style={{
                        background: '#F8FAFC',
                        borderRadius: 18,
                        padding: 16,
                        border: '1.5px solid #E2E8F0',
                        display: 'grid',
                        gap: 12,
                      }}
                    >
                      <div style={{ fontWeight: 800, fontSize: isNhi ? 18 : 15 }}>👀 Xem lại bài con vừa làm ({draftFiles.length})</div>
                      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                        {draftFiles.map((f, idx) => (
                          <div
                            key={idx}
                            style={{
                              background: '#fff',
                              border: '1.5px solid #E2E8F0',
                              borderRadius: 16,
                              padding: 10,
                              display: 'grid',
                              gap: 8,
                              justifyItems: 'center',
                              minWidth: 120,
                            }}
                          >
                            {f.kind === 'photo' && f.url ? (
                              <img src={f.url} alt={f.label} style={{ width: 108, height: 108, objectFit: 'cover', borderRadius: 12 }} />
                            ) : (
                              <div style={{ fontSize: 34 }}>{f.kind === 'audio' ? '🎙️' : '🎬'}</div>
                            )}
                            <div style={{ fontSize: 12.5, fontWeight: 700, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {f.label}
                            </div>
                            {f.kind === 'audio' && f.url && <audio controls src={f.url} style={{ width: 160, height: 32 }} />}
                            <button
                              type="button"
                              onClick={() => setDraftFiles((prev) => prev.filter((_, i) => i !== idx))}
                              style={{ minHeight: 34, padding: '0 12px', fontSize: 13, borderRadius: 999, background: '#FEE2E2', borderColor: '#FCA5A5', color: '#991B1B' }}
                            >
                              ✕ Làm lại
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {showAudioPanel && (
                    <BrowserAudioRecorder
                      isNhi={isNhi}
                      onRecorded={(label, url) => {
                        setDraftFiles((prev) => [...prev, { kind: 'audio', label, url }]);
                        setShowAudioPanel(false);
                      }}
                    />
                  )}

                  <div className="stack" style={{ gap: 10 }}>
                    {activeTask.submissionKinds.includes('photo') && (
                      <label style={{ cursor: 'pointer' }}>
                        <input type="file" accept="image/*" capture="environment" onChange={handleFilePick('photo')} style={{ display: 'none' }} />
                        <span className={draftFiles.length === 0 && isNhi ? 'btn-nhi' : 'btn'} style={{ width: '100%', minHeight: isNhi ? 68 : 52 }}>
                          📷 {draftFiles.length === 0 ? 'Chụp ảnh / Chọn ảnh bài làm' : 'Chụp thêm ảnh'}
                        </span>
                      </label>
                    )}

                    {activeTask.submissionKinds.includes('audio') && !showAudioPanel && (
                      <button
                        type="button"
                        className={draftFiles.length === 0 && isNhi ? 'btn-nhi' : 'btn'}
                        style={{ width: '100%', minHeight: isNhi ? 68 : 52 }}
                        onClick={() => setShowAudioPanel(true)}
                      >
                        🎙️ Ghi âm bài đọc
                      </button>
                    )}

                    {activeTask.submissionKinds.includes('video') && (
                      <label style={{ cursor: 'pointer' }}>
                        <input type="file" accept="video/*" capture="user" onChange={handleFilePick('video')} style={{ display: 'none' }} />
                        <span className={draftFiles.length === 0 && isNhi ? 'btn-nhi' : 'btn'} style={{ width: '100%', minHeight: isNhi ? 68 : 52 }}>
                          🎬 Quay video / Chọn video
                        </span>
                      </label>
                    )}
                  </div>

                  {draftFiles.length > 0 && (
                    <button
                      type="button"
                      className={isNhi ? 'btn-nhi' : 'primary'}
                      style={{ width: '100%', minHeight: isNhi ? 76 : 56, fontSize: isNhi ? 22 : 17 }}
                      onClick={submitTask}
                    >
                      📨 Gửi cho cô ngay!
                    </button>
                  )}
                </div>
              )}

              {/* Bài đã nộp */}
              {activeTask.submittedPreview && activeTask.submittedPreview.length > 0 && (
                <div style={{ background: '#F8FAFC', borderRadius: 18, padding: 16, border: '1px solid #E2E8F0' }}>
                  <div style={{ fontWeight: 800, marginBottom: 8 }}>📂 Bài con đã gửi</div>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    {activeTask.submittedPreview.map((p, i) => (
                      <span key={i} className="badge badge-info">{p.kind === 'photo' ? '📷' : p.kind === 'audio' ? '🎙️' : '🎬'} {p.label}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>
        ) : activeSubject ? (
          /* ===== DANH SÁCH BÀI CỦA 1 MÔN ===== */
          <section className="stack" style={{ gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button type="button" onClick={() => setActiveSubject(null)} style={{ minHeight: 44, borderRadius: 999, padding: '0 16px' }}>
                ← Quay lại
              </button>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 16px',
                  borderRadius: 999,
                  background: isNhi ? activeSubject.color : `${activeSubject.color}1C`,
                  color: isNhi ? '#fff' : '#0F172A',
                  fontWeight: 800,
                  fontSize: isNhi ? 19 : 16,
                }}
              >
                <span>{subjectIcon(activeSubject.icon)}</span>
                <span>{activeSubject.shortName}</span>
              </span>
            </div>

            {data.tasks.filter((t) => t.subject.id === activeSubject.id).length === 0 ? (
              <div className="card" style={{ textAlign: 'center', padding: 36, borderRadius: 24 }}>
                {isNhi && <ChepConSvg size={80} mood="bubbles" />}
                <h2 style={{ marginTop: 12 }}>Chưa có bài tập nào</h2>
                <p className="muted" style={{ margin: 0 }}>Khi nào cô giao bài mới, bài sẽ hiện ngay ở đây nhé!</p>
              </div>
            ) : (
              data.tasks
                .filter((t) => t.subject.id === activeSubject.id)
                .map((task) => (
                  <button
                    key={task.id}
                    type="button"
                    onClick={() => openTask(task)}
                    className="card"
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      display: 'grid',
                      gap: 10,
                      borderRadius: isNhi ? 24 : 18,
                      borderLeft: `8px solid ${task.subject.color}`,
                      padding: isNhi ? 22 : 18,
                    }}
                  >
                    <div style={{ fontSize: isNhi ? 21 : 17, fontWeight: 800, color: '#0F172A' }}>{task.title}</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <StatusPill status={task.status} isNhi={isNhi} />
                      {isTodo(task) && (
                        <span className="muted" style={{ fontWeight: 700, fontSize: isNhi ? 15 : 13.5 }}>
                          🕒 {friendlyDue(new Date(task.dueAt), new Date())}
                        </span>
                      )}
                    </div>
                  </button>
                ))
            )}
          </section>
        ) : isNhi ? (
          /* ================= CHẾ ĐỘ NHÍ (LỚP 1–5) ================= */
          nhiTab === 'home' ? (
            <div className="stack" style={{ gap: 22 }}>
              {/* Thẻ Hôm nay + Chép Con + Nút Làm ngay siêu to */}
              <section
                style={{
                  background: '#FFFFFF',
                  borderRadius: 30,
                  border: '2.5px solid #FDBA74',
                  padding: '24px 22px',
                  boxShadow: '0 14px 36px -12px rgba(234,88,12,0.18)',
                  display: 'grid',
                  gap: 18,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                  <ChepConSvg size={86} mood={heroMood} />
                  <div style={{ flex: 1, minWidth: 210, display: 'grid', gap: 10 }}>
                    <button type="button" className="chep-bubble" onClick={() => speak(heroLine)}>
                      <span style={{ fontSize: 22 }}>{speaking ? '⏹️' : '🔊'}</span>
                      <span style={{ fontSize: 19, lineHeight: 1.35 }}>{heroLine}</span>
                    </button>
                    {/* Thanh giọt nước Vượt Vũ Môn */}
                    <div style={{ display: 'grid', gap: 6 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 800, color: '#0369A1' }}>
                        <span>💧 {data.waterDrops} giọt nước Vượt Vũ Môn</span>
                        <span>Cổng {gatesPassed + 1}: {currentGateDrops}/{waterTarget}</span>
                      </div>
                      <div style={{ height: 10, borderRadius: 999, background: '#E0F2FE', overflow: 'hidden' }}>
                        <div
                          style={{
                            width: `${Math.round((currentGateDrops / waterTarget) * 100)}%`,
                            height: '100%',
                            background: 'linear-gradient(90deg, #38BDF8, #0284C7)',
                            borderRadius: 999,
                            transition: 'width 0.4s ease',
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {todoTasks[0] && (
                  <button type="button" className="btn-nhi" onClick={() => openTask(todoTasks[0]!)}>
                    <span style={{ fontSize: 26 }}>🚀</span>
                    <span>Làm ngay · {todoTasks[0].subject.shortName}</span>
                  </button>
                )}
              </section>

              {/* Lưới 2 cột môn học rực rỡ, cố định vị trí */}
              <section className="stack" style={{ gap: 14 }}>
                <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>📚 Môn học của {data.nickname}</h2>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>
                  {data.subjects.map((s) => {
                    const p = pendingOf(s.id);
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setActiveSubject(s)}
                        className="subject-tile-web"
                        style={{
                          position: 'relative',
                          minHeight: 148,
                          padding: 18,
                          borderRadius: 26,
                          border: 'none',
                          borderBottom: '6px solid rgba(15,23,42,0.2)',
                          background: `linear-gradient(145deg, ${s.color} 0%, ${s.color}DD 100%)`,
                          color: '#FFFFFF',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'flex-start',
                          justifyContent: 'space-between',
                          textAlign: 'left',
                          boxShadow: '0 10px 24px -8px rgba(15,23,42,0.22)',
                        }}
                      >
                        {p > 0 && (
                          <span
                            style={{
                              position: 'absolute',
                              top: 12,
                              right: 12,
                              minWidth: 34,
                              height: 34,
                              borderRadius: 999,
                              background: '#DC2626',
                              border: '3px solid #FFFFFF',
                              color: '#FFFFFF',
                              fontSize: 16,
                              fontWeight: 800,
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              padding: '0 8px',
                            }}
                          >
                            {p}
                          </span>
                        )}
                        <span
                          aria-hidden="true"
                          style={{
                            width: 56,
                            height: 56,
                            borderRadius: 18,
                            background: 'rgba(255,255,255,0.24)',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 30,
                          }}
                        >
                          {subjectIcon(s.icon)}
                        </span>
                        <span style={{ fontSize: 21, fontWeight: 800, lineHeight: 1.2 }}>{s.shortName}</span>
                      </button>
                    );
                  })}
                </div>
              </section>
            </div>
          ) : nhiTab === 'submitted' ? (
            <section className="stack" style={{ gap: 14 }}>
              <h1 style={{ fontSize: 26, margin: 0 }}>📂 Bài {data.nickname} đã nộp</h1>
              {doneTasks.map((task) => (
                <button
                  key={task.id}
                  type="button"
                  onClick={() => openTask(task)}
                  className="card"
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 14,
                    borderRadius: 24,
                    borderLeft: `8px solid ${task.subject.color}`,
                    padding: 20,
                  }}
                >
                  <div style={{ display: 'grid', gap: 8 }}>
                    <div className="muted" style={{ fontWeight: 700, fontSize: 15 }}>
                      {subjectIcon(task.subject.icon)} {task.subject.shortName}
                      {task.fromFamily ? ' · Bố mẹ giao' : ''}
                    </div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: '#0F172A' }}>{task.title}</div>
                    <StatusPill status={task.status} isNhi />
                  </div>
                  {task.feedback?.sticker && <StickerBadge id={task.feedback.sticker} size="small" />}
                </button>
              ))}
            </section>
          ) : (
            /* Tab Sticker & Hành trình Vượt Vũ Môn */
            <section className="stack" style={{ gap: 20 }}>
              <div
                style={{
                  background: 'linear-gradient(135deg, #FFF7ED 0%, #E0F2FE 100%)',
                  borderRadius: 28,
                  border: '2px solid #FDBA74',
                  padding: 24,
                  display: 'grid',
                  gap: 16,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                  <ChepConSvg size={82} mood="jump" />
                  <div style={{ flex: 1 }}>
                    <h1 style={{ fontSize: 24, margin: '0 0 4px' }}>Hành trình Vượt Vũ Môn</h1>
                    <p style={{ margin: 0, fontSize: 16, color: '#475569', fontWeight: 600 }}>
                      Mỗi bài con nộp là 1 giọt nước 💧 cho Chép Con. Con đã tích được <strong>{data.waterDrops} giọt</strong> rồi!
                    </p>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                  {[
                    { icon: '🧣', label: 'Khăn quàng', need: 3 },
                    { icon: '🧢', label: 'Mũ xinh', need: 5 },
                    { icon: '🎒', label: 'Cặp sách', need: 10 },
                    { icon: '🐉', label: 'Rồng nhỏ', need: 20 },
                  ].map((gift) => {
                    const unlocked = data.waterDrops >= gift.need;
                    return (
                      <div
                        key={gift.label}
                        style={{
                          background: unlocked ? '#FFFFFF' : 'rgba(255,255,255,0.55)',
                          borderRadius: 18,
                          padding: '12px 8px',
                          textAlign: 'center',
                          border: unlocked ? '2px solid #FBBF24' : '1.5px dashed #CBD5E1',
                          opacity: unlocked ? 1 : 0.7,
                        }}
                      >
                        <div style={{ fontSize: 28 }}>{gift.icon}</div>
                        <div style={{ fontWeight: 800, fontSize: 13.5, marginTop: 4 }}>{gift.label}</div>
                        <div style={{ fontSize: 12, color: unlocked ? '#15803D' : '#64748B', fontWeight: 700 }}>
                          {unlocked ? '✓ Đã nhận' : `${gift.need} 💧`}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <h2 style={{ margin: 0, fontSize: 22 }}>⭐ Bộ Sticker của {data.nickname} ({gradedStickers.length})</h2>
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                {gradedStickers.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => openTask(t)}
                    style={{ background: 'none', border: 'none', padding: 0, boxShadow: 'none' }}
                  >
                    <StickerBadge id={t.feedback!.sticker!} size="large" />
                  </button>
                ))}
              </div>
            </section>
          )
        ) : (
          /* ================= CHẾ ĐỘ TEEN (LỚP 6–9) ================= */
          teenTab === 'todo' ? (
            <section className="stack" style={{ gap: 20 }}>
              <div
                style={{
                  background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)',
                  color: '#FFFFFF',
                  borderRadius: 22,
                  padding: '22px 24px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 16,
                  flexWrap: 'wrap',
                }}
              >
                <div>
                  <div style={{ fontSize: 13, opacity: 0.75, fontWeight: 600 }}>TỔNG QUAN HÔM NAY</div>
                  <div style={{ fontSize: 22, fontWeight: 800, marginTop: 4 }}>
                    {todoTasks.length > 0 ? `Còn ${todoTasks.length} bài cần hoàn thành` : 'Bạn đã hoàn thành hết bài tập!'}
                  </div>
                </div>
                {todoTasks[0] && (
                  <button type="button" className="primary" onClick={() => openTask(todoTasks[0]!)}>
                    Làm bài gần hạn nhất →
                  </button>
                )}
              </div>

              {todayTasks.length > 0 && (
                <div className="stack" style={{ gap: 10 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#64748B', letterSpacing: '0.04em' }}>HÔM NAY ({todayTasks.length})</div>
                  {todayTasks.map((task) => (
                    <button
                      key={task.id}
                      type="button"
                      onClick={() => openTask(task)}
                      className="card"
                      style={{ width: '100%', textAlign: 'left', display: 'grid', gap: 8, borderLeft: `6px solid ${task.subject.color}`, padding: 18 }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontWeight: 700, fontSize: 13.5, color: '#475569' }}>
                          {subjectIcon(task.subject.icon)} {task.subject.shortName}
                        </span>
                        <span className="muted" style={{ fontSize: 13, fontWeight: 700 }}>🕒 {friendlyDue(new Date(task.dueAt), new Date())}</span>
                      </div>
                      <div style={{ fontWeight: 800, fontSize: 16.5, color: '#0F172A' }}>{task.title}</div>
                      <StatusPill status={task.status} isNhi={false} />
                    </button>
                  ))}
                </div>
              )}

              {weekTasks.length > 0 && (
                <div className="stack" style={{ gap: 10 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#64748B', letterSpacing: '0.04em' }}>TUẦN NÀY ({weekTasks.length})</div>
                  {weekTasks.map((task) => (
                    <button
                      key={task.id}
                      type="button"
                      onClick={() => openTask(task)}
                      className="card"
                      style={{ width: '100%', textAlign: 'left', display: 'grid', gap: 8, borderLeft: `6px solid ${task.subject.color}`, padding: 18 }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontWeight: 700, fontSize: 13.5, color: '#475569' }}>
                          {subjectIcon(task.subject.icon)} {task.subject.shortName}
                        </span>
                        <span className="muted" style={{ fontSize: 13, fontWeight: 700 }}>🕒 {friendlyDue(new Date(task.dueAt), new Date())}</span>
                      </div>
                      <div style={{ fontWeight: 800, fontSize: 16.5, color: '#0F172A' }}>{task.title}</div>
                      <StatusPill status={task.status} isNhi={false} />
                    </button>
                  ))}
                </div>
              )}
            </section>
          ) : teenTab === 'subjects' ? (
            <section className="stack" style={{ gap: 14 }}>
              <h1 style={{ margin: 0, fontSize: 22 }}>Môn học Lớp {data.className}</h1>
              <div className="grid-2">
                {data.subjects.map((s) => {
                  const p = pendingOf(s.id);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setActiveSubject(s)}
                      className="card"
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 12,
                        borderLeft: `6px solid ${s.color}`,
                        padding: 18,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span className="subject-chip" style={{ background: `${s.color}1C` }}>{subjectIcon(s.icon)}</span>
                        <div>
                          <div style={{ fontWeight: 800, fontSize: 16 }}>{s.shortName}</div>
                          {s.gradingScheme && <div className="muted" style={{ fontSize: 13 }}>{s.gradingScheme}</div>}
                        </div>
                      </div>
                      {p > 0 && <span className="badge">{p} bài</span>}
                    </button>
                  );
                })}
              </div>
            </section>
          ) : teenTab === 'notify' ? (
            <section className="stack" style={{ gap: 12 }}>
              <h1 style={{ margin: 0, fontSize: 22 }}>Thông báo</h1>
              {data.tasks.slice(0, 4).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => openTask(t)}
                  className="card"
                  style={{ width: '100%', textAlign: 'left', display: 'grid', gap: 4, padding: 16 }}
                >
                  <div style={{ fontWeight: 700, fontSize: 15 }}>
                    {t.status === 'graded' ? '⭐ Cô đã chấm bài' : t.status === 'returned' ? '🔄 Cô nhờ làm lại' : '🎒 Bài tập mới'} · {t.subject.shortName}
                  </div>
                  <div className="muted" style={{ fontSize: 14 }}>{t.title}</div>
                </button>
              ))}
            </section>
          ) : (
            <section className="stack" style={{ gap: 16 }}>
              <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                <div>
                  <h1 style={{ margin: 0, fontSize: 22 }}>{data.studentName}</h1>
                  <div className="muted">Lớp {data.className} · Đã nộp {doneTasks.length} bài</div>
                </div>
                <span className="badge badge-ok">✓ Đang học</span>
              </div>
              <h2 style={{ margin: 0 }}>Sticker thầy cô khen ({gradedStickers.length})</h2>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {gradedStickers.map((t) => (
                  <StickerBadge key={t.id} id={t.feedback!.sticker!} size="small" />
                ))}
              </div>
            </section>
          )
        )}
      </main>

      {/* ===== THANH ĐIỀU HƯỚNG ĐÁY (Nhí: 3 tab · Teen: 4 tab đúng mục 7.1 & 7.2) ===== */}
      <nav
        className="student-bottom-nav"
        aria-label="Điều hướng học sinh"
        style={{ gridTemplateColumns: isNhi ? 'repeat(3, 1fr)' : 'repeat(4, 1fr)' }}
      >
        {isNhi ? (
          <>
            <button
              type="button"
              className="student-nav-btn"
              aria-current={nhiTab === 'home' && !activeTask && !activeSubject ? 'page' : undefined}
              onClick={() => {
                setNhiTab('home');
                setActiveSubject(null);
                setActiveTaskId(null);
              }}
            >
              <span style={{ fontSize: 22 }}>🏠</span>
              <span>Nhà</span>
            </button>
            <button
              type="button"
              className="student-nav-btn"
              aria-current={nhiTab === 'submitted' && !activeTask ? 'page' : undefined}
              onClick={() => {
                setNhiTab('submitted');
                setActiveSubject(null);
                setActiveTaskId(null);
              }}
            >
              <span style={{ fontSize: 22 }}>📂</span>
              <span>Bài đã nộp</span>
            </button>
            <button
              type="button"
              className="student-nav-btn"
              aria-current={nhiTab === 'stickers' && !activeTask ? 'page' : undefined}
              onClick={() => {
                setNhiTab('stickers');
                setActiveSubject(null);
                setActiveTaskId(null);
              }}
            >
              <span style={{ fontSize: 22 }}>⭐</span>
              <span>Sticker của con</span>
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className="student-nav-btn"
              aria-current={teenTab === 'todo' && !activeTask ? 'page' : undefined}
              onClick={() => {
                setTeenTab('todo');
                setActiveSubject(null);
                setActiveTaskId(null);
              }}
            >
              <span style={{ fontSize: 20 }}>✅</span>
              <span>Việc cần làm</span>
            </button>
            <button
              type="button"
              className="student-nav-btn"
              aria-current={teenTab === 'subjects' && !activeTask ? 'page' : undefined}
              onClick={() => {
                setTeenTab('subjects');
                setActiveSubject(null);
                setActiveTaskId(null);
              }}
            >
              <span style={{ fontSize: 20 }}>📚</span>
              <span>Môn học</span>
            </button>
            <button
              type="button"
              className="student-nav-btn"
              aria-current={teenTab === 'notify' && !activeTask ? 'page' : undefined}
              onClick={() => {
                setTeenTab('notify');
                setActiveSubject(null);
                setActiveTaskId(null);
              }}
            >
              <span style={{ fontSize: 20 }}>🔔</span>
              <span>Thông báo</span>
            </button>
            <button
              type="button"
              className="student-nav-btn"
              aria-current={teenTab === 'me' && !activeTask ? 'page' : undefined}
              onClick={() => {
                setTeenTab('me');
                setActiveSubject(null);
                setActiveTaskId(null);
              }}
            >
              <span style={{ fontSize: 20 }}>👤</span>
              <span>Tôi</span>
            </button>
          </>
        )}
      </nav>

      <ParentGateModal open={gateOpen} onPass={handleExit} onClose={() => setGateOpen(false)} />
    </div>
  );
}
