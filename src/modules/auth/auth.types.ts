import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';

export type AuthPrincipal = {
  typ: 'user' | 'api_client';
  userId: number | null;
  role: string | null;
  email?: string;
  clientId?: string;
  scopes: string[];
};

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const SCOPES_KEY = 'requiredScopes';
export const RequireScopes = (...scopes: string[]) => SetMetadata(SCOPES_KEY, scopes);

export const CurrentAuth = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthPrincipal => {
    const request = ctx.switchToHttp().getRequest<{ user: AuthPrincipal }>();
    return request.user;
  },
);
