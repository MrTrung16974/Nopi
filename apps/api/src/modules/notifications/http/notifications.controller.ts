import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { markReadSchema, notificationSettingsSchema, registerDeviceSchema, type NotificationSettings } from '@nopi/contracts';
import { z } from 'zod';
import { CurrentActor, CurrentUser, ZodPipe, type Actor, type UserActor } from '../../../platform/index.js';
import { NotificationTriggers } from '../application/notification-triggers.js';
import { NotificationService } from '../application/notification.service.js';

const tokenBody = z.object({ pushToken: z.string().min(10) });

@Controller()
export class NotificationsController {
  constructor(
    private readonly notifications: NotificationService,
    private readonly triggers: NotificationTriggers,
  ) {}

  /** Máy (của người lớn hoặc máy riêng của học sinh) đăng ký nhận thông báo đẩy. */
  @Post('devices')
  @HttpCode(204)
  async register(@CurrentActor() actor: Actor, @Body(new ZodPipe(registerDeviceSchema)) b: z.infer<typeof registerDeviceSchema>) {
    await this.notifications.registerDevice(actor, b);
  }

  /** Đăng xuất: ngừng nhận thông báo trên máy này. */
  @Delete('devices')
  @HttpCode(204)
  async unregister(@CurrentActor() actor: Actor, @Body(new ZodPipe(tokenBody)) b: z.infer<typeof tokenBody>) {
    await this.notifications.unregisterDevice(actor, b.pushToken);
  }

  @Get('me/notifications')
  inbox(@CurrentUser() actor: UserActor) {
    return this.notifications.inbox(actor.userId);
  }

  @Post('me/notifications/read')
  @HttpCode(204)
  async read(@CurrentUser() actor: UserActor, @Body(new ZodPipe(markReadSchema)) b: z.infer<typeof markReadSchema>) {
    await this.notifications.markRead(actor.userId, b);
  }

  @Get('me/notification-settings')
  settings(@CurrentUser() actor: UserActor) {
    return this.notifications.getSettings(actor.userId);
  }

  /** Tắt bớt loại thông báo (vẫn xem được trong hộp thư). */
  @Put('me/notification-settings')
  updateSettings(@CurrentUser() actor: UserActor, @Body(new ZodPipe(notificationSettingsSchema)) b: NotificationSettings) {
    return this.notifications.updateSettings(actor.userId, b);
  }

  /** "Nhắc các em chưa nộp" — gửi thẳng cho phụ huynh. */
  @Post('assignments/:id/remind')
  @HttpCode(200)
  remind(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.triggers.remindMissing(actor, id);
  }
}
