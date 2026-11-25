import { gradeSubjectsResponseSchema, scanJobSchema, type MediaView, type ScanJobDto } from '@nopi/contracts';
import { vi } from '@nopi/copy';
import { useQuery } from '@tanstack/react-query';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, View } from 'react-native';
import { PrimaryButton } from '@/components/PrimaryButton';
import { ScanReviewList, type ReviewItem } from '@/components/ScanReviewList';
import { Screen } from '@/components/Screen';
import { T } from '@/components/Text';
import { TextField } from '@/components/TextField';
import { api, ApiError } from '@/platform/api';
import { fileSize } from '@/platform/files';
import { scanDraft } from '@/platform/scan-draft';
import { useStudentHome } from '@/platform/student-mode';
import { ThemeProvider, useTheme } from '@/platform/theme';
import { uploadNow } from '@/platform/upload/direct';

type Step = 'capture' | 'reading' | 'review';

/**
 * Quét đề (mục 6.5): chụp 1–5 trang → AI tách từng câu → soát lại.
 * - mode=assign (giáo viên / bố mẹ): sang màn giao bài với đề đã soát.
 * - mode=practice (học sinh lớp 6–9): lưu thành bài tự luyện.
 */
function ScanScreen() {
  const t = useTheme();
  const { mode, taId } = useLocalSearchParams<{ mode: 'assign' | 'practice'; taId?: string }>();
  const as = mode === 'practice' ? 'student' : 'adult';
  const cam = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [pages, setPages] = useState<{ uri: string; size: number }[]>([]);
  const [step, setStep] = useState<Step>('capture');
  const [job, setJob] = useState<ScanJobDto | null>(null);
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [subjectId, setSubjectId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const home = useStudentHome();
  const subjects = useQuery({
    queryKey: ['curriculum', home.data?.grade],
    queryFn: () => api(`/curriculum/grades/${home.data!.grade}/subjects`, { as: 'none', schema: gradeSubjectsResponseSchema }),
    enabled: mode === 'practice' && Boolean(home.data?.grade),
  });

  const shoot = async () => {
    if (!cam.current || pages.length >= 5) return;
    setError(null);
    try {
      const pic = await cam.current.takePictureAsync({ quality: 0.9 });
      // Ảnh đề cần nét hơn ảnh bài nộp để AI đọc chữ nhỏ, công thức
      const ctx = ImageManipulator.manipulate(pic.uri);
      if (pic.width >= pic.height) ctx.resize({ width: Math.min(2000, pic.width) });
      else ctx.resize({ height: Math.min(2000, pic.height) });
      const out = await (await ctx.renderAsync()).saveAsync({ format: SaveFormat.JPEG, compress: 0.85 });
      const size = await fileSize(out.uri);
      setPages((p) => [...p, { uri: out.uri, size }]);
    } catch {
      setError('Chưa chụp được, thử lại nhé');
    }
  };

  const read = async () => {
    setStep('reading');
    setError(null);
    try {
      const ids: string[] = [];
      for (const p of pages) {
        ids.push(await uploadNow('/scan/uploads', { localUri: p.uri, kind: 'photo', mimeType: 'image/jpeg', sizeBytes: p.size }, { as, extraBody: { teachingAssignmentId: taId } }));
      }
      let j = await api('/scan-jobs', { method: 'POST', as, body: { mediaIds: ids, teachingAssignmentId: taId }, schema: scanJobSchema });
      for (let i = 0; i < 90 && (j.status === 'queued' || j.status === 'running'); i++) {
        await new Promise((r) => setTimeout(r, 1500));
        j = await api(`/scan-jobs/${j.id}`, { as, schema: scanJobSchema });
      }
      if (j.status !== 'done' || !j.result) throw new ApiError('scan', j.error ?? 'Chưa đọc được đề, thử lại nhé');
      setJob(j);
      setItems(j.result.items.map(({ number: _n, ...it }, i) => ({ ...it, key: `${j.id}-${i}` })));
      setTitle(j.result.title);
      setStep('review');
    } catch (e) {
      setError(e instanceof ApiError ? e.friendly : String(e));
      setStep('capture');
    }
  };

  const finish = async () => {
    if (!job) return;
    const clean = items.map(({ key: _k, ...it }) => it).filter((it) => it.promptText.trim());
    if (mode === 'assign') {
      scanDraft.set({ scanJobId: job.id, teachingAssignmentId: taId!, title, instructions: job.result?.instructions ?? null, items: clean, originalMediaIds: job.sourceMedia.map((m: MediaView) => m.id) });
      router.replace({ pathname: '/giao-vien/giao-bai', params: { taId: taId!, fromScan: '1' } });
      return;
    }
    setSaving(true);
    try {
      const r = await api('/student/practice', { method: 'POST', as: 'student', body: { scanJobId: job.id, subjectId, title, items: clean } });
      router.replace({ pathname: '/bai/[id]', params: { id: (r as { studentAssignmentId: string }).studentAssignmentId, as: 'student' } });
    } catch (e) {
      setError(e instanceof ApiError ? e.friendly : String(e));
    } finally {
      setSaving(false);
    }
  };

  if (step === 'reading') {
    return (
      <Screen>
        <View style={{ alignItems: 'center', gap: 16, paddingVertical: 48 }}>
          <ActivityIndicator size="large" color={t.color.primary} />
          <T>{vi.scan.reading}</T>
        </View>
      </Screen>
    );
  }

  if (step === 'review' && job) {
    const canSave = items.some((it) => it.promptText.trim()) && title.trim() && (mode === 'assign' || subjectId);
    return (
      <Screen footer={<PrimaryButton label={mode === 'assign' ? vi.scan.continueAssign : vi.scan.savePractice} onPress={finish} disabled={!canSave} loading={saving} />}>
        <T variant="title">{vi.scan.reviewTitle}</T>
        <TextField label={mode === 'assign' ? vi.teacher.titleLabel : vi.scan.practiceTitle} value={title} onChangeText={setTitle} />
        {mode === 'practice' && (
          <View style={{ gap: 6 }}>
            <T variant="muted">{vi.scan.practiceSubject}</T>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {subjects.data?.subjects.map((s) => (
                <Pressable key={s.id} accessibilityRole="radio" accessibilityState={{ selected: subjectId === s.id }} onPress={() => setSubjectId(s.id)} style={{ paddingHorizontal: 14, minHeight: 44, justifyContent: 'center', borderRadius: 999, borderWidth: 1.5, borderColor: subjectId === s.id ? t.color.primary : t.color.border, backgroundColor: subjectId === s.id ? '#FFEDD5' : t.color.surface }}>
                  <T>{s.shortName}</T>
                </Pressable>
              ))}
            </View>
          </View>
        )}
        <ScanReviewList originals={job.sourceMedia} items={items} onChange={setItems} />
        {error && <T variant="error">{error}</T>}
      </Screen>
    );
  }

  if (!permission) return null;
  if (!permission.granted) {
    return (
      <Screen footer={<PrimaryButton label={vi.scanner.allow} onPress={requestPermission} />}>
        <T>Nopi cần dùng camera để chụp trang đề</T>
      </Screen>
    );
  }
  return (
    <Screen footer={pages.length > 0 ? <PrimaryButton label={`${vi.scan.read} (${pages.length})`} onPress={read} /> : undefined}>
      <View style={{ aspectRatio: 3 / 4, borderRadius: 16, overflow: 'hidden', backgroundColor: '#000' }}>
        <CameraView ref={cam} style={{ flex: 1 }} facing="back" />
      </View>
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
        {pages.map((p, i) => (
          <Pressable key={p.uri} accessibilityLabel={`Bỏ trang ${i + 1}`} onPress={() => setPages((ps) => ps.filter((x) => x.uri !== p.uri))}>
            <Image source={{ uri: p.uri }} style={{ width: 48, height: 64, borderRadius: 6 }} />
          </Pressable>
        ))}
        <T variant="muted">{vi.scan.pagesTaken(pages.length)}</T>
      </View>
      <PrimaryButton label={vi.scan.capturePage} onPress={shoot} disabled={pages.length >= 5} />
      {error && <T variant="error">{error}</T>}
    </Screen>
  );
}

export default function Route() {
  const { mode } = useLocalSearchParams<{ mode: string }>();
  return (
    <ThemeProvider mode={mode === 'practice' ? 'teen' : 'adult'}>
      <ScanScreen />
    </ThemeProvider>
  );
}


