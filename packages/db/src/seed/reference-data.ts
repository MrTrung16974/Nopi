import { and, eq, isNull, sql } from 'drizzle-orm';
import type { Database } from '../client.js';
import { assignmentTemplates, commentTemplates, gradeSubjects, plans, subjects } from '../schema/index.js';
import { PLANS } from './plans.js';
import { SUBJECTS, SYSTEM_ASSIGNMENT_TEMPLATES, SYSTEM_COMMENTS } from './curriculum-gdpt-2018.js';

/** Seed dữ liệu tham chiếu. Chạy lại nhiều lần an toàn (upsert theo khoá tự nhiên). */
export async function seedReferenceData(db: Database) {
  await db.transaction(async (tx) => {
    // 1. Môn học
    const rows = await tx
      .insert(subjects)
      .values(SUBJECTS.map(({ grades: _g, groupCode, ...s }) => ({ ...s, groupCode: groupCode ?? null })))
      .onConflictDoUpdate({
        target: subjects.code,
        set: {
          name: sql`excluded.name`,
          shortName: sql`excluded.short_name`,
          groupCode: sql`excluded.group_code`,
          icon: sql`excluded.icon`,
          color: sql`excluded.color`,
        },
      })
      .returning({ id: subjects.id, code: subjects.code });
    const idByCode = new Map(rows.map((r) => [r.code, r.id]));

    // 2. Môn theo khối — thay toàn bộ để phản ánh đúng file seed
    const gs = SUBJECTS.flatMap((s, order) =>
      Object.entries(s.grades).map(([grade, cfg]) => ({
        grade: Number(grade),
        subjectId: idByCode.get(s.code)!,
        isOptional: cfg!.optional ?? false,
        gradingScheme: cfg!.scheme,
        sortOrder: order + 1,
      })),
    );
    await tx.delete(gradeSubjects);
    await tx.insert(gradeSubjects).values(gs);

    // 3. Câu nhận xét mẫu của hệ thống
    await tx.delete(commentTemplates).where(isNull(commentTemplates.ownerUserId));
    await tx.insert(commentTemplates).values(
      SYSTEM_COMMENTS.map((c, i) => ({
        stage: c.stage,
        subjectId: c.subjectCode ? idByCode.get(c.subjectCode)! : null,
        text: c.text,
        sortOrder: i,
      })),
    );

    // 4. Gói bán (giá tạm)
    for (const p of PLANS) {
      await tx
        .insert(plans)
        .values({ ...p, features: p.features })
        .onConflictDoUpdate({ target: plans.id, set: { name: p.name, buyer: p.buyer, period: p.period, priceVnd: p.priceVnd, isActive: p.isActive, features: p.features } });
    }

    // 5. Mẫu bài của hệ thống
    await tx
      .delete(assignmentTemplates)
      .where(and(isNull(assignmentTemplates.schoolId), isNull(assignmentTemplates.ownerUserId)));
    await tx.insert(assignmentTemplates).values(
      SYSTEM_ASSIGNMENT_TEMPLATES.map((t) => ({
        code: t.code,
        name: t.name,
        suggestedSubjectCodes: [...t.subjects],
        defaults: t.defaults,
      })),
    );
  });

  const [{ count } = { count: 0 }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(gradeSubjects)
    .where(eq(gradeSubjects.grade, 1));
  return { subjects: SUBJECTS.length, grade1Subjects: count };
}
