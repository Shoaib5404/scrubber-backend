import { Injectable } from '@nestjs/common';
import type { AuthPrincipal } from '../../modules/auth/auth.types';
import { isStaffRole } from '../../modules/auth/auth.constants';

/**
 * Helpers for resolving tenant scope from the authenticated principal.
 * Staff have null tenantId and may access any tenant.
 */
@Injectable()
export class TenantContext {
  tenantIdOf(auth: AuthPrincipal | undefined | null): number | null {
    return auth?.tenantId ?? null;
  }

  isStaff(auth: AuthPrincipal | undefined | null): boolean {
    return !!auth && auth.typ === 'user' && !!auth.role && isStaffRole(auth.role);
  }

  /** Tenant filter for customer/API principals; null means staff (no filter). */
  scopeTenantId(auth: AuthPrincipal): number | null {
    if (this.isStaff(auth)) {
      return null;
    }
    return auth.tenantId;
  }

  assertSameTenant(auth: AuthPrincipal, resourceTenantId: number | null): boolean {
    if (this.isStaff(auth)) {
      return true;
    }
    if (auth.tenantId == null || resourceTenantId == null) {
      return false;
    }
    return auth.tenantId === resourceTenantId;
  }
}
