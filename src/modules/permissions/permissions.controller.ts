import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsObject, IsOptional } from 'class-validator';
import { SuperAdminOnlyGuard } from '../auth/guards/super-admin-only.guard';
import {
  MANAGEABLE_ROLES,
  PERMISSION_CATALOG,
} from '../auth/permissions.constants';
import { RolePermissionService } from '../auth/role-permission.service';

class UpdatePermissionsDto {
  @IsOptional()
  @IsObject()
  permissions?: Record<string, string[]>;
}

@ApiTags('admin-permissions')
@ApiBearerAuth()
@UseGuards(SuperAdminOnlyGuard)
@Controller('admin/permissions')
export class PermissionsController {
  constructor(private readonly rolePermissions: RolePermissionService) {}

  @Get()
  async show() {
    const roles = this.rolePermissions.manageableRoles();
    const selected: Record<string, string[]> = {};
    for (const role of roles) {
      selected[role] = await this.rolePermissions.permissionValuesForRole(role);
    }

    const grouped: Record<string, typeof PERMISSION_CATALOG> = {};
    for (const perm of PERMISSION_CATALOG) {
      if (!grouped[perm.group]) {
        grouped[perm.group] = [];
      }
      grouped[perm.group].push(perm);
    }

    return {
      success: true,
      data: {
        roles: MANAGEABLE_ROLES,
        catalog: PERMISSION_CATALOG,
        grouped,
        selected,
      },
    };
  }

  @Put()
  async update(@Body() body: UpdatePermissionsDto) {
    const submitted = body.permissions ?? {};
    for (const role of MANAGEABLE_ROLES) {
      const values = Array.isArray(submitted[role]) ? submitted[role] : [];
      await this.rolePermissions.syncRolePermissions(role, values);
    }

    const selected: Record<string, string[]> = {};
    for (const role of MANAGEABLE_ROLES) {
      selected[role] = await this.rolePermissions.permissionValuesForRole(role);
    }

    return {
      success: true,
      message: 'Permissions updated successfully.',
      data: { selected },
    };
  }
}
