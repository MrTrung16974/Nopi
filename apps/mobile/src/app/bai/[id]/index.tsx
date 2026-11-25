import { studentAssignmentDetailSchema } from '@nopi/contracts';
import { friendlyDue, vi } from '@nopi/copy';
import { subjectIcon } from '@nopi/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, Text, View } from 'react-native';
import { AudioPlayButton } from '@/components/AudioPlayButton';
import { MascotBanner } from '@/components/ChepCon';
import { MediaGallery } from '@/components/MediaGallery';
import { PrimaryButton } from '@/components/PrimaryButton';
import { ReadAloudButton } from '@/components/ReadAloudButton';
import { Screen } from '@/components/Screen';
import { SecondaryButton } from '@/components/SecondaryButton';
import { StatusBadge } from '@/components/StatusBadge';
import { Sticker } from '@/components/Sticker';
import { T } from '@/components/Text';
import { api, ApiError } from '@/platform/api';
import { draftStore, useDraft } from '@/platform/draft';
import { useStudentMode } from '@/platform/student-mode';
import { ThemeProvider, useTheme } from '@/platform/theme';
import { kickUploads, uploadQueue, useUploadJobs } from '@/platform/upload/queue';

const CAPTURE = { photo: '/bai/[id]/chup', video: '/bai/[id]/quay', audio: '/bai/[id]/ghi-am' } as const;
const ACTION = { photo: vi.actions.takePhoto, video: vi.actions.recordVideo, audio: vi.actions.recordAudio } as const;
const ACTION_ICON = { photo: '📷', video: '🎬', audio: '🎙️' } as const;

/**
 * Màn làm bài dùng chung cho học sinh (Nhí / Teen) và phụ huynh nộp hộ:
 * đề chữ to + loa đọc → nút lớn có biểu tượng theo cách nộp → xem lại → "Gửi cho cô".
 */
function AssignmentScreen({ id, as }: { id: string; as: 'student' | 'adult' }) {
  const t = useTheme();
  const isNhi = t.mode === 'nhi';
  const qc = useQueryClient();
  const audience = as === 'student' ? 'student' : 'guardian';
  const q = useQuery({ queryKey: ['sa', id], queryFn: () => api(`/student-assignments/${id}`, { as, schema: studentAssignmentDetailSchema }) });
  const draft = useDraft(id);
  const jobs = useUploadJobs(id);
  const [celebrate, setCelebrate] = useState(false);
  const pending = jobs.filter((j) => j.state !== 'failed');
  const failed = jobs.find((j) => j.state === 'failed');
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && pending.length === 0) {
      void qc.invalidateQueries({ queryKey: ['sa', id] });
      void qc.invalidateQueries({ queryKey: ['student', 'assignments'] });
    }
    wasPending.current = pending.length > 0;
  }, [pending.length, id, qc]);

  if (q.isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: t.color.bg }}>
        <ActivityIndicator size="large" color={t.color.primary} />
      </View>
    );
  }
  if (q.error || !q.data) return <Screen><T variant="error">{q.error instanceof ApiError ? q.error.friendly : 'Có lỗi xảy ra'}</T></Screen>;
  const d = q.data;
  const photos = draft.filter((f) => f.kind === 'photo').length;
  const showCapture = d.canSubmit && pending.length === 0;
  const pct = Math.round((pending[0]?.progress ?? 0) * 100);

  const send = async () => {
    await uploadQueue.enqueue({ studentAssignmentId: id, as, files: draft.map((f) => ({ ...f })) });
    draftStore.clear(id);
    setCelebrate(true);
    kickUploads();
    setTimeout(() => setCelebrate(false), 3000);
  };

  return (
    <Screen footer={showCapture && draft.length > 0 ? <PrimaryButton icon="📨" label={vi.actions.sendToTeacher} onPress={send} /> : undefined}>
      <Stack.Screen options={{ title: d.subject.shortName }} />

      {/* Tiêu đề & trạng thái */}
      <View style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              backgroundColor: `${d.subject.color}1C`,
              paddingHorizontal: 10,
              paddingVertical: 4,
              borderRadius: 999,
            }}
          >
            <Text accessibilityElementsHidden style={{ fontSize: isNhi ? 16 : 13 }}>{subjectIcon(d.subject.icon)}</Text>
            <Text style={{ fontWeight: '800', color: t.color.text, fontSize: t.font.caption }}>{d.subject.shortName}</Text>
          </View>
          {d.fromFamily && (
            <View style={{ backgroundColor: t.color.primarySoft, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 }}>
              <Text style={{ fontWeight: '700', color: '#9A3412', fontSize: t.font.caption }}>{vi.parentAssignedLabel}</Text>
            </View>
          )}
        </View>
        <T variant="title">{d.title}</T>
        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {d.isPractice ? (
            // Bài tự luyện: không gửi thầy cô, không có hạn thật
            <T style={{ fontWeight: '700', color: d.status === 'submitted' ? '#166534' : '#9A3412' }}>
              {d.status === 'submitted' ? `✅ ${vi.scan.done}` : `📝 ${vi.scan.practiceLabel}`}
            </T>
          ) : (
            <StatusBadge status={d.status} audience={audience} />
          )}
          {d.status !== 'graded' && !d.isPractice && (
            <T variant="muted" style={{ fontWeight: '600' }}>
              🕒 {friendlyDue(new Date(d.dueAt), new Date())}
            </T>
          )}
        </View>
      </View>

      {/* Đề bài + nút loa đọc */}
      {(d.instructions || d.instructionsAudio) && (
        <View
          style={{
            backgroundColor: t.color.surface,
            borderRadius: t.radius.card,
            borderWidth: 1,
            borderColor: t.color.border,
            padding: t.spacing(isNhi ? 2.5 : 4),
            gap: 14,
            shadowColor: '#0F172A',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.05,
            shadowRadius: 6,
            elevation: 1,
          }}
        >
          <T variant="muted" style={{ fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            📝 Đề bài
          </T>
          {d.instructions && (
            <T style={{ fontSize: t.font.body + 2, lineHeight: (t.font.body + 2) * 1.45 }}>{d.instructions}</T>
          )}
          <ReadAloudButton text={d.instructions ?? ''} teacherAudio={d.instructionsAudio} />
        </View>
      )}

      {/* Các câu của đề (soạn tay hoặc quét từ ảnh) + ảnh gốc trang đề */}
      {d.items.length > 0 && (
        <View style={{ backgroundColor: t.color.surface, borderRadius: t.radius.card, borderWidth: 1, borderColor: t.color.border, padding: t.spacing(isNhi ? 2.5 : 4), gap: 12 }}>
          {d.items.map((it) => (
            <View key={it.position} style={{ gap: 4 }}>
              <T style={{ fontWeight: '800' }}>{vi.scan.question(it.position)}</T>
              <T style={{ fontSize: t.font.body + 1, lineHeight: (t.font.body + 1) * 1.45 }}>{it.promptText}</T>
              {it.options?.map((o, j) => <T key={j} variant="muted">{o}</T>)}
            </View>
          ))}
        </View>
      )}
      {d.originals.length > 0 && (
        <View style={{ gap: 6 }}>
          <T variant="muted" style={{ fontWeight: '700' }}>{vi.scan.originals}</T>
          <MediaGallery media={d.originals} size={isNhi ? 120 : 96} />
        </View>
      )}

      {/* Bài tự luyện: em tự đánh dấu đã xong */}
      {d.isPractice && d.status !== 'submitted' && (
        <PrimaryButton
          label={vi.scan.markDone}
          onPress={async () => {
            await api(`/student/practice/${id}/done`, { method: 'POST', as });
            void qc.invalidateQueries({ queryKey: ['sa', id] });
            void qc.invalidateQueries({ queryKey: ['student', 'assignments'] });
          }}
        />
      )}
      {d.isPractice && d.status === 'submitted' && <T style={{ color: '#166534', fontWeight: '800' }}>✅ {vi.scan.done}</T>}

      {/* Nhận xét & khen thưởng của cô */}
      {d.feedback && (
        <View
          style={{
            backgroundColor: d.feedback.requiresRedo ? '#F3E8FF' : '#DCFCE7',
            borderWidth: 2,
            borderColor: d.feedback.requiresRedo ? '#D8B4FE' : '#86EFAC',
            borderRadius: t.radius.card,
            padding: t.spacing(isNhi ? 2.5 : 4),
            gap: 12,
          }}
        >
          <T style={{ fontWeight: '800', color: d.feedback.requiresRedo ? '#6B21A8' : '#166534' }}>
            {d.feedback.requiresRedo ? `🔄 ${vi.work.redoTitle}` : `⭐ ${vi.work.teacherSays}`}
          </T>
          {d.feedback.sticker && <Sticker id={d.feedback.sticker} />}
          {d.feedback.label && (
            <T style={{ fontSize: t.font.title, fontWeight: '800', color: '#0F172A' }}>{d.feedback.label}</T>
          )}
          {d.feedback.comment && <T style={{ lineHeight: t.font.body * 1.45 }}>{d.feedback.comment}</T>}
          {d.feedback.commentAudio?.url && <AudioPlayButton url={d.feedback.commentAudio.url} label={vi.work.playTeacher} />}
        </View>
      )}

      {/* Khen ngay sau khi nộp */}
      {celebrate && (
        <View
          accessibilityLiveRegion="polite"
          style={{
            padding: t.spacing(isNhi ? 2.5 : 4),
            backgroundColor: '#FFEDD5',
            borderWidth: 2,
            borderColor: '#FDBA74',
            borderRadius: t.radius.card,
          }}
        >
          <MascotBanner mood="celebrate" title={vi.sentToTeacher} subtitle="Con giỏi lắm! Bài đang được gửi ngay cho cô." />
        </View>
      )}

      {/* Thanh tiến độ tải ngầm */}
      {pending.length > 0 && !celebrate && (
        <View
          style={{
            gap: 10,
            padding: 16,
            backgroundColor: '#DBEAFE',
            borderWidth: 1,
            borderColor: '#93C5FD',
            borderRadius: t.radius.card,
          }}
        >
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
            <ActivityIndicator color="#1E40AF" />
            <T style={{ fontWeight: '700', color: '#1E40AF' }}>
              {vi.sending} {pct}%
            </T>
          </View>
          <View style={{ height: 8, borderRadius: 999, backgroundColor: '#BFDBFE', overflow: 'hidden' }}>
            <View style={{ width: `${pct}%`, height: '100%', backgroundColor: '#2563EB', borderRadius: 999 }} />
          </View>
        </View>
      )}

      {/* Lỗi gửi bài */}
      {failed && (
        <View
          style={{
            gap: 10,
            padding: 16,
            backgroundColor: '#FEE2E2',
            borderWidth: 1,
            borderColor: '#FCA5A5',
            borderRadius: t.radius.card,
          }}
        >
          <T style={{ fontWeight: '800', color: '#991B1B' }}>⚠️ {vi.work.sendFailed}</T>
          <T>{failed.error}</T>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <SecondaryButton icon="🔄" label={vi.work.tryAgain} onPress={() => uploadQueue.retry(failed.id).then(kickUploads)} />
            </View>
            <SecondaryButton tone="danger" label="Bỏ" onPress={() => uploadQueue.remove(failed.id)} />
          </View>
        </View>
      )}

      {/* Khu vực làm & xem lại bài */}
      {showCapture && (
        <View style={{ gap: 14 }}>
          {draft.length > 0 && (
            <View
              style={{
                gap: 12,
                backgroundColor: t.color.surface,
                borderRadius: t.radius.card,
                borderWidth: 1,
                borderColor: t.color.border,
                padding: t.spacing(isNhi ? 2 : 4),
              }}
            >
              <T style={{ fontWeight: '800' }}>👀 {vi.work.review} ({draft.length})</T>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                {draft.map((f, i) => (
                  <Pressable
                    key={f.localUri}
                    accessibilityRole="button"
                    accessibilityLabel={`${vi.work.retake} ${vi.kinds[f.kind]} ${i + 1}`}
                    onPress={() => draftStore.remove(id, i)}
                    style={({ pressed }) => ({ alignItems: 'center', gap: 6, opacity: pressed ? 0.75 : 1 })}
                  >
                    {f.kind === 'photo' ? (
                      <Image
                        source={{ uri: f.localUri }}
                        style={{ width: isNhi ? 112 : 96, height: isNhi ? 112 : 96, borderRadius: 16, borderWidth: 1, borderColor: t.color.border }}
                      />
                    ) : (
                      <View
                        style={{
                          width: isNhi ? 112 : 96,
                          height: isNhi ? 112 : 96,
                          borderRadius: 16,
                          backgroundColor: t.color.surfaceSoft,
                          borderWidth: 1,
                          borderColor: t.color.border,
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 4,
                        }}
                      >
                        <Text style={{ fontSize: 32 }}>{f.kind === 'audio' ? '🎙️' : '🎬'}</Text>
                        <T variant="muted">{f.durationS ? `${f.durationS}s` : ''}</T>
                      </View>
                    )}
                    <View style={{ backgroundColor: '#FEE2E2', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 }}>
                      <Text style={{ color: '#991B1B', fontWeight: '700', fontSize: 13 }}>✕ {vi.work.retake}</Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            </View>
          )}

          {d.submissionKinds
            .filter((k): k is keyof typeof CAPTURE => k in CAPTURE)
            .filter((k) => (k === 'photo' ? photos < d.maxPhotos : !draft.some((f) => f.kind === k)))
            .map((k) =>
              draft.length === 0 ? (
                <PrimaryButton
                  key={k}
                  icon={ACTION_ICON[k]}
                  label={ACTION[k]}
                  onPress={() => router.push({ pathname: CAPTURE[k], params: { id, max: String(k === 'photo' ? d.maxPhotos : d.maxMediaSeconds) } })}
                />
              ) : (
                <SecondaryButton
                  key={k}
                  icon={ACTION_ICON[k]}
                  label={k === 'photo' ? `${vi.work.addMore} (${vi.work.photosLeft(d.maxPhotos - photos)})` : ACTION[k]}
                  onPress={() => router.push({ pathname: CAPTURE[k], params: { id, max: String(k === 'photo' ? d.maxPhotos : d.maxMediaSeconds) } })}
                />
              ),
            )}
        </View>
      )}

      {/* Lịch sử các lần đã nộp */}
      {d.attempts.length > 0 && (
        <View
          style={{
            gap: 14,
            marginTop: 4,
            backgroundColor: t.color.surface,
            borderRadius: t.radius.card,
            borderWidth: 1,
            borderColor: t.color.border,
            padding: t.spacing(isNhi ? 2 : 4),
          }}
        >
          <T style={{ fontWeight: '800' }}>📂 {vi.work.yourWork}</T>
          {d.attempts.map((a) => (
            <View key={a.id} style={{ gap: 8 }}>
              <T variant="muted" style={{ fontWeight: '600' }}>
                {vi.work.attempt(a.attemptNo)} ·{' '}
                {new Date(a.submittedAt).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}
                {a.isLate ? ` · ${vi.lateLabel}` : ''}
                {a.byGuardian ? ` · ${vi.work.submittedByParent}` : ''}
              </T>
              <MediaGallery media={a.media} size={isNhi ? 120 : 96} />
            </View>
          ))}
        </View>
      )}
    </Screen>
  );
}

export default function AssignmentRoute() {
  const { id, as } = useLocalSearchParams<{ id: string; as?: 'student' | 'adult' }>();
  const role = as === 'adult' ? 'adult' : 'student';
  const studentMode = useStudentMode();
  return (
    <ThemeProvider mode={role === 'adult' ? 'adult' : studentMode}>
      <AssignmentScreen id={id} as={role} />
    </ThemeProvider>
  );
}
