import { Global, Module, forwardRef } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { StaffOnlyGuard } from '../../common/guards/staff-only.guard';
import { AuthModule } from '../auth/auth.module';
import { AdminAuditController } from './admin-audit.controller';
import { AuditContextInterceptor } from './audit-context.interceptor';
import { AuditController } from './audit.controller';
import { AuditQueryService } from './audit-query.service';
import { AuditService } from './audit.service';

@Global()
@Module({
  imports: [forwardRef(() => AuthModule)],
  controllers: [AdminAuditController, AuditController],
  providers: [
    AuditService,
    AuditQueryService,
    StaffOnlyGuard,
    { provide: APP_INTERCEPTOR, useClass: AuditContextInterceptor },
  ],
  exports: [AuditService, AuditQueryService],
})
export class AuditModule {}
