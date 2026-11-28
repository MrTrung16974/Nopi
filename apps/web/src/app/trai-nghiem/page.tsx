import { StudentPortal } from '@/components/StudentPortal';

/** Bản trải nghiệm Cổng Học sinh (dữ liệu mẫu, không cần đăng nhập): ?che-do=nhi|teen */
export default async function StudentDemoPage({ searchParams }: { searchParams: Promise<{ 'che-do'?: string }> }) {
  const mode = (await searchParams)['che-do'] === 'teen' ? 'teen' : 'nhi';
  return <StudentPortal initialMode={mode} />;
}
