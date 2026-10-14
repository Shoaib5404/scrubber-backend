import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { normalizeException } from '../errors/normalize-exception';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const requestId = request.requestId ?? request.header('x-request-id') ?? undefined;
    const path = sanitizePath(request.originalUrl ?? request.url);

    const normalized = normalizeException(exception, { requestId, path });

    if (normalized.logAsUnexpected) {
      const exceptionName =
        exception instanceof Error ? exception.name : typeof exception;
      const exceptionMessage =
        exception instanceof Error ? exception.message : String(exception);
      this.logger.error(
        `[${normalized.body.code}] ${request.method} ${path ?? 'unknown'} status=${normalized.status} requestId=${requestId ?? 'n/a'} ${exceptionName}: ${exceptionMessage}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    response.status(normalized.status).json(normalized.body);
  }
}

function sanitizePath(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  try {
    const url = new URL(raw, 'http://localhost');
    // Drop query string — may contain tokens or PII.
    return url.pathname;
  } catch {
    const q = raw.indexOf('?');
    return q >= 0 ? raw.slice(0, q) : raw;
  }
}
