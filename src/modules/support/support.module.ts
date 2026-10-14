import { Module } from '@nestjs/common';
import { StaffOnlyGuard } from '../../common/guards/staff-only.guard';
import { AuthModule } from '../auth/auth.module';
import { AdminInquiriesController } from './admin-inquiries.controller';
import { SupportController } from './support.controller';
import { SupportService } from './support.service';

@Module({
  imports: [AuthModule],
  controllers: [SupportController, AdminInquiriesController],
  providers: [SupportService, StaffOnlyGuard],
  exports: [SupportService],
})
export class SupportModule {}
