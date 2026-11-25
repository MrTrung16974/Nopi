import { Inject, Injectable, Logger } from '@nestjs/common';
import { schema, type Database, type DbOrTx } from '@nopi/db';
import { extendPeriod, trialEnd, type PlanPeriod } from '@nopi/domain';
import { and, eq } from 'drizzle-orm';
import { AppError, AuditLog, CLOCK, DB, type Actor, type Clock } from '../../../platform/index.js';
import { STORE_VERIFIER, type StoreVerifier } from '../ports/store-verifier.js';
import { WEB_GATEWAYS, type WebPaymentGateway } from '../ports/web-gateway.js';
import { EntitlementService } from './entitlement.service.js';

const { plans, subscriptions, payments, checkoutOrders } = schema;

/**
 * Gói và thanh toán. Mọi kênh (web, App Store, Google Play, hợp đồng) đổ về cùng bảng subscriptions,
 * nên mua ở đâu cũng mở quyền dùng ở mọi nơi. Bản tin thanh toán xử lý idempotent theo (provider, provider_ref).
 * Mô-đun gọi (vd. org: không gian gia đình) tự kiểm tra ai được mua cho không gian nào.
 */
@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(WEB_GATEWAYS) private readonly gateways: WebPaymentGateway[],
    @Inject(STORE_VERIFIER) private readonly store: StoreVerifier,
    private readonly entitlements: EntitlementService,
    private readonly audit: AuditLog,
  ) {}

  async plans(buyer: 'family' | 'school') {
    const rows = await this.db.select().from(plans).where(and(eq(plans.buyer, buyer), eq(plans.isActive, true)));
    return rows
      .map((p) => ({ id: p.id, name: p.name, period: p.period as PlanPeriod, priceVnd: p.priceVnd, features: p.features as Record<string, boolean | number> }))
      .sort((a, b) => a.priceVnd - b.priceVnd);
  }

  private async plan(id: string) {
    const [p] = await this.db.select().from(plans).where(eq(plans.id, id));
    if (!p) throw new AppError('not_found', 'Không tìm thấy gói');
    return p;
  }

  /** Dùng thử 7 ngày — mỗi người một lần. Trả về false nếu đã dùng thử/mua trước đây. */
  async startFamilyTrial(schoolId: string, userId: string, tx: DbOrTx = this.db): Promise<boolean> {
    if (await this.entitlements.hasHadFamilyPlan(userId)) return false;
    await tx.insert(subscriptions).values({
      schoolId,
      planId: 'family_trial',
      channel: 'web',
      externalId: `trial:${userId}`,
      status: 'trial',
      currentPeriodEnd: trialEnd(this.clock.now()),
      autoRenew: false,
      purchasedBy: userId,
    }).onConflictDoNothing();
    return true;
  }

  // ---------------- Web ----------------
  private gateway(id: string) {
    const g = this.gateways.find((x) => x.id === id);
    if (!g) throw new AppError('validation_failed', 'Cổng thanh toán này chưa được bật');
    return g;
  }

  async checkout(input: { schoolId: string; planId: string; provider: string; returnUrl: string; userId: string; buyer: 'family' | 'school' }) {
    const p = await this.plan(input.planId);
    if (!p.isActive || p.buyer !== input.buyer || p.priceVnd <= 0) throw new AppError('validation_failed', 'Gói này không bán trực tuyến');
    const g = this.gateway(input.provider);
    const [order] = await this.db
      .insert(checkoutOrders)
      .values({ schoolId: input.schoolId, planId: p.id, provider: g.id, amountVnd: p.priceVnd, createdBy: input.userId })
      .returning();
    // Trang quay về luôn kèm mã đơn để web/app hỏi trạng thái
    const back = new URL(input.returnUrl);
    back.searchParams.set('order', order!.id);
    const payUrl = await g.createPayUrl({ id: order!.id, amountVnd: p.priceVnd, description: `Nopi ${p.name}` }, back.toString());
    return { orderId: order!.id, payUrl };
  }

  async orderStatus(actor: Actor, orderId: string) {
    const [o] = await this.db.select().from(checkoutOrders).where(eq(checkoutOrders.id, orderId));
    if (!o || actor.kind !== 'user' || o.createdBy !== actor.userId) throw new AppError('not_found', 'Không tìm thấy đơn');
    return { orderId: o.id, status: o.status as 'pending' | 'paid' | 'failed' | 'expired' };
  }

  /**
   * Bản tin IPN của cổng: kiểm chữ ký → đối chiếu đơn + số tiền → mở/gia hạn quyền dùng.
   * Cổng gửi lại nhiều lần vẫn chỉ ghi nhận một lần.
   */
  async handleIpn(provider: string, body: Record<string, unknown>): Promise<{ ok: boolean; message: string }> {
    const g = this.gateway(provider);
    let ipn;
    try {
      ipn = g.parseIpn(body);
    } catch {
      this.logger.warn(`IPN ${provider} sai chữ ký`);
      return { ok: false, message: 'invalid signature' };
    }
    return this.db.transaction(async (tx) => {
      const [order] = await tx.select().from(checkoutOrders).where(eq(checkoutOrders.id, ipn.orderId)).for('update');
      if (!order || order.provider !== g.id) return { ok: false, message: 'order not found' };
      if (order.status === 'paid') return { ok: true, message: 'already processed' };
      if (ipn.amountVnd !== order.amountVnd) {
        this.logger.warn(`IPN ${provider} lệch số tiền đơn ${order.id}: ${ipn.amountVnd} ≠ ${order.amountVnd}`);
        return { ok: false, message: 'amount mismatch' };
      }
      if (!ipn.success) {
        await tx.update(checkoutOrders).set({ status: 'failed' }).where(eq(checkoutOrders.id, order.id));
        return { ok: true, message: 'payment failed' };
      }
      const p = await this.plan(order.planId);
      const sub = await this.extendWebSubscription(tx, order.schoolId, p.id, p.period as PlanPeriod, order.createdBy);
      const [pay] = await tx
        .insert(payments)
        .values({ subscriptionId: sub.id, provider: g.id, providerRef: ipn.providerRef, amountVnd: ipn.amountVnd, status: 'paid', paidAt: this.clock.now(), rawEvent: ipn.raw })
        .onConflictDoNothing()
        .returning();
      await tx.update(checkoutOrders).set({ status: 'paid', paidAt: this.clock.now(), paymentId: pay?.id ?? null }).where(eq(checkoutOrders.id, order.id));
      await this.audit.record({ actor: 'system', action: 'billing.paid', targetType: 'school', targetId: order.schoolId, schoolId: order.schoolId, metadata: { planId: p.id, provider: g.id, amountVnd: ipn.amountVnd } }, tx);
      return { ok: true, message: 'ok' };
    });
  }

  /** Thuê bao web của một không gian: một dòng, mỗi lần mua thì cộng nối tiếp kỳ hạn. */
  private async extendWebSubscription(tx: DbOrTx, schoolId: string, planId: string, period: PlanPeriod, userId: string) {
    const externalId = `web:${schoolId}`;
    const [current] = await tx.select().from(subscriptions).where(and(eq(subscriptions.channel, 'web'), eq(subscriptions.externalId, externalId))).for('update');
    // Còn dùng thử thì cộng nối tiếp sau ngày hết thử
    const [trial] = await tx.select().from(subscriptions).where(and(eq(subscriptions.schoolId, schoolId), eq(subscriptions.status, 'trial')));
    const now = this.clock.now();
    const base = [current?.currentPeriodEnd, trial?.currentPeriodEnd].filter((d): d is Date => Boolean(d && d > now)).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
    const end = extendPeriod(base, now, period);
    if (current) {
      const [row] = await tx.update(subscriptions).set({ planId, status: 'active', currentPeriodEnd: end, purchasedBy: userId }).where(eq(subscriptions.id, current.id)).returning();
      return row!;
    }
    const [row] = await tx
      .insert(subscriptions)
      .values({ schoolId, planId, channel: 'web', externalId, status: 'active', currentPeriodEnd: end, autoRenew: false, purchasedBy: userId })
      .returning();
    return row!;
  }

  // ---------------- App Store / Google Play ----------------
  async verifyStorePurchase(input: { schoolId: string; platform: 'apple' | 'google'; productId: string; token: string; userId: string }) {
    let tx;
    try {
      tx = await this.store.verify(input.platform, input.productId, input.token);
    } catch {
      throw new AppError('validation_failed', 'Không xác minh được giao dịch, vui lòng thử lại');
    }
    const planId = input.productId.includes('year') ? 'family_yearly' : 'family_monthly';
    await this.db.transaction(async (t) => {
      const [sub] = await t
        .insert(subscriptions)
        .values({ schoolId: input.schoolId, planId, channel: input.platform, externalId: tx.externalId, status: 'active', currentPeriodEnd: tx.expiresAt, autoRenew: tx.autoRenew, purchasedBy: input.userId })
        .onConflictDoUpdate({ target: [subscriptions.channel, subscriptions.externalId], set: { status: 'active', currentPeriodEnd: tx.expiresAt, autoRenew: tx.autoRenew } })
        .returning();
      await t
        .insert(payments)
        .values({ subscriptionId: sub!.id, provider: input.platform, providerRef: tx.transactionId, amountVnd: tx.amountVnd, status: 'paid', paidAt: this.clock.now() })
        .onConflictDoNothing();
    });
    return this.entitlements.get(input.schoolId);
  }

  /** Cửa hàng báo gia hạn / huỷ / hết hạn. */
  async storeNotification(platform: 'apple' | 'google', body: unknown) {
    const n = await this.store.decodeNotification(platform, body);
    if (!n) return { ok: false };
    await this.db
      .update(subscriptions)
      .set({ currentPeriodEnd: n.expiresAt, autoRenew: n.autoRenew, status: n.canceled ? 'canceled' : n.expiresAt > this.clock.now() ? 'active' : 'expired' })
      .where(and(eq(subscriptions.channel, platform), eq(subscriptions.externalId, n.externalId)));
    return { ok: true };
  }

  // ---------------- Hợp đồng trường ----------------
  async grantContract(actor: Actor, schoolId: string, planId: string, externalId: string) {
    if (actor.kind !== 'user' || !actor.isSystemAdmin) throw new AppError('forbidden', 'Chỉ quản trị hệ thống được mở gói theo hợp đồng');
    const p = await this.plan(planId);
    if (p.buyer !== 'school') throw new AppError('validation_failed', 'Gói này không dành cho trường');
    const end = extendPeriod(null, this.clock.now(), p.period as PlanPeriod);
    await this.db
      .insert(subscriptions)
      .values({ schoolId, planId, channel: 'contract', externalId, status: 'active', currentPeriodEnd: end, autoRenew: false, purchasedBy: actor.userId })
      .onConflictDoUpdate({ target: [subscriptions.channel, subscriptions.externalId], set: { currentPeriodEnd: end, status: 'active' } });
    await this.audit.record({ actor, action: 'billing.contract', targetType: 'school', targetId: schoolId, schoolId, metadata: { planId, externalId } });
    return this.entitlements.get(schoolId);
  }
}
