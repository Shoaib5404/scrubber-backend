import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { StaffOnlyGuard } from '../../common/guards/staff-only.guard';
import { RequirePermissions } from '../auth/auth.types';
import { RequirePermissionGuard } from '../auth/guards/require-permission.guard';
import { Permission } from '../auth/permissions.constants';
import { DashboardService } from './dashboard.service';
import {
  DashboardActivityQueryDto,
  DashboardStatsQueryDto,
} from './dto/dashboard-query.dto';

@ApiTags('staff-dashboard')
@ApiBearerAuth()
@UseGuards(StaffOnlyGuard, RequirePermissionGuard)
@RequirePermissions(Permission.DashboardView)
@Controller('staff/dashboard')
export class StaffDashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('stats')
  async stats(@Query() query: DashboardStatsQueryDto) {
    const data = await this.dashboard.staffStats({
      period: query.period ?? '30d',
      from: query.from,
      to: query.to,
    });
    return { success: true, data };
  }

  @Get('activity')
  async activity(@Query() query: DashboardActivityQueryDto) {
    const data = await this.dashboard.staffActivity(query.limit ?? 10);
    return { success: true, data };
  }
}
