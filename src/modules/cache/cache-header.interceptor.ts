import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { readCacheStatus } from './cache-telemetry';

/**
 * Exposes `Cache: HIT|MISS|BYPASS|ERROR` when lookup cache ran during the request.
 * Requires request ALS from `installCacheTelemetryMiddleware` in main.ts.
 */
@Injectable()
export class CacheHeaderInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      tap(() => {
        const status = readCacheStatus();
        if (status == null) return;
        const res = context.switchToHttp().getResponse<{
          setHeader: (k: string, v: string) => void;
        }>();
        res.setHeader('Cache', status);
      }),
    );
  }
}
