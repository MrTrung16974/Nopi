'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ChepConSvg } from '@/components/ChepConSvg';
import { StudentPortal } from '@/components/StudentPortal';
import { errorText } from '@/lib/client';
import { loadStudentPortal, STUDENT_LOGIN, studentLogout } from '@/lib/student-api';
import { studentWebSession, type StudentPortalData } from '@/lib/student-client';

/** Chưa đăng nhập → trang đăng nhập học sinh; đã đăng nhập → nạp bài thật. */
export function StudentHome() {
  const router = useRouter();
  const [data, setData] = useState<StudentPortalData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setError(null);
    loadStudentPortal().then(setData, (e) => setError(errorText(e)));
  };

  useEffect(() => {
    if (!studentWebSession.get()) {
      router.replace(STUDENT_LOGIN);
      return;
    }
    load();
  }, []);

  if (data) return <StudentPortal initialMode={data.mode} initialData={data} />;

  return (
    <main className="auth-shell">
      <div className="card stack" style={{ width: '100%', maxWidth: 440, padding: 32, borderRadius: 28, gap: 16, textAlign: 'center', justifyItems: 'center' }}>
        <ChepConSvg size={84} mood={error ? 'cheer' : 'swim'} />
        {!error && <p style={{ fontWeight: 700, margin: 0 }}>Chép Con đang mang bài tập tới…</p>}
        {error && (
          <>
            <p className="error" role="alert" style={{ margin: 0 }}>{error}</p>
            <button className="primary" onClick={load}>🔄 Thử lại</button>
            <button
              onClick={async () => {
                await studentLogout();
                router.replace(STUDENT_LOGIN);
              }}
            >
              Đăng nhập lại
            </button>
          </>
        )}
        <Link href="/trai-nghiem" className="muted" style={{ fontSize: 13 }}>Xem bản trải nghiệm</Link>
      </div>
    </main>
  );
}
