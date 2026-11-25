import { Inject, Injectable, Logger } from '@nestjs/common';
import { schema, type DbOrTx } from '@nopi/db';
import type { Actor } from './auth/actor.js';
import { DB } from './database.js';

export interface AuditEntry {
  actor: Actor | 'system';
  action: string; // 'guardian.link', 'student.pin.set', 'auth.login'…
  targetType: string;
  targetId: string;
  schoolId?: string | null;
  studentId?: string | null;
  metadata?: Record<string, unknown>;
}

/** Nhật ký "ai làm gì với dữ liệu học sinh nào". Lỗi ghi log không được làm hỏng nghiệp vụ. */
@Injectable()
export class AuditLog {
  private readonly logger = new Logger(AuditLog.name);
  constructor(@Inject(DB) private readonly db: DbOrTx) {}

  async record(e: AuditEntry, tx: DbOrTx = this.db) {
    const actor =
      e.actor === 'system'
        ? { actorType: 'system', actorId: 'system' }
        : e.actor.kind === 'user'
          ? { actorType: 'user', actorId: e.actor.userId }
          : { actorType: 'student', actorId: e.actor.studentId };
    try {
      await tx.insert(schema.auditLogs).values({
        ...actor,
        action: e.action,
        targetType: e.targetType,
        targetId: e.targetId,
        schoolId: e.schoolId ?? null,
        studentId: e.studentId ?? null,
        metadata: e.metadata ?? null,
      });
    } catch (err) {
      this.logger.error(`Không ghi được audit log ${e.action}: ${String(err)}`);
    }
  }
}
