import type { PipeTransform } from '@nestjs/common';
import type { z } from 'zod';
import { AppError } from './app-error.js';

/** Kiểm tra body/query/params bằng schema trong @nopi/contracts. */
export class ZodPipe<T extends z.ZodType> implements PipeTransform<unknown, z.infer<T>> {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.infer<T> {
    const r = this.schema.safeParse(value);
    if (r.success) return r.data;
    throw new AppError(
      'validation_failed',
      'Thông tin chưa hợp lệ, vui lòng kiểm tra lại',
      r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    );
  }
}
