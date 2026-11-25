import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import type { ErrorCode, ErrorResponse } from '@nopi/contracts';
import { AppError } from './app-error.js';

const fromHttpStatus = (s: number): ErrorCode =>
  s === 401 ? 'unauthenticated' : s === 403 ? 'forbidden' : s === 404 ? 'not_found' : s === 409 ? 'conflict' : s === 429 ? 'rate_limited' : s < 500 ? 'validation_failed' : 'internal';

const DEFAULT_MESSAGES: Partial<Record<ErrorCode, string>> = {
  not_found: 'Không tìm thấy nội dung này',
  internal: 'Có lỗi xảy ra, vui lòng thử lại sau ít phút',
};

/** Mọi lỗi trả về cùng một dạng ErrorResponse; lỗi không lường trước không lộ chi tiết kỹ thuật. */
@Catch()
export class ErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger('Error');

  catch(err: unknown, host: ArgumentsHost) {
    const reply = host.switchToHttp().getResponse();
    const req = host.switchToHttp().getRequest();
    let status = 500;
    let body: ErrorResponse;

    if (err instanceof AppError) {
      status = err.status;
      body = { error: { code: err.code, message: err.message, details: err.details } };
    } else if (err instanceof HttpException) {
      status = err.getStatus();
      const code = fromHttpStatus(status);
      body = { error: { code, message: DEFAULT_MESSAGES[code] ?? err.message } };
    } else {
      this.logger.error(err instanceof Error ? err.stack : String(err));
      body = { error: { code: 'internal', message: DEFAULT_MESSAGES.internal! } };
    }
    body.error.requestId = req?.id;
    reply.status(status).send(body);
  }
}
