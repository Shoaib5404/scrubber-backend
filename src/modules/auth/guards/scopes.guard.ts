import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthPrincipal, SCOPES_KEY } from '../auth.types';
import { isStaffRole } from '../auth.constants';

@Injectable()
export class ScopesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(SCOPES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ user?: AuthPrincipal }>();
    const auth = request.user;
    if (!auth) {
      throw new ForbiddenException('Missing authentication.');
    }

    // Browser staff JWTs are not scope-bound; API clients must hold all required scopes.
    if (auth.typ === 'user') {
      if (auth.role && isStaffRole(auth.role)) {
        return true;
      }
      // Customer browser JWT: allow if no scopes required beyond ownership checks.
      return true;
    }

    const missing = required.filter((scope) => !auth.scopes.includes(scope));
    if (missing.length > 0) {
      throw new ForbiddenException(`Insufficient scope. Missing: ${missing.join(', ')}`);
    }
    return true;
  }
}
