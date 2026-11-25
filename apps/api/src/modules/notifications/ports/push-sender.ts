import { Logger } from '@nestjs/common';

export interface PushMessage {
  token: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}
export interface PushResult {
  token: string;
  ok: boolean;
  /** Máy đã gỡ app / mã hết hiệu lực → xoá thiết bị */
  unregistered?: boolean;
  error?: string;
}

/**
 * Cổng gửi thông báo đẩy. Mặc định Expo Push Service (một đường cho Android + iOS với app Expo).
 * Muốn gọi thẳng FCM/APNs = viết adapter khác cài interface này.
 */
export interface PushSender {
  send(messages: PushMessage[]): Promise<PushResult[]>;
}
export const PUSH_SENDER = Symbol('PUSH_SENDER');

/** Expo Push API: tối đa 100 tin mỗi lần gọi. */
export class ExpoPushSender implements PushSender {
  constructor(private readonly accessToken?: string) {}

  async send(messages: PushMessage[]): Promise<PushResult[]> {
    const out: PushResult[] = [];
    for (let i = 0; i < messages.length; i += 100) {
      const batch = messages.slice(i, i + 100);
      const res = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          ...(this.accessToken ? { authorization: `Bearer ${this.accessToken}` } : {}),
        },
        body: JSON.stringify(batch.map((m) => ({ to: m.token, title: m.title, body: m.body, data: m.data ?? {}, sound: 'default', priority: 'high' }))),
      });
      if (!res.ok) throw new Error(`Expo push ${res.status}`);
      const json = (await res.json()) as { data?: { status: 'ok' | 'error'; message?: string; details?: { error?: string } }[] };
      batch.forEach((m, j) => {
        const r = json.data?.[j];
        out.push({
          token: m.token,
          ok: r?.status === 'ok',
          unregistered: r?.details?.error === 'DeviceNotRegistered',
          error: r?.status === 'error' ? (r.message ?? r.details?.error) : undefined,
        });
      });
    }
    return out;
  }
}

/** Dev: in ra log. */
export class ConsolePushSender implements PushSender {
  private readonly logger = new Logger('Push');
  async send(messages: PushMessage[]) {
    for (const m of messages) this.logger.log(`[DEV] → ${m.token.slice(0, 24)}… "${m.title}" — ${m.body}`);
    return messages.map((m) => ({ token: m.token, ok: true }));
  }
}

/** Test: giữ lại tin đã gửi; token bắt đầu bằng "dead" coi như máy đã gỡ app. */
export class FakePushSender implements PushSender {
  readonly sent: PushMessage[] = [];
  failNext = false;
  async send(messages: PushMessage[]) {
    if (this.failNext) {
      this.failNext = false;
      throw new Error('push service down');
    }
    return messages.map((m) => {
      if (m.token.startsWith('dead')) return { token: m.token, ok: false, unregistered: true, error: 'DeviceNotRegistered' };
      this.sent.push(m);
      return { token: m.token, ok: true };
    });
  }
}
