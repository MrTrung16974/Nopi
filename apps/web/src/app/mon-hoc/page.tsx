import Link from 'next/link';
import { gradeSubjectsResponseSchema } from '@nopi/contracts';
import { gradingSchemes, uiModeOfGrade, type Grade } from '@nopi/domain';
import { subjectIcon, themes } from '@nopi/ui';
import { ChepConSvg } from '@/components/ChepConSvg';
import { apiGet } from '../_lib/api';

const GRADES = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

/** Xem trước giao diện học sinh lớp 1–9 theo đúng chế độ Nhí (lớp 1–5) & Teen (lớp 6–9). */
export default async function SubjectsPage({ searchParams }: { searchParams: Promise<{ lop?: string }> }) {
  const raw = Number((await searchParams).lop ?? 1);
  const grade = (GRADES.includes(raw as Grade) ? raw : 1) as Grade;
  const data = await apiGet(`/v1/curriculum/grades/${grade}/subjects`, gradeSubjectsResponseSchema);
  const t = themes[uiModeOfGrade(grade)];
  const isNhi = t.mode === 'nhi';

  return (
    <div
      style={{
        minHeight: '100vh',
        background: isNhi
          ? 'radial-gradient(800px 500px at 10% 0%, rgba(254,215,170,0.55), transparent 60%), radial-gradient(700px 450px at 90% 10%, rgba(186,230,253,0.45), transparent 55%), #FFFBF5'
          : 'radial-gradient(800px 500px at 90% 0%, rgba(224,242,254,0.6), transparent 55%), #F8FAFC',
        fontFamily: `'${t.font.family}', 'Be Vietnam Pro', sans-serif`,
      }}
    >
      <main style={{ maxWidth: 960, margin: '0 auto', padding: '28px 20px 80px' }}>
        {/* Thanh trên */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <Link href="/" className="btn" style={{ minHeight: 42, padding: '0 16px', fontSize: 14, borderRadius: 999 }}>
            ← Về trang chủ
          </Link>
          <span className={isNhi ? 'badge' : 'badge badge-info'} style={{ padding: '7px 14px', fontSize: 13 }}>
            {isNhi ? '✨ Chế độ Nhí · Tiểu học (Lớp 1–5)' : '⚡ Chế độ Teen · THCS (Lớp 6–9)'}
          </span>
        </div>

        {/* Thanh chọn khối lớp 1–9 */}
        <nav className="grade-pills" aria-label="Chọn khối lớp 1 đến 9">
          {GRADES.map((g) => (
            <Link key={g} href={`/mon-hoc?lop=${g}`} className={`grade-pill${g === grade ? ' active' : ''}`}>
              Lớp {g}
            </Link>
          ))}
        </nav>

        {/* Thẻ Hero mô phỏng màn hình học sinh */}
        <section
          style={{
            background: isNhi
              ? 'linear-gradient(135deg, #FFFFFF 0%, #FFF7ED 100%)'
              : 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)',
            color: isNhi ? '#0F172A' : '#FFFFFF',
            borderRadius: isNhi ? 28 : 22,
            border: isNhi ? '2px solid #FDBA74' : '1px solid rgba(255,255,255,0.1)',
            padding: isNhi ? '28px 28px' : '26px 28px',
            marginBottom: 28,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 20,
            flexWrap: 'wrap',
            boxShadow: isNhi ? '0 14px 34px -10px rgba(234,88,12,0.16)' : '0 16px 36px -12px rgba(15,23,42,0.35)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 18, flex: '1 1 320px' }}>
            {isNhi && <ChepConSvg size={76} />}
            <div>
              <h1 style={{ fontSize: isNhi ? 30 : 24, margin: '0 0 6px', fontFamily: `'${t.font.family}', sans-serif` }}>
                {isNhi ? `Chào bạn nhỏ Lớp ${data.grade}!` : `Không gian học tập Lớp ${data.grade}`}
              </h1>
              <p style={{ margin: 0, fontSize: isNhi ? 17 : 14.5, opacity: isNhi ? 0.78 : 0.8 }}>
                {isNhi
                  ? 'Chữ to 20pt, nút chạm rộng 2×2 cm, có nút loa nghe đề và màu môn cố định giúp bé tự làm bài dễ dàng.'
                  : 'Thiết kế gọn gàng, trưởng thành theo chuẩn THCS — ưu tiên danh sách việc cần làm theo hạn nộp.'}
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {isNhi ? (
              <>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '12px 20px',
                    borderRadius: 999,
                    background: '#E0F2FE',
                    color: '#075985',
                    fontWeight: 800,
                    fontSize: 16,
                    border: '2px solid #7DD3FC',
                  }}
                >
                  🔊 Nghe đề
                </span>
                <Link
                  href="/trai-nghiem?che-do=nhi"
                  className="btn primary"
                  style={{ borderRadius: 999, padding: '0 24px', minHeight: 52, fontSize: 17 }}
                >
                  🚀 Vào học thử Lớp 1–5 →
                </Link>
              </>
            ) : (
              <Link
                href="/trai-nghiem?che-do=teen"
                className="btn primary"
                style={{ borderRadius: 14, padding: '0 20px', minHeight: 46, fontSize: 14.5 }}
              >
                ⚡ Vào học thử Lớp 6–9 →
              </Link>
            )}
          </div>
        </section>

        {/* Lưới môn học */}
        <ul
          style={{
            listStyle: 'none',
            padding: 0,
            margin: 0,
            display: 'grid',
            gridTemplateColumns: isNhi ? 'repeat(auto-fill, minmax(220px, 1fr))' : 'repeat(auto-fill, minmax(260px, 1fr))',
            gap: isNhi ? 18 : 14,
          }}
        >
          {data.subjects.map((s) => (
            <li
              key={s.id}
              className="subject-tile-web"
              style={{
                minHeight: isNhi ? 152 : 104,
                padding: isNhi ? 20 : 18,
                borderRadius: isNhi ? 24 : 16,
                background: t.colorfulSubjects
                  ? `linear-gradient(145deg, ${s.color} 0%, ${s.color}DD 100%)`
                  : '#FFFFFF',
                color: t.colorfulSubjects ? '#FFFFFF' : '#0F172A',
                border: t.colorfulSubjects ? 'none' : '1px solid rgba(15,23,42,0.08)',
                borderLeft: t.colorfulSubjects ? 'none' : `6px solid ${s.color}`,
                borderBottom: t.colorfulSubjects ? '5px solid rgba(15,23,42,0.18)' : '1px solid rgba(15,23,42,0.08)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                gap: 12,
                boxShadow: t.colorfulSubjects
                  ? '0 10px 24px -8px rgba(15,23,42,0.22)'
                  : '0 4px 12px -4px rgba(15,23,42,0.06)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <span
                  aria-hidden="true"
                  style={{
                    width: isNhi ? 54 : 40,
                    height: isNhi ? 54 : 40,
                    borderRadius: isNhi ? 16 : 12,
                    background: t.colorfulSubjects ? 'rgba(255,255,255,0.22)' : `${s.color}1A`,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: isNhi ? 28 : 20,
                  }}
                >
                  {subjectIcon(s.icon)}
                </span>
                {s.isOptional && (
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      padding: '4px 10px',
                      borderRadius: 999,
                      background: t.colorfulSubjects ? 'rgba(255,255,255,0.22)' : '#F1F5F9',
                      color: t.colorfulSubjects ? '#FFFFFF' : '#475569',
                    }}
                  >
                    Tự chọn
                  </span>
                )}
              </div>
              <div>
                <div style={{ fontSize: isNhi ? 21 : 17, fontWeight: 800, lineHeight: 1.25 }}>{s.shortName}</div>
                <div style={{ fontWeight: 500, fontSize: isNhi ? 14 : 13, opacity: t.colorfulSubjects ? 0.9 : 0.72, marginTop: 4 }}>
                  {gradingSchemes.get(s.gradingScheme).name}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
