import { Inject, Injectable } from '@nestjs/common';
import type { EntitlementDto } from '@nopi/contracts';
import { schema, type Database } from '@nopi/db';
import { mergeFeatures } from '@nopi/domain';
import { and, desc, eq, gt, inArray, lte, or } from 'drizzle-orm';
import { AppError, CLOCK, DB, type Clock } from '../../../platform/index.js';

const { subscriptions, plans } = schema;
const LIVE = ['trial', 'active', 'grace', 'canceled'] as const; // "canceled" = đã tắt gia hạn nhưng vẫn dùng tới hết kỳ

export type FeatureKey = 'family_space' | 'scan_quota_per_day' | 'retention_days_video';

const MESSAGES: Record<string, string> = {
  family_space: 'Gói gia đình đã hết hạn. Bài cũ và nhận xét của con vẫn được giữ nguyên — gia hạn để tiếp tục giao bài mới cho con.',
};

/**
 * Quyền dùng của một "không gian" (trường/gia đình), dùng chung cho iOS, Android, web.
 * Tính từ các thuê bao còn hạn — code nghiệp vụ chỉ hỏi can()/require(), không bao giờ so plan_id.
 */
@Injectable()
export class EntitlementService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async get(schoolId: string): Promise<EntitlementDto> {
    const now = this.clock.now();
    const rows = await this.db
      .select({ sub: subscriptions, plan: plans })
      .from(subscriptions)
      .innerJoin(plans, eq(plans.id, subscriptions.planId))
      .where(eq(subscriptions.schoolId, schoolId))
      .orderBy(desc(subscriptions.currentPeriodEnd));
    const live = rows.filter((r) => (LIVE as readonly string[]).includes(r.sub.status) && r.sub.currentPeriodEnd > now);
    const top = live[0] ?? rows[0];
    return {
      active: live.length > 0,
      status: !top ? 'none' : live.length ? (top.sub.status as EntitlementDto['status']) : 'expired',
      planId: top?.plan.id ?? null,
      planName: top?.plan.name ?? null,
      channel: (top?.sub.channel as EntitlementDto['channel']) ?? null,
      currentPeriodEnd: top?.sub.currentPeriodEnd.toISOString() ?? null,
      features: mergeFeatures(live.map((r) => r.plan.features as Record<string, boolean | number>)),
    };
  }

  async can(schoolId: string, feature: FeatureKey): Promise<boolean> {
    return Boolean((await this.get(schoolId)).features[feature]);
  }

  async require(schoolId: string, feature: FeatureKey) {
    if (!(await this.can(schoolId, feature))) {
      throw new AppError('feature_not_in_plan', MESSAGES[feature] ?? 'Tính năng này cần gói trả phí');
    }
  }

  /** Người này đã từng dùng thử/mua gói gia đình chưa (dùng thử chỉ một lần mỗi người). */
  async hasHadFamilyPlan(userId: string): Promise<boolean> {
    const rows = await this.db
      .select({ id: subscriptions.id })
      .from(subscriptions)
      .innerJoin(plans, eq(plans.id, subscriptions.planId))
      .where(and(eq(subscriptions.purchasedBy, userId), eq(plans.buyer, 'family')))
      .limit(1);
    return rows.length > 0;
  }

  /**
   * Thuê bao gia đình sẽ hết hạn trong khoảng [from, to) mà KHÔNG tự gia hạn
   * (dùng thử, mua một lần trên web, hoặc đã tắt gia hạn) và chưa có thuê bao nào nối tiếp.
   */
  async expiringBetween(from: Date, to: Date) {
    const rows = await this.db
      .select({ sub: subscriptions, plan: plans })
      .from(subscriptions)
      .innerJoin(plans, eq(plans.id, subscriptions.planId))
      .where(
        and(
          eq(plans.buyer, 'family'),
          inArray(subscriptions.status, [...LIVE]),
          gt(subscriptions.currentPeriodEnd, from),
          lte(subscriptions.currentPeriodEnd, to),
          or(inArray(subscriptions.status, ['trial', 'canceled']), eq(subscriptions.channel, 'web'), eq(subscriptions.autoRenew, false)),
        ),
      );
    const out: { subscriptionId: string; schoolId: string; userId: string; planName: string; periodEnd: Date; trial: boolean }[] = [];
    for (const r of rows) {
      if (!r.sub.purchasedBy) continue;
      const ent = await this.get(r.sub.schoolId);
      // Đã gia hạn (có thuê bao kéo dài hơn) thì thôi
      if (ent.currentPeriodEnd && new Date(ent.currentPeriodEnd) > r.sub.currentPeriodEnd) continue;
      out.push({ subscriptionId: r.sub.id, schoolId: r.sub.schoolId, userId: r.sub.purchasedBy, planName: r.plan.name, periodEnd: r.sub.currentPeriodEnd, trial: r.sub.status === 'trial' });
    }
    return out;
  }

  /** Các không gian còn hạn trong danh sách (để ẩn/hiện nút trên giao diện). */
  async activeAmong(schoolIds: string[]) {
    if (schoolIds.length === 0) return new Set<string>();
    const rows = await this.db
      .select({ schoolId: subscriptions.schoolId })
      .from(subscriptions)
      .where(and(inArray(subscriptions.schoolId, schoolIds), inArray(subscriptions.status, [...LIVE]), gt(subscriptions.currentPeriodEnd, this.clock.now())));
    return new Set(rows.map((r) => r.schoolId));
  }
}
