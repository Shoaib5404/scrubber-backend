import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { isStaffRole, isTenantRole } from '../auth.constants';
import { AuthPrincipal, TENANT_FEATURE_KEY } from '../auth.types';
import {
  FEATURE_REQUIRED_MESSAGE,
  TenantFeatureCode,
} from '../../tenants/tenant-features.constants';
import { TenantFeaturesService } from '../../tenants/tenant-features.service';

/**
 * Enforces a tenant subscription feature for browser (user JWT) principals.
 * Staff and platform service clients (null tenant/user) pass.
 * Tenant-bound API clients skip `web.upload` (gated by api.batches / api.reference scopes).
 */
@Injectable()
export class RequireTenantFeatureGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly features: TenantFeaturesService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const feature =
      this.reflector.getAllAndOverride<string>(TENANT_FEATURE_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? TenantFeatureCode.WebUpload;

    const request = context.switchToHttp().getRequest<{ user?: AuthPrincipal }>();
    const auth = request.user;
    if (!auth) {
      throw new ForbiddenException(FEATURE_REQUIRED_MESSAGE);
    }

    if (auth.typ === 'user') {
      if (auth.role && isStaffRole(auth.role)) {
        return true;
      }
      if (!auth.role || !isTenantRole(auth.role) || auth.tenantId == null) {
        return true;
      }
      if (await this.features.has(auth.tenantId, feature)) {
        return true;
      }
      throw new ForbiddenException(FEATURE_REQUIRED_MESSAGE);
    }

    // API clients: web.upload is portal-only; API uses scope features instead.
    if (feature === TenantFeatureCode.WebUpload) {
      return true;
    }

    if (auth.tenantId == null && auth.userId == null) {
      return true;
    }

    if (auth.tenantId != null) {
      if (await this.features.has(auth.tenantId, feature)) {
        return true;
      }
      throw new ForbiddenException(FEATURE_REQUIRED_MESSAGE);
    }

    return true;
  }
}
