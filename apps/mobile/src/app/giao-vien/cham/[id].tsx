import { commentTemplateSchema, gradingRowSchema, teacherAssignmentSchema, type GradingRow } from '@nopi/contracts';
import { vi } from '@nopi/copy';
import { stageOfGrade, STICKERS, type Grade } from '@nopi/domain';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { z } from 'zod';
import { AudioRecorderPanel } from '@/components/AudioRecorderPanel';
import { MediaGallery } from '@/components/MediaGallery';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { SecondaryButton } from '@/components/SecondaryButton';
import { Sticker } from '@/components/Sticker';
import { T } from '@/components/Text';
import { TextField } from '@/components/TextField';
import { api, ApiError } from '@/platform/api';
import { fileSize } from '@/platform/files';
import { ThemeProvider, useTheme } from '@/platform/theme';
import { uploadNow } from '@/platform/upload/direct';

const LEVELS = { completion_level: ['HOAN_THANH_TOT', 'HOAN_THANH', 'CHUA_HOAN_THANH'], pass_fail: ['DAT', 'CHUA_DAT'] } as const;

/**
 * Chấm liên tục (mục 6.3/7.4): bài làm ở trên, phía dưới là nút mức đánh giá, câu nhận xét mẫu,
 * micro, sticker và "Lưu & bài tiếp". Nhận xét không cần gõ phím.
 */
function Grader() {
  const t = useTheme();
  const qc = useQueryClient();
  const { id, start } = useLocalSearchParams<{ id: string; start?: string }>();
  const a = useQuery({ queryKey: ['assignment', id], queryFn: () => api(`/assignments/${id}`, { schema: teacherAssignmentSchema }) });
  const rows = useQuery({ queryKey: ['assignment', id, 'grading'], queryFn: () => api(`/assignments/${id}/submissions`, { schema: z.array(gradingRowSchema) }) });
  const comments = useQuery({
    queryKey: ['comments', a.data?.subject.id],
    queryFn: () => api(`/comment-templates?subjectId=${a.data!.subject.id}&stage=${stageOfGrade(a.data!.class.grade as Grade)}`, { schema: z.array(commentTemplateSchema) }),
    enabled: Boolean(a.data),
  });

  // Hàng chờ chấm: bắt đầu từ em được chọn (nếu có), rồi các em "Chờ chấm"
  const queue = useMemo(() => {
    const all = rows.data ?? [];
    const waiting = all.filter((r) => r.status === 'submitted');
    const first = start ? all.find((r) => r.studentAssignmentId === start) : undefined;
    return first ? [first, ...waiting.filter((r) => r.studentAssignmentId !== first.studentAssignmentId)] : waiting;
  }, [rows.data, start]);
  const [index, setIndex] = useState(0);
  const row: GradingRow | undefined = queue[index];

  const [level, setLevel] = useState<string | null>(null);
  const [score, setScore] = useState('');
  const [comment, setComment] = useState('');
  const [sticker, setSticker] = useState<string | null>(null);
  const [audioId, setAudioId] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Mở bài mới → nạp nhận xét cũ (nếu đang sửa) hoặc làm trống
  useEffect(() => {
    const e = row?.evaluation;
    setLevel(e?.level ?? null);
    setScore(e?.score !== null && e?.score !== undefined ? String(e.score).replace('.', ',') : '');
    setComment(e?.comment ?? '');
    setSticker(e?.sticker ?? null);
    setAudioId(null);
    setError(null);
    setRecording(false);
  }, [row?.studentAssignmentId]);

  if (!a.data || !rows.data) return <Screen><T variant="muted">Đang tải…</T></Screen>;
  if (!row) {
    return (
      <Screen footer={<PrimaryButton label="Xong" onPress={() => router.back()} />}>
        <T variant="title">🎉 {vi.teacher.allDone}</T>
      </Screen>
    );
  }
  const scheme = a.data.gradingScheme;

  const save = async (requiresRedo: boolean) => {
    if (!row.latest) return;
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { requiresRedo, comment: comment || undefined, sticker: sticker ?? undefined, commentAudioId: audioId ?? undefined };
      if (!requiresRedo) {
        if (scheme === 'score_10') body.score = Number(score.replace(',', '.'));
        else body.level = level ?? undefined;
      }
      await api(`/submissions/${row.latest.id}/evaluation`, { method: 'PUT', body });
      await qc.invalidateQueries({ queryKey: ['teacher'] });
      setIndex((i) => i + 1);
    } catch (e) {
      setError(e instanceof ApiError ? e.friendly : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen
      footer={
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}><SecondaryButton label={vi.teacher.requireRedo} onPress={() => save(true)} disabled={saving} /></View>
          <View style={{ flex: 1.4 }}><PrimaryButton label={vi.teacher.saveNext} onPress={() => save(false)} loading={saving} /></View>
        </View>
      }
    >
      <Stack.Screen options={{ title: `${index + 1}/${queue.length} · ${a.data.subject.shortName} ${a.data.class.name}` }} />
      <T variant="title">{row.student.fullName}</T>
      {row.latest ? (
        <>
          <T variant="muted">
            {vi.work.attempt(row.latest.attemptNo)}{row.latest.isLate ? ` · ${vi.lateLabel}` : ''}{row.latest.byGuardian ? ` · ${vi.guardianSubmittedLabel}` : ''}
          </T>
          <MediaGallery media={row.latest.media} size={160} />
          {row.latest.note && <T>“{row.latest.note}”</T>}
        </>
      ) : (
        <T variant="muted">{vi.teacher.noSubmission}</T>
      )}

      {scheme === 'score_10' ? (
        <TextField label={vi.teacher.scoreLabel} value={score} onChangeText={setScore} keyboardType="decimal-pad" maxLength={5} placeholder="8,5" />
      ) : (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {LEVELS[scheme].map((l) => (
            <Pressable
              key={l}
              accessibilityRole="radio"
              accessibilityState={{ selected: level === l }}
              onPress={() => setLevel(l)}
              style={{ flex: 1, minHeight: 64, borderRadius: 12, alignItems: 'center', justifyContent: 'center', padding: 6, borderWidth: 2, borderColor: level === l ? t.color.primary : t.color.border, backgroundColor: level === l ? '#FFEDD5' : t.color.surface }}
            >
              <T style={{ textAlign: 'center', fontWeight: '700' }}>{vi.levels[l]}</T>
            </Pressable>
          ))}
        </View>
      )}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {comments.data?.slice(0, 8).map((c) => (
          <Pressable key={c.id} accessibilityRole="button" onPress={() => setComment(c.text)} style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: comment === c.text ? '#FFEDD5' : '#F1F5F9' }}>
            <T variant="muted">{c.text}</T>
          </Pressable>
        ))}
      </View>
      <TextField label={vi.teacher.commentLabel} value={comment} onChangeText={setComment} multiline />

      {recording ? (
        <AudioRecorderPanel
          maxSeconds={60}
          onDone={async (r) => {
            setRecording(false);
            try {
              setAudioId(await uploadNow(`/submissions/${row.latest!.id}/comment-uploads`, { localUri: r.uri, kind: 'audio', mimeType: r.mimeType, sizeBytes: await fileSize(r.uri), durationS: r.durationS }));
            } catch (e) {
              setError(e instanceof ApiError ? e.friendly : 'Chưa tải được ghi âm');
            }
          }}
        />
      ) : (
        <SecondaryButton label={audioId ? '🎙️ Đã ghi nhận xét — ghi lại' : '🎙️ Nói nhận xét'} onPress={() => setRecording(true)} />
      )}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {STICKERS.map((s) => (
          <Pressable key={s.id} accessibilityRole="radio" accessibilityState={{ selected: sticker === s.id }} onPress={() => setSticker(sticker === s.id ? null : s.id)} style={{ borderRadius: 16, borderWidth: 2, borderColor: sticker === s.id ? t.color.primary : 'transparent' }}>
            <Sticker id={s.id} size="small" />
          </Pressable>
        ))}
      </View>
      {error && <T variant="error">{error}</T>}
    </Screen>
  );
}

export default function Route() {
  return (
    <ThemeProvider mode="adult">
      <Grader />
    </ThemeProvider>
  );
}
