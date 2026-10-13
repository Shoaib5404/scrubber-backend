import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { StaffOnlyGuard } from '../../common/guards/staff-only.guard';
import { Permission } from '../auth/permissions.constants';
import { RequirePermissionGuard } from '../auth/guards/require-permission.guard';
import {
  AuthPrincipal,
  CurrentAuth,
  RequirePermissions,
} from '../auth/auth.types';
import {
  CreateApiClientDto,
  CreateUserDto,
  ListUsersQueryDto,
  ReissueApiClientDto,
  UpdateUserDto,
} from './users-admin.dto';
import { UsersAdminService } from './users-admin.service';

@ApiTags('admin-users')
@ApiBearerAuth()
@UseGuards(StaffOnlyGuard, RequirePermissionGuard)
@RequirePermissions(Permission.UsersManage)
@Controller('admin/users')
export class UsersAdminController {
  constructor(private readonly users: UsersAdminService) {}

  @Get()
  async list(@Query() query: ListUsersQueryDto) {
    return { success: true, data: await this.users.list(query) };
  }

  @Get('meta')
  meta(@CurrentAuth() auth: AuthPrincipal) {
    return {
      success: true,
      data: this.users.formMeta(auth.role ?? ''),
    };
  }

  @Post()
  async create(
    @Body() body: CreateUserDto,
    @CurrentAuth() auth: AuthPrincipal,
  ) {
    return {
      success: true,
      message: `User ${body.email} created successfully.`,
      data: await this.users.create(body, auth.role ?? ''),
    };
  }

  @Get(':id')
  async show(@Param('id', ParseIntPipe) id: number) {
    return { success: true, data: await this.users.show(id) };
  }

  @Put(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateUserDto,
    @CurrentAuth() auth: AuthPrincipal,
  ) {
    const actorId = auth.userId ?? 0;
    return {
      success: true,
      message: `User ${body.email} updated successfully.`,
      data: await this.users.update(id, body, actorId, auth.role ?? ''),
    };
  }

  @Get(':id/api-clients')
  async getApiClient(@Param('id', ParseIntPipe) id: number) {
    return { success: true, data: await this.users.getApiClient(id) };
  }

  @Post(':id/api-clients')
  async createApiClient(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: CreateApiClientDto,
    @CurrentAuth() auth: AuthPrincipal,
  ) {
    const createdBy = auth.userId ?? 0;
    return {
      success: true,
      message: 'API credentials created. Copy the secret now — it will not be shown again.',
      data: await this.users.createApiClient(id, body, createdBy),
    };
  }

  @Post(':id/api-clients/:clientId/rotate')
  async rotate(
    @Param('id', ParseIntPipe) id: number,
    @Param('clientId', ParseIntPipe) clientId: number,
  ) {
    return {
      success: true,
      message: 'API secret rotated. Copy the new secret now — it will not be shown again.',
      data: await this.users.rotateApiClient(id, clientId),
    };
  }

  @Post(':id/api-clients/:clientId/reissue')
  async reissue(
    @Param('id', ParseIntPipe) id: number,
    @Param('clientId', ParseIntPipe) clientId: number,
    @Body() body: ReissueApiClientDto,
  ) {
    return {
      success: true,
      message: 'API credentials reissued. Copy the secret now — it will not be shown again.',
      data: await this.users.reissueApiClient(id, clientId, body),
    };
  }

  @Post(':id/api-clients/:clientId/revoke')
  async revoke(
    @Param('id', ParseIntPipe) id: number,
    @Param('clientId', ParseIntPipe) clientId: number,
  ) {
    return {
      success: true,
      message: 'API credentials revoked.',
      data: await this.users.revokeApiClient(id, clientId),
    };
  }
}
