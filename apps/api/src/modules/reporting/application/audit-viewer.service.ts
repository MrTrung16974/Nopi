import { Inject, Injectable } from '@nestjs/common';
import type { z } from 'zod';
import type { auditLogQuerySchema, auditLogSchema } from '@nopi/contracts';
import { schema, type Database } from '@nopi/db';
import { and, desc, eq, like, lt } from 'drizzle-orm';
import { AuditLog, DB, type Actor } from '../../../platform/index.js';
import { StudentDirectory, UserDirectory } from '../../identity/public-api.js';
import { AccessService } from '../../org/public-api.js';

const { auditLogs } = schema;

/**
 * Xem nhật ký truy cập của trường (quản trị trường). Bảng audit_logs chỉ ghi thêm (trigger chặn sửa/xoá).
 * Lần xem trang đầu cũng được ghi lại — "ai đã xem nhật ký".
 */
@Injectable()
export class AuditViewerService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly access: AccessService,
    private readonly users: UserDirectory,
    private readonly students: StudentDirectory,
    private readonly audit: AuditLog,
  ) {}

  async list(actor: Actor, schoolId: string, q: z.infer<typeof auditLogQuerySchema>): Promise<z.infer<typeof auditLogSchema>> {
    const admin = await this.access.requireSchoolRole(actor, schoolId, ['admin']);
    const conds = [eq(auditLogs.schoolId, schoolId)];
    if (q.studentId) conds.push(eq(auditLogs.studentId, q.studentId));
    if (q.action) conds.push(like(auditLogs.action, `${q.action.replace(/[%_]/g, '')}%`));
    if (q.before) conds.push(lt(auditLogs.id, q.before));
    const rows = await this.db
      .select()
      .from(auditLogs)
      .where(and(...conds))
      .orderBy(desc(auditLogs.id))
      .limit(q.limit + 1);
    const page = rows.slice(0, q.limit);
    const userIds = [...new Set(page.filter((r) => r.actorType === 'user').map((r) => r.actorId))];
    const studentIds = [...new Set([...page.filter((r) => r.actorType === 'student').map((r) => r.actorId), ...page.map((r) => r.studentId).filter((x): x is string => Boolean(x))])];
    const [users, names] = await Promise.all([this.users.findByIds(userIds), this.students.namesOf(studentIds)]);
    const userName = new Map(users.map((u) => [u.id, u.fullName]));
    if (!q.before) {
      await this.audit.record({ actor: admin, action: 'audit.view', targetType: 'school', targetId: schoolId, schoolId, studentId: q.studentId ?? null });
    }
    return {
      items: page.map((r) => ({
        id: r.id,
        at: r.createdAt.toISOString(),
        actorType: r.actorType,
        actorName: r.actorType === 'system' ? 'Hệ thống' : r.actorType === 'user' ? (userName.get(r.actorId) ?? 'Người dùng đã xoá') : (names.get(r.actorId)?.fullName ?? 'Học sinh'),
        action: r.action,
        targetType: r.targetType,
        studentName: r.studentId ? (names.get(r.studentId)?.fullName ?? null) : null,
        metadata: (r.metadata as Record<string, unknown> | null) ?? null,
      })),
      nextBefore: rows.length > q.limit ? page[page.length - 1]!.id : null,
    };
  }
}
