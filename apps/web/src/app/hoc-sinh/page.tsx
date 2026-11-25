import { StudentPortal } from '@/components/StudentPortal';

export default async function StudentPortalPage({ searchParams }: { searchParams: Promise<{ demo?: string }> }) {
  const demo = (await searchParams).demo;
  const initialMode = demo === 'teen' ? 'teen' : 'nhi';
  return <StudentPortal initialMode={initialMode} />;
}
