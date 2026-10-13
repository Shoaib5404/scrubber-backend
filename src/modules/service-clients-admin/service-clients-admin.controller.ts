import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { StaffOnlyGuard } from '../../common/guards/staff-only.guard';
import { Permission } from '../auth/permissions.constants';
import { RequirePermissionGuard } from '../auth/guards/require-permission.guard';
import {
  AuthPrincipal,
  CurrentAuth,
  RequirePermissions,
} from '../auth/auth.types';
import {
  CreateServiceClientDto,
  ListServiceClientsQueryDto,
  ReissueServiceClientDto,
} from './service-clients-admin.dto';
import { ServiceClientsAdminService } from './service-clients-admin.service';

/**
 * Platform service clients for NeoMD own apps (TeleWound, etc.).
 * Unbound from tenants/users — distinct from customer Integrations credentials.
 */
@ApiTags('admin-service-clients')
@ApiBearerAuth()
@UseGuards(StaffOnlyGuard, RequirePermissionGuard)
@RequirePermissions(Permission.UsersManage)
@Controller('admin/service-clients')
export class ServiceClientsAdminController {
  constructor(private readonly clients: ServiceClientsAdminService) {}

  @Get('scope-catalog')
  @ApiOperation({ summary: 'Scope checklist for platform service clients' })
  scopeCatalog() {
    return { success: true, data: this.clients.scopeCatalog() };
  }

  @Get()
  @ApiOperation({
    summary: 'List platform service clients (user_id and tenant_id null)',
  })
  async list(@Query() query: ListServiceClientsQueryDto) {
    return { success: true, data: await this.clients.list(query) };
  }

  @Post()
  @ApiOperation({
    summary: 'Create a platform service client for an internal NeoMD app',
  })
  async create(
    @Body() body: CreateServiceClientDto,
    @CurrentAuth() auth: AuthPrincipal,
  ) {
    return {
      success: true,
      message:
        'Platform service client created. Copy the secret now — it will not be shown again.',
      data: await this.clients.create(body, auth.userId),
    };
  }

  @Post(':id/rotate')
  @ApiOperation({ summary: 'Rotate platform service client secret' })
  async rotate(@Param('id', ParseIntPipe) id: number) {
    return {
      success: true,
      message:
        'API secret rotated. Copy the new secret now — it will not be shown again.',
      data: await this.clients.rotate(id),
    };
  }

  @Post(':id/reissue')
  @ApiOperation({ summary: 'Reissue client_id + secret for a platform service client' })
  async reissue(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: ReissueServiceClientDto,
  ) {
    return {
      success: true,
      message:
        'API credentials reissued. Copy the secret now — it will not be shown again.',
      data: await this.clients.reissue(id, body),
    };
  }

  @Post(':id/revoke')
  @ApiOperation({ summary: 'Revoke a platform service client' })
  async revoke(@Param('id', ParseIntPipe) id: number) {
    return {
      success: true,
      message: 'Platform service client revoked.',
      data: await this.clients.revoke(id),
    };
  }
}
