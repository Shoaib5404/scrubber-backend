import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';

export type AuthPrincipal = {
  typ: 'user' | 'api_client';
  userId: number | null;
  /** Null for platform staff and unbound service API clients. */
  tenantId: number | null;
  role: string | null;
  email?: string;
  clientId?: string;
  scopes: string[];
};

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const SCOPES_KEY = 'requiredScopes';
export const RequireScopes = (...scopes: string[]) => SetMetadata(SCOPES_KEY, scopes);

export const PERMISSIONS_KEY = 'requiredPermissions';
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

export const TENANT_FEATURE_KEY = 'tenant_feature';
export const RequireTenantFeature = (feature: string) =>
  SetMetadata(TENANT_FEATURE_KEY, feature);

export const CurrentAuth = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthPrincipal => {
    const request = ctx.switchToHttp().getRequest<{ user: AuthPrincipal }>();
    return request.user;
  },
);
