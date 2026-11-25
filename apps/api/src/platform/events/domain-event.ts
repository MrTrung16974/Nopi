/**
 * Sự kiện nghiệp vụ. Mô-đun phát sự kiện không biết ai nghe — thêm tính năng mới
 * (thông báo, báo cáo, Chép Con…) = thêm handler @OnDomainEvent, không sửa mô-đun phát.
 */
export interface DomainEvent<TType extends string = string, TPayload = unknown> {
  type: TType;
  aggregateId: string;
  schoolId?: string | null;
  payload: TPayload;
}

/** Khai báo kiểu sự kiện một lần, dùng lại ở nơi phát và nơi nghe. */
export function defineEvent<TPayload>() {
  return <TType extends string>(type: TType) => ({
    type,
    create: (aggregateId: string, payload: TPayload, schoolId?: string | null): DomainEvent<TType, TPayload> => ({
      type,
      aggregateId,
      schoolId: schoolId ?? null,
      payload,
    }),
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- ràng buộc kiểu tổng quát cho mọi event factory
export type EventOf<T extends { create: (...a: any[]) => any }> = ReturnType<T['create']>;
