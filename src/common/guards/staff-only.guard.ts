import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { isStaffRole } from '../../modules/auth/auth.constants';
import { AuthPrincipal } from '../../modules/auth/auth.types';

/** Staff browser JWT only — rejects customers and API client tokens. */
@Injectable()
export class StaffOnlyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ user?: AuthPrincipal }>();
    const auth = request.user;
    if (!auth) {
      throw new ForbiddenException('Staff access required.');
    }
    if (auth.typ === 'api_client') {
      throw new ForbiddenException('Staff access required.');
    }
    if (auth.typ === 'user' && auth.role && isStaffRole(auth.role)) {
      return true;
    }
    throw new ForbiddenException('Staff access required.');
  }
}
