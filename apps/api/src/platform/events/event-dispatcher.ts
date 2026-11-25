import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import type { DomainEvent } from './domain-event.js';
import { ON_DOMAIN_EVENT } from './on-domain-event.js';

type Handler = { name: string; fn: (e: DomainEvent) => unknown };

/** Tự tìm mọi method có @OnDomainEvent trong ứng dụng và gọi khi có sự kiện. */
@Injectable()
export class EventDispatcher implements OnModuleInit {
  private readonly logger = new Logger(EventDispatcher.name);
  private readonly handlers = new Map<string, Handler[]>();

  constructor(
    private readonly discovery: DiscoveryService,
    private readonly scanner: MetadataScanner,
    private readonly reflector: Reflector,
  ) {}

  onModuleInit() {
    for (const wrapper of this.discovery.getProviders()) {
      const instance = wrapper.instance as Record<string, unknown> | undefined;
      if (!instance || typeof instance !== 'object') continue;
      const proto = Object.getPrototypeOf(instance);
      if (!proto) continue;
      for (const method of this.scanner.getAllMethodNames(proto)) {
        const type = this.reflector.get<string>(ON_DOMAIN_EVENT, proto[method]);
        if (!type) continue;
        const list = this.handlers.get(type) ?? [];
        list.push({
          name: `${proto.constructor.name}.${method}`,
          fn: (e) => (instance[method] as (e: DomainEvent) => unknown).call(instance, e),
        });
        this.handlers.set(type, list);
      }
    }
    const total = [...this.handlers.values()].reduce((n, l) => n + l.length, 0);
    this.logger.log(`Đã đăng ký ${total} handler cho ${this.handlers.size} loại sự kiện`);
  }

  handlersFor(type: string): string[] {
    return (this.handlers.get(type) ?? []).map((h) => h.name);
  }

  /** Gọi mọi handler; một handler lỗi thì cả sự kiện được thử lại (handler phải idempotent). */
  async dispatch(event: DomainEvent): Promise<void> {
    for (const h of this.handlers.get(event.type) ?? []) {
      await h.fn(event);
    }
  }
}
