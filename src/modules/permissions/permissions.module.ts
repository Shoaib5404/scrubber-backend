import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SuperAdminOnlyGuard } from '../auth/guards/super-admin-only.guard';
import { PermissionsController } from './permissions.controller';

@Module({
  imports: [AuthModule],
  controllers: [PermissionsController],
  providers: [SuperAdminOnlyGuard],
})
export class PermissionsModule {}
