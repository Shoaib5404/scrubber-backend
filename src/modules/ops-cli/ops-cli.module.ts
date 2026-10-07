import { Module } from '@nestjs/common';
import { QueueModule } from '../queue/queue.module';
import { NcciRulesCacheFetchCommand } from './ncci-rules-cache-fetch.command';
import { RedisLookupFlushCommand } from './redis-lookup-flush.command';
import { RedisLookupStatusCommand } from './redis-lookup-status.command';
import { RedisSeedLookupsCommand } from './redis-seed-lookups.command';
import { DetectStalledQueuesCommand } from './detect-stalled-queues.command';

/**
 * SP-8 Task 19 group 9 — small CLI module for ops commands that don't belong under
 * ImportsModule: NCCI cache inspection, lookup-cache maintenance, and stalled-queue
 * detection. LookupCacheModule/NcciRulesCacheService are `@Global()` (see
 * lookup-cache.module.ts), so only QueueModule needs an explicit import here
 * (for DetectStalledQueuesService).
 *
 * SKIPPED for this group (not ported): Laravel `redis:flush` (RedisHelper UI-cache groups,
 * e.g. dashboard widgets) has no Nest RedisHelper-group equivalent yet — tracked as a TODO
 * for a future lookup-cache/UI-cache mapping pass, not implemented here.
 */
@Module({
  imports: [QueueModule],
  providers: [
    NcciRulesCacheFetchCommand,
    RedisLookupFlushCommand,
    RedisLookupStatusCommand,
    RedisSeedLookupsCommand,
    DetectStalledQueuesCommand,
  ],
})
export class OpsCliModule {}
