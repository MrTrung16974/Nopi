import { Module } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../platform/index.js';
import { BillingService } from './application/billing.service.js';
import { EntitlementService } from './application/entitlement.service.js';
import { BillingController } from './http/billing.controller.js';
import { DisabledStoreVerifier, FakeStoreVerifier, STORE_VERIFIER } from './ports/store-verifier.js';
import { FakeGateway, WEB_GATEWAYS, type WebPaymentGateway } from './ports/web-gateway.js';

/** Không phụ thuộc mô-đun nghiệp vụ nào — các mô-đun khác hỏi quyền dùng qua EntitlementService. */
@Module({
  controllers: [BillingController],
  providers: [
    {
      provide: WEB_GATEWAYS,
      inject: [APP_CONFIG],
      useFactory: (c: AppConfig): WebPaymentGateway[] =>
        c.PAYMENT_PROVIDERS.map((p) => {
          if (p === 'fake') return new FakeGateway(c.PAYMENT_FAKE_SECRET, c.API_PUBLIC_URL);
          // MoMo / ZaloPay / VNPay: cần tài khoản merchant + khoá ký; thêm adapter cài WebPaymentGateway
          throw new Error(`Chưa có adapter cổng thanh toán "${p}"`);
        }),
    },
    { provide: STORE_VERIFIER, inject: [APP_CONFIG], useFactory: (c: AppConfig) => (c.STORE_VERIFIER === 'fake' ? new FakeStoreVerifier() : new DisabledStoreVerifier()) },
    EntitlementService,
    BillingService,
  ],
  exports: [EntitlementService, BillingService],
})
export class BillingModule {}
