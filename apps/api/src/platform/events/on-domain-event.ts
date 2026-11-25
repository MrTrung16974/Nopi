import { SetMetadata } from '@nestjs/common';

export const ON_DOMAIN_EVENT = Symbol('ON_DOMAIN_EVENT');

/**
 * Đánh dấu method xử lý sự kiện. Handler phải idempotent: outbox giao "ít nhất một lần".
 *   @OnDomainEvent('EvaluationSaved') async notifyGuardians(e: DomainEvent) { ... }
 */
export const OnDomainEvent = (type: string) => SetMetadata(ON_DOMAIN_EVENT, type);
