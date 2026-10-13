import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../../common/prisma/prisma.service';
import { UserRole } from '../auth/auth.constants';
import { AuthPrincipal, CurrentAuth } from '../auth/auth.types';
import { InviteTenantUserDto, ResendInviteDto } from '../tenants-admin/tenants-admin.dto';
import { TenantInviteService } from './tenant-invite.service';

/**
 * Tenant-admin self-service: invite members under their own tenant.
 */
@ApiTags('tenant-members')
@ApiBearerAuth()
@Controller('tenant/members')
export class TenantMembersController {
  constructor(
    private readonly invites: TenantInviteService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  async list(@CurrentAuth() auth: AuthPrincipal) {
    const tenantId = this.requireTenantAdmin(auth);
    const users = await this.prisma.user.findMany({
      where: { tenantId },
      orderBy: { id: 'asc' },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
      },
    });
    return {
      success: true,
      data: users.map((u) => ({
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role,
        is_active: u.isActive,
      })),
    };
  }

  @Post()
  async invite(@CurrentAuth() auth: AuthPrincipal, @Body() body: InviteTenantUserDto) {
    const tenantId = this.requireTenantAdmin(auth);
    const data = await this.invites.inviteUser({
      tenantId,
      email: body.email,
      name: body.name,
      role: body.role,
      invitedByUserId: auth.userId,
    });
    const warning = (data as { email_warning?: string }).email_warning;
    return {
      success: true,
      message: warning
        ? `Invite created for ${body.email}, but email was not delivered.`
        : `Invite sent to ${body.email}.`,
      data,
    };
  }

  @Post('resend-invite')
  async resend(@CurrentAuth() auth: AuthPrincipal, @Body() body: ResendInviteDto) {
    const tenantId = this.requireTenantAdmin(auth);
    const data = await this.invites.resendInvite({
      tenantId,
      email: body.email,
      invitedByUserId: auth.userId,
    });
    return {
      success: true,
      message: data.email_warning
        ? `Invite for ${body.email} refreshed, but email was not delivered.`
        : `Invite resent to ${body.email}.`,
      data,
    };
  }

  private requireTenantAdmin(auth: AuthPrincipal): number {
    if (
      auth.typ !== 'user' ||
      auth.role !== UserRole.TenantAdmin ||
      auth.tenantId == null
    ) {
      throw new ForbiddenException('Tenant admin access required.');
    }
    return auth.tenantId;
  }
}
