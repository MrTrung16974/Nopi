import { Inject, Injectable } from '@nestjs/common';
import { schema, type Database, type DbOrTx } from '@nopi/db';
import { generateStudentCode } from '@nopi/domain';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { AppError, DB, secureRandomInt } from '../../../platform/index.js';

const { students, guardians } = schema;

export interface NewStudent {
  homeSchoolId: string;
  fullName: string;
  nickname?: string | null;
  birthDate?: string | null;
}

/** Hồ sơ học sinh. Mô-đun org gọi khi thêm học sinh vào lớp hoặc nhập Excel. */
@Injectable()
export class StudentDirectory {
  constructor(@Inject(DB) private readonly db: Database) {}

  /** Tạo hồ sơ với mã học sinh 8 số duy nhất (thử lại nếu trùng). */
  async create(input: NewStudent, tx: DbOrTx = this.db) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const studentCode = generateStudentCode(secureRandomInt);
      const rows = await tx
        .insert(students)
        .values({
          homeSchoolId: input.homeSchoolId,
          fullName: input.fullName,
          nickname: input.nickname ?? null,
          birthDate: input.birthDate ?? null,
          studentCode,
        })
        .onConflictDoNothing({ target: students.studentCode })
        .returning({ id: students.id, studentCode: students.studentCode });
      if (rows[0]) return rows[0];
    }
    throw new AppError('internal', 'Chưa tạo được mã học sinh, vui lòng thử lại');
  }

  async get(studentId: string, tx: DbOrTx = this.db) {
    const [s] = await tx.select().from(students).where(eq(students.id, studentId));
    if (!s) throw new AppError('not_found', 'Không tìm thấy học sinh');
    return s;
  }

  async namesOf(ids: string[], tx: DbOrTx = this.db) {
    if (ids.length === 0) return new Map<string, { id: string; fullName: string; nickname: string | null }>();
    const rows = await tx.select({ id: students.id, fullName: students.fullName, nickname: students.nickname }).from(students).where(inArray(students.id, ids));
    return new Map(rows.map((r) => [r.id, r]));
  }

  /** Thông tin bổ sung cho danh sách lớp: số phụ huynh đã liên kết, đã có PIN chưa. */
  async summaries(studentIds: string[], tx: DbOrTx = this.db) {
    if (studentIds.length === 0) return new Map<string, { studentCode: string; guardianCount: number; hasPin: boolean }>();
    const rows = await tx
      .select({
        id: students.id,
        studentCode: students.studentCode,
        hasPin: sql<boolean>`${students.pinHash} IS NOT NULL`,
        guardianCount: sql<number>`count(${guardians.userId})::int`,
      })
      .from(students)
      .leftJoin(guardians, and(eq(guardians.studentId, students.id), isNull(guardians.revokedAt)))
      .where(inArray(students.id, studentIds))
      .groupBy(students.id);
    return new Map(rows.map((r) => [r.id, r]));
  }
}
