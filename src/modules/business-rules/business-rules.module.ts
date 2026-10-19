import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import {
  BusinessRuleGrantsController,
  BusinessRulesController,
} from './business-rules.controller';
import { BusinessRulesService } from './business-rules.service';

@Module({
  imports: [AuditModule],
  controllers: [BusinessRulesController, BusinessRuleGrantsController],
  providers: [BusinessRulesService],
  exports: [BusinessRulesService],
})
export class BusinessRulesModule {}
