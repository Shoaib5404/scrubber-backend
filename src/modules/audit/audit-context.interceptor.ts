import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import { Observable } from 'rxjs';
import type { AuthPrincipal } from '../auth/auth.types';
import { runWithAuditContext } from './audit.context';

@Injectable()
export class AuditContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const req = context.switchToHttp().getRequest<
      Request & { user?: AuthPrincipal; requestId?: string }
    >();

    const forwarded = req.headers['x-forwarded-for'];
    const ip =
      typeof forwarded === 'string'
        ? forwarded.split(',')[0]?.trim()
        : Array.isArray(forwarded)
          ? forwarded[0]
          : req.ip;

    const userAgentHeader = req.headers['user-agent'];
    const userAgent =
      typeof userAgentHeader === 'string'
        ? userAgentHeader.slice(0, 512)
        : undefined;

    const ctx = {
      requestId: req.requestId,
      ip: ip?.slice(0, 64),
      userAgent,
      auth: req.user ?? null,
    };

    return new Observable((subscriber) => {
      runWithAuditContext(ctx, () => {
        next.handle().subscribe({
          next: (value) => subscriber.next(value),
          error: (err) => subscriber.error(err),
          complete: () => subscriber.complete(),
        });
      });
    });
  }
}
