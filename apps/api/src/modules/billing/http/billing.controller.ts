import { Body, Controller, Get, Header, HttpCode, Inject, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { grantContractSchema } from '@nopi/contracts';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { AppError, CurrentActor, Public, ZodPipe, type Actor } from '../../../platform/index.js';
import { BillingService } from '../application/billing.service.js';
import { WEB_GATEWAYS, FakeGateway, type WebPaymentGateway } from '../ports/web-gateway.js';
import { DB } from '../../../platform/index.js';
import { schema, type Database } from '@nopi/db';
import { eq } from 'drizzle-orm';

const buyerQuery = z.object({ buyer: z.enum(['family', 'school']).default('family') });

@Controller()
export class BillingController {
  constructor(
    private readonly billing: BillingService,
    @Inject(WEB_GATEWAYS) private readonly gateways: WebPaymentGateway[],
    @Inject(DB) private readonly db: Database,
  ) {}

  @Public()
  @Get('billing/plans')
  plans(@Query(new ZodPipe(buyerQuery)) q: z.infer<typeof buyerQuery>) {
    return this.billing.plans(q.buyer);
  }

  @Get('billing/orders/:id')
  order(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.billing.orderStatus(actor, id);
  }

  /** Cổng thanh toán gọi về (server-to-server). Chữ ký được kiểm trong adapter. */
  @Public()
  @Post('billing/ipn/:provider')
  @HttpCode(200)
  ipn(@Param('provider') provider: string, @Body() body: Record<string, unknown>) {
    return this.billing.handleIpn(provider, body ?? {});
  }

  /** App Store Server Notifications v2 / Google Play RTDN (qua Pub/Sub push). */
  @Public()
  @Post('billing/store/:platform/notifications')
  @HttpCode(200)
  storeNotification(@Param('platform') platform: string, @Body() body: unknown) {
    if (platform !== 'apple' && platform !== 'google') throw new AppError('not_found', 'Không tìm thấy');
    return this.billing.storeNotification(platform, body);
  }

  /** Quản trị hệ thống mở gói cho trường theo hợp đồng (chuyển khoản, hoá đơn). */
  @Post('admin/schools/:schoolId/subscriptions')
  contract(
    @CurrentActor() actor: Actor,
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Body(new ZodPipe(grantContractSchema)) b: z.infer<typeof grantContractSchema>,
  ) {
    return this.billing.grantContract(actor, schoolId, b.planId, b.externalId);
  }

  // ---------- Cổng giả lập (chỉ khi PAYMENT_PROVIDERS có "fake"; cấm ở production) ----------
  private fake() {
    const g = this.gateways.find((x) => x.id === 'fake');
    if (!(g instanceof FakeGateway)) throw new AppError('not_found', 'Không tìm thấy');
    return g;
  }

  @Public()
  @Get('billing/fake/checkout/:orderId')
  @Header('Content-Type', 'text/html; charset=utf-8')
  async fakeCheckout(@Param('orderId', ParseUUIDPipe) orderId: string, @Query('returnUrl') returnUrl?: string) {
    this.fake();
    const [o] = await this.db.select().from(schema.checkoutOrders).where(eq(schema.checkoutOrders.id, orderId));
    if (!o) throw new AppError('not_found', 'Không tìm thấy đơn');
    const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
    const back = returnUrl && /^https?:\/\//.test(returnUrl) ? returnUrl : '/';
    return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Thanh toán thử</title>
<style>body{font-family:system-ui,sans-serif;max-width:420px;margin:40px auto;padding:0 16px}button{font:inherit;padding:12px 20px;border-radius:10px;border:0;cursor:pointer;margin-right:8px}.pay{background:#ea580c;color:#fff}.warn{background:#fef3c7;padding:12px;border-radius:10px}</style></head>
<body><p class="warn">⚠️ Cổng thanh toán <b>giả lập</b> cho môi trường dev — không trừ tiền thật.</p>
<h1>Thanh toán ${o.amountVnd.toLocaleString('vi-VN')}đ</h1><p>Mã đơn: ${esc(o.id)}</p>
<button class="pay" onclick="pay(0)">Thanh toán thành công</button><button onclick="pay(1)">Giả lập thất bại</button>
<script>async function pay(code){await fetch('/v1/billing/fake/pay/${o.id}',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({resultCode:code})});location.href=${JSON.stringify(back)};}</script></body></html>`;
  }

  /** Trang thanh toán thử bấm "Thanh toán" → giả lập cổng gửi IPN có chữ ký (đi đúng đường xử lý IPN thật). */
  @Public()
  @Post('billing/fake/pay/:orderId')
  @HttpCode(200)
  async fakePay(@Param('orderId', ParseUUIDPipe) orderId: string, @Body() body: { resultCode?: number }) {
    const g = this.fake();
    const [o] = await this.db.select().from(schema.checkoutOrders).where(eq(schema.checkoutOrders.id, orderId));
    if (!o) throw new AppError('not_found', 'Không tìm thấy đơn');
    const data = { orderId: o.id, transId: `FAKE-${randomUUID()}`, amount: o.amountVnd, resultCode: body?.resultCode === 1 ? 1 : 0 };
    return this.billing.handleIpn('fake', { ...data, signature: g.sign(data) });
  }
}
