import { Module } from '@nestjs/common';
import { StaffOnlyGuard } from '../../common/guards/staff-only.guard';
import { AuthModule } from '../auth/auth.module';
import { CustomerDashboardController } from './customer-dashboard.controller';
import { DashboardService } from './dashboard.service';
import { StaffDashboardController } from './staff-dashboard.controller';

@Module({
  imports: [AuthModule],
  controllers: [StaffDashboardController, CustomerDashboardController],
  providers: [DashboardService, StaffOnlyGuard],
  exports: [DashboardService],
})
export class DashboardModule {}
