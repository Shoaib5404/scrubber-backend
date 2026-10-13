import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { LookupCacheService } from './lookup-cache.service';
import { LookupImportVerifyService } from './lookup-import-verify.service';
import { LookupWarmService } from './lookup-warm.service';
import { NcciRulesCacheService } from './ncci-rules-cache.service';
import { RedisLookupStore } from './redis-lookup.store';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [
    RedisLookupStore,
    LookupCacheService,
    NcciRulesCacheService,
    LookupWarmService,
    LookupImportVerifyService,
  ],
  exports: [
    RedisLookupStore,
    LookupCacheService,
    NcciRulesCacheService,
    LookupWarmService,
    LookupImportVerifyService,
  ],
})
export class LookupCacheModule {}
