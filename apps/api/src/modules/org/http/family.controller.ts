import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { addFamilyChildSchema, checkoutSchema, storeVerifySchema } from '@nopi/contracts';
import type { Grade } from '@nopi/domain';
import { z } from 'zod';
import { APP_CONFIG, CurrentActor, ZodPipe, type Actor, type AppConfig } from '../../../platform/index.js';
import { Inject } from '@nestjs/common';
import { FamilyService } from '../application/family.service.js';

const checkoutBody = checkoutSchema.omit({ schoolId: true });
const storeBody = storeVerifySchema.omit({ schoolId: true });

@Controller('family-spaces')
export class FamilyController {
  constructor(
    private readonly family: FamilyService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** Không gian gia đình của tôi (null nếu chưa có). */
  @Get('mine')
  async mine(@CurrentActor() actor: Actor) {
    return { space: await this.family.mine(actor) };
  }

  /** Tạo không gian gia đình (lần đầu được dùng thử 7 ngày). */
  @Post()
  create(@CurrentActor() actor: Actor) {
    return this.family.createOrGet(actor);
  }

  @Get(':id')
  get(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.family.get(actor, id);
  }

  @Post(':id/children')
  addChild(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(addFamilyChildSchema)) b: z.infer<typeof addFamilyChildSchema>) {
    return this.family.addChild(actor, id, b as { studentId: string; grade?: Grade } | { fullName: string; nickname?: string; grade: Grade });
  }

  /** Mua gói trên web (MoMo, ZaloPay, VNPay…). */
  @Post(':id/checkout')
  checkout(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(checkoutBody)) b: z.infer<typeof checkoutBody>) {
    return this.family.checkout(actor, id, b.planId, b.provider, b.returnUrl ?? `${this.config.API_PUBLIC_URL}/v1/health`);
  }

  /** App gửi giao dịch StoreKit 2 / Google Play Billing để server xác minh và mở quyền dùng. */
  @Post(':id/store-purchases')
  storePurchase(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(storeBody)) b: z.infer<typeof storeBody>) {
    return this.family.storePurchase(actor, id, b);
  }
}
