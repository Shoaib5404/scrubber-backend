import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthPrincipal, PERMISSIONS_KEY } from '../auth.types';
import { RolePermissionService } from '../role-permission.service';

@Injectable()
export class RequirePermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rolePermissions: RolePermissionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ user?: AuthPrincipal }>();
    const auth = request.user;
    if (!auth || auth.typ !== 'user' || !auth.role || auth.userId == null) {
      throw new ForbiddenException('Insufficient permissions.');
    }

    for (const permission of required) {
      const ok = await this.rolePermissions.roleHas(auth.role, permission);
      if (!ok) {
        throw new ForbiddenException('Insufficient permissions.');
      }
    }
    return true;
  }
}
