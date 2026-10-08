import { Module } from '@nestjs/common';
import { StaffOnlyGuard } from '../../common/guards/staff-only.guard';
import { ApiClientsModule } from '../api-clients/api-clients.module';
import { UsersAdminController } from './users-admin.controller';
import { UsersAdminService } from './users-admin.service';

@Module({
  imports: [ApiClientsModule],
  controllers: [UsersAdminController],
  providers: [UsersAdminService, StaffOnlyGuard],
})
export class UsersAdminModule {}
