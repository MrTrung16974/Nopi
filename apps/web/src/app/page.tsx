'use client';
import { mySchoolSchema, teacherOverviewSchema } from '@nopi/contracts';
import { subjectIcon } from '@nopi/ui';
import Link from 'next/link';
import { z } from 'zod';
import { ChepConSvg } from '@/components/ChepConSvg';
import { Shell } from '@/components/Shell';
import { call } from '@/lib/client';
import { useApi } from '@/lib/use-api';

const ROLE: Record<string, string> = { admin: 'Quản trị', teacher: 'Giáo viên', guardian_owner: 'Gia đình' };

function MySchools() {
  const { data, error, loading } = useApi(() => call('/me/schools', { schema: z.array(mySchoolSchema) }), []);
  const ov = useApi(() => call('/teacher/overview', { schema: teacherOverviewSchema }), []);
  const toGrade = ov.data?.toGrade ?? 0;

  return (
    <>
      {ov.data && ov.data.teaching.length > 0 && (
        <section style={{ marginBottom: 36 }}>
          <div className="hero-banner">
            <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
              <ChepConSvg size={64} />
              <div>
                <span className={toGrade > 0 ? 'badge' : 'badge badge-ok'} style={{ marginBottom: 8 }}>
                  {toGrade > 0 ? `Chờ chấm ${toGrade} bài` : 'Đã hoàn thành chấm bài'}
                </span>
                <h1 style={{ margin: 0 }}>{toGrade > 0 ? `Hôm nay cần chấm ${toGrade} bài` : 'Không có bài nào chờ chấm'}</h1>
                <p className="muted" style={{ margin: '4px 0 0', fontSize: 14.5 }}>
                  Bạn đang phụ trách <strong>{ov.data.teaching.length}</strong> lớp–môn. Chọn lớp bên dưới để giao bài hoặc chấm nhanh.
                </p>
              </div>
            </div>
          </div>

          <h2>Lớp đang dạy</h2>
          <div className="grid-2">
            {ov.data.teaching.map((x) => (
              <Link
                key={x.teachingAssignmentId}
                href={`/day/${x.teachingAssignmentId}`}
                className="card"
                style={{
                  color: 'inherit',
                  borderLeft: `6px solid ${x.subject.color}`,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                }}
              >
                <span className="subject-chip" style={{ background: `${x.subject.color}1C` }} aria-hidden="true">
                  {subjectIcon(x.subject.icon)}
                </span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 800, fontSize: 16.5 }}>
                    {x.subject.shortName} · Lớp {x.class.name}
                  </div>
                  <div className="muted" style={{ fontSize: 13.5, marginTop: 3 }}>
                    {x.studentCount} học sinh · {x.openAssignments} bài đang mở
                  </div>
                </div>
                {x.toGrade > 0 && <span className="badge">Chờ chấm {x.toGrade}</span>}
              </Link>
            ))}
          </div>
        </section>
      )}

      <section>
        <h1>Trường & Không gian của tôi</h1>
        <p className="muted" style={{ margin: '0 0 18px' }}>
          Quản lý lớp học, nhập danh sách học sinh, hoặc giao bài trực tiếp cho con tại nhà.
        </p>

        {loading && <p className="muted">Đang tải…</p>}
        {error && <div className="error">{error}</div>}
        {data?.length === 0 && (
          <div className="card">
            <p className="muted" style={{ margin: 0 }}>
              Bạn chưa thuộc trường nào. Nếu là giáo viên, hãy nhờ quản trị trường thêm số điện thoại của bạn.
            </p>
          </div>
        )}

        <div className="grid-2">
          {data?.map((s) => (
            <Link
              key={s.id}
              href={s.kind === 'family' ? '/gia-dinh' : `/truong/${s.id}`}
              className="card"
              style={{ color: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14 }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <span className="subject-chip" style={{ background: 'var(--primary-soft)' }} aria-hidden="true">
                  {s.kind === 'family' ? '🏠' : '🏫'}
                </span>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 16.5 }}>{s.name}</div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                    {s.roles.map((r) => (
                      <span key={r} className="badge">{ROLE[r]}</span>
                    ))}
                  </div>
                </div>
              </div>
              <span className="muted" style={{ fontSize: 18 }} aria-hidden="true">→</span>
            </Link>
          ))}
        </div>

        <div className="grid-2" style={{ marginTop: 22 }}>
          {data && !data.some((s) => s.kind === 'family') && (
            <div
              className="card"
              style={{
                background: 'linear-gradient(135deg, #fff7ed 0%, #ffffff 100%)',
                borderColor: 'rgba(251,146,60,0.35)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                gap: 14,
              }}
            >
              <div>
                <span className="badge" style={{ marginBottom: 8 }}>Dành cho phụ huynh</span>
                <div style={{ fontWeight: 800, fontSize: 18 }}>🏠 Không gian gia đình</div>
                <p className="muted" style={{ margin: '6px 0 0', fontSize: 14 }}>
                  Bố mẹ tự giao bài và nhận xét cho con lớp 1–9 ngay tại nhà kể cả khi trường chưa dùng Nopi.
                </p>
              </div>
              <div>
                <Link href="/gia-dinh" className="btn primary">Mở không gian gia đình</Link>
              </div>
            </div>
          )}

          <div
            className="card"
            style={{
              background: 'linear-gradient(135deg, #f0f9ff 0%, #ffffff 100%)',
              borderColor: 'rgba(56,189,248,0.3)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              gap: 14,
            }}
          >
            <div>
              <span className="badge badge-info" style={{ marginBottom: 8 }}>Chương trình GDPT 2018</span>
              <div style={{ fontWeight: 800, fontSize: 18 }}>📚 Giao diện học sinh Lớp 1–9</div>
              <p className="muted" style={{ margin: '6px 0 0', fontSize: 14 }}>
                Xem trước trải nghiệm chế độ Nhí (lớp 1–5) và chế độ Teen (lớp 6–9) cùng danh mục môn học chuẩn.
              </p>
            </div>
            <div>
              <Link href="/mon-hoc?lop=1" className="btn">Khám phá ngay →</Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

export default function Home() {
  return (
    <Shell>
      <MySchools />
    </Shell>
  );
}
