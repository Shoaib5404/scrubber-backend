import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthPrincipal, CurrentAuth } from '../auth/auth.types';
import { DashboardService } from './dashboard.service';
import {
  DashboardRecentBatchesQueryDto,
  DashboardStatsQueryDto,
} from './dto/dashboard-query.dto';

@ApiTags('dashboard')
@ApiBearerAuth()
@Controller('dashboard')
export class CustomerDashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('stats')
  async stats(
    @CurrentAuth() auth: AuthPrincipal,
    @Query() query: DashboardStatsQueryDto,
  ) {
    const data = await this.dashboard.customerStats(auth, {
      period: query.period ?? '30d',
      from: query.from,
      to: query.to,
    });
    return { success: true, data };
  }

  @Get('recent-batches')
  async recentBatches(
    @CurrentAuth() auth: AuthPrincipal,
    @Query() query: DashboardRecentBatchesQueryDto,
  ) {
    const data = await this.dashboard.customerRecentBatches(
      auth,
      query.limit ?? 10,
    );
    return { success: true, data };
  }
}
