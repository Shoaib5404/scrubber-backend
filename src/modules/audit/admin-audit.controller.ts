import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { StaffOnlyGuard } from '../../common/guards/staff-only.guard';
import { RequirePermissionGuard } from '../auth/guards/require-permission.guard';
import { SuperAdminOnlyGuard } from '../auth/guards/super-admin-only.guard';
import { Permission } from '../auth/permissions.constants';
import {
  CurrentAuth,
  RequirePermissions,
  type AuthPrincipal,
} from '../auth/auth.types';
import { AuditQueryService } from './audit-query.service';
import { AuditService } from './audit.service';
import {
  ListAuditEventsQueryDto,
  PatchAuditCategoryDto,
} from './dto/audit-query.dto';

@ApiTags('admin-audit')
@ApiBearerAuth()
@Controller('admin/audit')
export class AdminAuditController {
  constructor(
    private readonly audit: AuditService,
    private readonly query: AuditQueryService,
  ) {}

  @Get('categories')
  @UseGuards(SuperAdminOnlyGuard)
  async listCategories() {
    return { success: true, data: await this.audit.listCategories() };
  }

  @Patch('categories/:code')
  @UseGuards(SuperAdminOnlyGuard)
  async patchCategory(
    @Param('code') code: string,
    @Body() body: PatchAuditCategoryDto,
    @CurrentAuth() auth: AuthPrincipal,
  ) {
    const data = await this.audit.setCategoryEnabled(
      code,
      body.enabled,
      auth.userId,
    );
    return { success: true, data };
  }

  @Get('events')
  @UseGuards(StaffOnlyGuard, RequirePermissionGuard)
  @RequirePermissions(Permission.AuditView)
  async listEvents(
    @CurrentAuth() auth: AuthPrincipal,
    @Query() query: ListAuditEventsQueryDto,
  ) {
    return { success: true, data: await this.query.list(auth, query) };
  }
}
