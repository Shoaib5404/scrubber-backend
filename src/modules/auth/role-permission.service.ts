import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { UserRole, isStaffRole } from './auth.constants';
import {
  ALL_PERMISSIONS,
  MANAGEABLE_ROLES,
  defaultPermissionsFor,
  type PermissionValue,
} from './permissions.constants';

@Injectable()
export class RolePermissionService implements OnModuleInit {
  private readonly logger = new Logger(RolePermissionService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    await this.ensureDefaultsSeeded();
  }

  async ensureDefaultsSeeded(): Promise<void> {
    for (const role of MANAGEABLE_ROLES) {
      const count = await this.prisma.rolePermission.count({ where: { role } });
      if (count === 0) {
        await this.syncRolePermissions(role, defaultPermissionsFor(role));
        this.logger.log(`Seeded default permissions for role=${role}`);
        continue;
      }
      // Additive: grant any newly introduced default permissions (e.g. tenants.manage).
      const defaults = defaultPermissionsFor(role);
      for (const permission of defaults) {
        await this.prisma.rolePermission.upsert({
          where: { role_permission: { role, permission } },
          create: { role, permission },
          update: {},
        });
      }
    }
  }

  manageableRoles(): string[] {
    return [...MANAGEABLE_ROLES];
  }

  async permissionValuesForRole(role: string): Promise<PermissionValue[]> {
    if (role === UserRole.SuperAdmin) {
      return [...ALL_PERMISSIONS];
    }
    const rows = await this.prisma.rolePermission.findMany({
      where: { role },
      select: { permission: true },
    });
    return rows
      .map((r) => r.permission)
      .filter((p): p is PermissionValue =>
        (ALL_PERMISSIONS as string[]).includes(p),
      );
  }

  async roleHas(role: string, permission: string): Promise<boolean> {
    if (role === UserRole.SuperAdmin) {
      return true;
    }
    if (!isStaffRole(role)) {
      return false;
    }
    const row = await this.prisma.rolePermission.findUnique({
      where: {
        role_permission: { role, permission },
      },
    });
    return !!row;
  }

  async userHas(
    user: { role: string; isActive: boolean } | null | undefined,
    permission: string,
  ): Promise<boolean> {
    if (!user || !user.isActive) {
      return false;
    }
    return this.roleHas(user.role, permission);
  }

  async syncRolePermissions(role: string, permissions: string[]): Promise<void> {
    if (!MANAGEABLE_ROLES.includes(role as (typeof MANAGEABLE_ROLES)[number])) {
      throw new Error(`Permissions for ${role} cannot be managed.`);
    }

    const values = [
      ...new Set(
        permissions.filter((p) => (ALL_PERMISSIONS as string[]).includes(p)),
      ),
    ];

    await this.prisma.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { role } });
      if (values.length > 0) {
        await tx.rolePermission.createMany({
          data: values.map((permission) => ({ role, permission })),
        });
      }
    });
  }
}
