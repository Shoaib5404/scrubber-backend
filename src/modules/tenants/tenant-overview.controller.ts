import {
  Controller,
  ForbiddenException,
  Get,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PeriodFilterQueryDto } from '../../common/period/period-filter.dto';
import { UserRole } from '../auth/auth.constants';
import { AuthPrincipal, CurrentAuth } from '../auth/auth.types';
import { TenantActivityService } from './tenant-activity.service';
import { TenantFeaturesService } from './tenant-features.service';

class TenantSelfOverviewQueryDto extends PeriodFilterQueryDto {}

@ApiTags('tenant-overview')
@ApiBearerAuth()
@Controller('tenant')
export class TenantOverviewController {
  constructor(
    private readonly activity: TenantActivityService,
    private readonly tenantFeatures: TenantFeaturesService,
  ) {}

  @Get('overview')
  async overview(
    @CurrentAuth() auth: AuthPrincipal,
    @Query() query: TenantSelfOverviewQueryDto,
  ) {
    const tenantId = this.requireTenantAdmin(auth);
    const tenant = await this.activity.requireTenant(tenantId);
    const features = await this.tenantFeatures.list(tenantId);
    const filter = {
      period: query.period ?? ('30d' as const),
      from: query.from,
      to: query.to,
    };
    const [stats, members, recent_batches] = await Promise.all([
      this.activity.tenantStats(tenantId, filter),
      this.activity.memberActivity(tenantId, filter),
      this.activity.recentBatches(tenantId, 10),
    ]);

    return {
      success: true,
      data: {
        tenant: {
          id: tenant.id,
          name: tenant.name,
          slug: tenant.slug,
          status: tenant.status,
          subscription_status: tenant.subscriptionStatus,
          features,
        },
        period: stats.period,
        period_start: stats.period_start,
        period_end: stats.period_end,
        stats: {
          batches: stats.batches,
          claims: stats.claims,
          users: stats.users,
        },
        members,
        recent_batches,
      },
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
