import { assignmentTemplateSchema, teacherOverviewSchema } from '@nopi/contracts';
import { vi } from '@nopi/copy';
import { defaultDueAt, fromVn, vnParts } from '@nopi/domain';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { scanDraft, type ScanDraft } from '@/platform/scan-draft';
import { SecondaryButton } from '@/components/SecondaryButton';
import { Pressable, View } from 'react-native';
import { z } from 'zod';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { T } from '@/components/Text';
import { TextField } from '@/components/TextField';
import { api, ApiError } from '@/platform/api';
import { ThemeProvider, useTheme } from '@/platform/theme';

type Kind = 'photo' | 'video' | 'audio';
type DueKey = 'tonight' | 'tomorrow' | 'twoDays' | 'week';

function dueFor(key: DueKey, now = new Date()) {
  const p = vnParts(now);
  if (key === 'tonight') return fromVn(p.year, p.month, p.day, 21, 0);
  if (key === 'twoDays') return fromVn(p.year, p.month, p.day + 2, 20, 0);
  if (key === 'week') return fromVn(p.year, p.month, p.day + 7, 20, 0);
  return defaultDueAt(now);
}

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on }}
      onPress={onPress}
      style={{ minHeight: t.touch.min, paddingHorizontal: 16, borderRadius: 999, justifyContent: 'center', borderWidth: 1.5, borderColor: on ? t.color.primary : t.color.border, backgroundColor: on ? '#FFEDD5' : t.color.surface }}
    >
      <T>{label}</T>
    </Pressable>
  );
}

/** Giao bài trong 3 bước (mục 6.1): lớp – nội dung – hạn. Mặc định lớp vừa chọn, hạn 20:00 ngày mai. */
function CreateAssignment() {
  const { taId, fromScan } = useLocalSearchParams<{ taId: string; fromScan?: string }>();
  // Đề đã soát từ màn quét (nếu có)
  const scan = useRef<ScanDraft | null>(fromScan ? scanDraft.take(taId) : null);
  const qc = useQueryClient();
  const ov = useQuery({ queryKey: ['teacher', 'overview'], queryFn: () => api('/teacher/overview', { schema: teacherOverviewSchema }) });
  const current = ov.data?.teaching.find((x) => x.teachingAssignmentId === taId);
  const templates = useQuery({
    queryKey: ['templates', current?.subject.id],
    queryFn: () => api(`/assignment-templates?subjectId=${current!.subject.id}`, { schema: z.array(assignmentTemplateSchema) }),
    enabled: Boolean(current),
  });
  const [classes, setClasses] = useState<string[]>([taId]);
  const [title, setTitle] = useState(scan.current?.title ?? '');
  const [instructions, setInstructions] = useState(scan.current?.instructions ?? '');
  const [kinds, setKinds] = useState<Kind[]>(() => {
    const it = scan.current?.items ?? [];
    const k: Kind[] = [...(it.some((x) => x.itemType !== 'read_aloud') || it.length === 0 ? (['photo'] as Kind[]) : []), ...(it.some((x) => x.itemType === 'read_aloud') ? (['audio'] as Kind[]) : [])];
    return k;
  });
  const [limits, setLimits] = useState({ maxPhotos: 5, maxMediaSeconds: 120 });
  const [due, setDue] = useState<DueKey>('tomorrow');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => setClasses([taId]), [taId]);
  // Lớp cùng môn để giao một lần cho nhiều lớp (4A, 4B, 4C)
  const sameSubject = ov.data?.teaching.filter((x) => x.subject.id === current?.subject.id) ?? [];

  const applyTemplate = (tpl: z.infer<typeof assignmentTemplateSchema>) => {
    setKinds(tpl.defaults.submissionKinds.filter((k): k is Kind => k !== 'document'));
    setLimits({ maxPhotos: tpl.defaults.maxPhotos || 5, maxMediaSeconds: tpl.defaults.maxMediaSeconds || 120 });
    if (!title) setTitle(tpl.name);
  };

  const submit = async () => {
    setLoading(true);
    setError(null);
    try {
      await api('/assignments', {
        method: 'POST',
        body: {
          teachingAssignmentIds: classes,
          title,
          instructions: instructions || undefined,
          submissionKinds: kinds,
          ...limits,
          dueAt: dueFor(due).toISOString(),
          ...(scan.current ? { source: 'scan', scanJobId: scan.current.scanJobId, items: scan.current.items, originalMediaIds: scan.current.originalMediaIds } : {}),
        },
      });
      await qc.invalidateQueries({ queryKey: ['teaching'] });
      await qc.invalidateQueries({ queryKey: ['teacher'] });
      router.back();
    } catch (e) {
      setError(e instanceof ApiError ? e.friendly : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen footer={<PrimaryButton label={vi.actions.assignNow} onPress={submit} loading={loading} disabled={!title.trim() || kinds.length === 0 || classes.length === 0} />}>
      <T style={{ fontWeight: '700' }}>1. {vi.teacher.classesStep}</T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {sameSubject.map((x) => (
          <Chip
            key={x.teachingAssignmentId}
            label={`${x.subject.shortName} ${x.class.name}`}
            on={classes.includes(x.teachingAssignmentId)}
            onPress={() => setClasses((c) => (c.includes(x.teachingAssignmentId) ? c.filter((y) => y !== x.teachingAssignmentId) : [...c, x.teachingAssignmentId]))}
          />
        ))}
      </View>

      <T style={{ fontWeight: '700' }}>2. {vi.teacher.contentStep}</T>
      {scan.current ? (
        <T variant="muted">📷 Đề từ ảnh quét: {scan.current.items.length} câu, kèm {scan.current.originalMediaIds.length} ảnh gốc</T>
      ) : (
        <SecondaryButton label={vi.scan.button} onPress={() => router.push({ pathname: '/quet-de', params: { mode: 'assign', taId } })} />
      )}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {templates.data?.slice(0, 5).map((tpl) => <Chip key={tpl.id} label={tpl.name} on={false} onPress={() => applyTemplate(tpl)} />)}
      </View>
      <TextField label={vi.teacher.titleLabel} value={title} onChangeText={setTitle} placeholder="Ví dụ: Bài 3, 4 trang 25" />
      <TextField label={vi.teacher.instructionsLabel} value={instructions} onChangeText={setInstructions} multiline style={{ minHeight: 96, textAlignVertical: 'top', paddingTop: 12 }} />
      <T variant="muted">{vi.teacher.kindsLabel}</T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {(['photo', 'video', 'audio'] as Kind[]).map((k) => (
          <Chip key={k} label={vi.kinds[k]} on={kinds.includes(k)} onPress={() => setKinds((ks) => (ks.includes(k) ? ks.filter((x) => x !== k) : [...ks, k]))} />
        ))}
      </View>

      <T style={{ fontWeight: '700' }}>3. {vi.teacher.dueLabel}</T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {(Object.keys(vi.teacher.dueOptions) as DueKey[]).map((k) => (
          <Chip key={k} label={vi.teacher.dueOptions[k]} on={due === k} onPress={() => setDue(k)} />
        ))}
      </View>
      {error && <T variant="error">{error}</T>}
    </Screen>
  );
}

export default function Route() {
  return (
    <ThemeProvider mode="adult">
      <CreateAssignment />
    </ThemeProvider>
  );
}
