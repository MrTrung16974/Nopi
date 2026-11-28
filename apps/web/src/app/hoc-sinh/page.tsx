import { redirect } from 'next/navigation';
import { StudentHome } from './StudentHome';

/** Cổng Học sinh — dữ liệu thật của em đang đăng nhập. Link cũ ?demo=… chuyển sang bản trải nghiệm. */
export default async function StudentPortalPage({ searchParams }: { searchParams: Promise<{ demo?: string }> }) {
  const demo = (await searchParams).demo;
  if (demo) redirect(`/trai-nghiem?che-do=${demo === 'teen' ? 'teen' : 'nhi'}`);
  return <StudentHome />;
}
