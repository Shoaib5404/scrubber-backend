import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { StaffOnlyGuard } from '../../common/guards/staff-only.guard';
import {
  AuthPrincipal,
  CurrentAuth,
  RequirePermissions,
} from '../auth/auth.types';
import { RequirePermissionGuard } from '../auth/guards/require-permission.guard';
import { Permission } from '../auth/permissions.constants';
import {
  CreateTenantDto,
  InviteTenantUserDto,
  ListTenantsQueryDto,
  ResendInviteDto,
  TenantOverviewQueryDto,
  UpdateTenantDto,
  UpdateTenantUserDto,
} from './tenants-admin.dto';
import { TenantsAdminService } from './tenants-admin.service';

@ApiTags('admin-tenants')
@ApiBearerAuth()
@UseGuards(StaffOnlyGuard, RequirePermissionGuard)
@RequirePermissions(Permission.TenantsManage)
@Controller('admin/tenants')
export class TenantsAdminController {
  constructor(private readonly tenants: TenantsAdminService) {}

  @Get()
  async list(@Query() query: ListTenantsQueryDto) {
    return { success: true, data: await this.tenants.list(query) };
  }

  @Get('feature-catalog')
  async featureCatalog() {
    return { success: true, data: this.tenants.featureCatalog() };
  }

  @Post()
  async create(@Body() body: CreateTenantDto, @CurrentAuth() auth: AuthPrincipal) {
    const data = await this.tenants.create(body, auth.userId);
    const invite = data.invite as
      | { email_warning?: string; invite_url?: string }
      | null
      | undefined;
    const warning = invite?.email_warning;
    return {
      success: true,
      message: warning
        ? `Tenant created. Invite email was not delivered — use the invite link from the response/logs.`
        : body.admin_email
          ? `Tenant created and invite sent to ${body.admin_email}.`
          : 'Tenant created successfully.',
      data,
    };
  }

  @Get(':id/overview')
  async overview(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: TenantOverviewQueryDto,
  ) {
    return {
      success: true,
      data: await this.tenants.overview(id, {
        period: query.period ?? '30d',
        from: query.from,
        to: query.to,
      }),
    };
  }

  @Get(':id')
  async show(@Param('id', ParseIntPipe) id: number) {
    return { success: true, data: await this.tenants.show(id) };
  }

  @Patch(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateTenantDto,
  ) {
    return {
      success: true,
      message: 'Tenant updated successfully.',
      data: await this.tenants.update(id, body),
    };
  }

  @Get(':id/users')
  async listUsers(@Param('id', ParseIntPipe) id: number) {
    return { success: true, data: await this.tenants.listUsers(id) };
  }

  @Post(':id/users')
  async inviteUser(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: InviteTenantUserDto,
    @CurrentAuth() auth: AuthPrincipal,
  ) {
    const data = await this.tenants.inviteUser(id, body, auth.userId);
    const warning = (data as { email_warning?: string }).email_warning;
    return {
      success: true,
      message: warning
        ? `Invite created for ${body.email}, but email was not delivered.`
        : `Invite sent to ${body.email}.`,
      data,
    };
  }

  @Post(':id/users/resend-invite')
  async resendInvite(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: ResendInviteDto,
    @CurrentAuth() auth: AuthPrincipal,
  ) {
    const data = await this.tenants.resendInvite(id, body, auth.userId);
    const warning = data.email_warning;
    return {
      success: true,
      message: warning
        ? `Invite for ${body.email} refreshed, but email was not delivered.`
        : `Invite resent to ${body.email}.`,
      data,
    };
  }

  @Patch(':id/users/:userId')
  async updateUser(
    @Param('id', ParseIntPipe) id: number,
    @Param('userId', ParseIntPipe) userId: number,
    @Body() body: UpdateTenantUserDto,
  ) {
    return {
      success: true,
      message: 'User updated successfully.',
      data: await this.tenants.updateUser(id, userId, body),
    };
  }
}
