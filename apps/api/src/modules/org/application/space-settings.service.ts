import { Inject, Injectable } from '@nestjs/common';
import type { SpaceSettingsDto, updateSpaceSettingsSchema } from '@nopi/contracts';
import { schema, type Database } from '@nopi/db';
import { resolveSpaceSettings, type SpaceSettings } from '@nopi/domain';
import { eq } from 'drizzle-orm';
import type { z } from 'zod';
import { AppError, AuditLog, DB, type Actor } from '../../../platform/index.js';
import { AccessService } from './access.service.js';

/** Cài đặt của trường/gia đình (trần video, thời hạn lưu media, giờ yên lặng…), luôn đã merge mặc định. */
@Injectable()
export class SpaceSettingsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly access: AccessService,
    private readonly audit: AuditLog,
  ) {}

  private async raw(schoolId: string) {
    const [row] = await this.db.select({ settings: schema.schools.settings }).from(schema.schools).where(eq(schema.schools.id, schoolId));
    if (!row) throw new AppError('not_found', 'Không tìm thấy trường');
    return (row.settings ?? {}) as Record<string, unknown>;
  }

  async get(schoolId: string): Promise<SpaceSettings> {
    return resolveSpaceSettings(await this.raw(schoolId));
  }

  private toDto(s: SpaceSettings): SpaceSettingsDto {
    return {
      quietHours: s.quietHours,
      teacherDigestTime: s.teacherDigestTime,
      scanQuotaPerDay: s.scanQuotaPerDay,
      maxVideoSeconds: s.maxVideoSeconds,
      defaultVideoSeconds: s.defaultVideoSeconds,
      retentionDays: s.retentionDays,
    };
  }

  /** Thành viên của trường/không gian đều xem được (app cần giờ yên lặng, trần video…). */
  async view(actor: Actor, schoolId: string) {
    await this.access.requireSchoolRole(actor, schoolId, ['admin', 'guardian_owner', 'teacher']);
    return this.toDto(await this.get(schoolId));
  }

  /** Quản trị trường / bố mẹ chủ không gian gia đình sửa. Thời hạn lưu mới áp dụng cho file tải lên từ nay. */
  async update(actor: Actor, schoolId: string, patch: z.infer<typeof updateSpaceSettingsSchema>) {
    const user = await this.access.requireSchoolRole(actor, schoolId, ['admin', 'guardian_owner']);
    const current = await this.raw(schoolId);
    const before = resolveSpaceSettings(current);
    const merged = {
      ...current,
      ...patch,
      quietHours: { ...before.quietHours, ...patch.quietHours },
      retentionDays: { ...before.retentionDays, ...patch.retentionDays },
    };
    const next = resolveSpaceSettings(merged);
    if (next.defaultVideoSeconds !== (patch.defaultVideoSeconds ?? next.defaultVideoSeconds)) {
      throw new AppError('validation_failed', 'Thời lượng mặc định không được dài hơn thời lượng tối đa');
    }
    await this.db.update(schema.schools).set({ settings: next }).where(eq(schema.schools.id, schoolId));
    await this.audit.record({ actor: user, action: 'school.settings.update', targetType: 'school', targetId: schoolId, schoolId, metadata: { changed: Object.keys(patch) } });
    return this.toDto(next);
  }
}
