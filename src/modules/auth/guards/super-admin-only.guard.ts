import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { UserRole } from '../auth.constants';
import { AuthPrincipal } from '../auth.types';

@Injectable()
export class SuperAdminOnlyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ user?: AuthPrincipal }>();
    const auth = request.user;
    if (auth?.typ === 'user' && auth.role === UserRole.SuperAdmin) {
      return true;
    }
    throw new ForbiddenException('Super admin access required.');
  }
}
