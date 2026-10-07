import { Global, Module } from '@nestjs/common';
import { LookupCacheService } from './lookup-cache.service';
import { NcciRulesCacheService } from './ncci-rules-cache.service';
import { RedisLookupStore } from './redis-lookup.store';

@Global()
@Module({
  providers: [RedisLookupStore, LookupCacheService, NcciRulesCacheService],
  exports: [RedisLookupStore, LookupCacheService, NcciRulesCacheService],
})
export class LookupCacheModule {}
