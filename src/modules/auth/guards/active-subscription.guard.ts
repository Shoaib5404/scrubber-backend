import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { AuthService } from '../auth.service';
import { isStaffRole, isTenantRole } from '../auth.constants';
import { AuthPrincipal } from '../auth.types';
import { SUBSCRIPTION_INACTIVE_MESSAGE } from '../permissions.constants';

/**
 * Blocks tenant upload/validate when the tenant subscription is inactive.
 * Staff and unbound service API clients pass.
 */
@Injectable()
export class ActiveSubscriptionGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{ user?: AuthPrincipal }>();
    const auth = request.user;
    if (!auth) {
      throw new ForbiddenException(SUBSCRIPTION_INACTIVE_MESSAGE);
    }

    if (auth.typ === 'user') {
      if (auth.role && isStaffRole(auth.role)) {
        return true;
      }
      if (!auth.role || !isTenantRole(auth.role) || auth.tenantId == null) {
        return true;
      }
      const tenant = await this.prisma.tenant.findUnique({
        where: { id: auth.tenantId },
      });
      if (tenant && this.auth.tenantHasActiveSubscription(tenant)) {
        return true;
      }
      throw new ForbiddenException(SUBSCRIPTION_INACTIVE_MESSAGE);
    }

    // Platform service clients (null tenant + user) are not subscription-gated.
    if (auth.tenantId == null && auth.userId == null) {
      return true;
    }

    if (auth.tenantId != null) {
      const tenant = await this.prisma.tenant.findUnique({
        where: { id: auth.tenantId },
      });
      if (tenant && this.auth.tenantHasActiveSubscription(tenant)) {
        return true;
      }
      throw new ForbiddenException(SUBSCRIPTION_INACTIVE_MESSAGE);
    }

    const user = await this.prisma.user.findUnique({
      where: { id: auth.userId! },
      include: { tenant: true },
    });
    if (user && this.auth.tenantHasActiveSubscription(user.tenant ?? user)) {
      return true;
    }
    throw new ForbiddenException(SUBSCRIPTION_INACTIVE_MESSAGE);
  }
}
