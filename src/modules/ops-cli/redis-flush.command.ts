import { Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type IORedis from 'ioredis';
import { Command, CommandRunner, Option } from 'nest-commander';
import { LookupCacheService } from '../cache/lookup-cache.service';
import { NcciRulesCacheService } from '../cache/ncci-rules-cache.service';
import { isKnownLookupTable } from '../cache/lookup-table.registry';
import { createBullRedisConnection } from '../queue/redis.connection';
import { KNOWN_REDIS_FLUSH_GROUPS, isKnownRedisFlushGroup } from './redis-flush.constants';

interface RedisFlushOptions {
  all?: boolean;
  force?: boolean;
  key?: string[];
  list?: boolean;
}

/**
 * Laravel `App\Console\Commands\RedisFlush` (`redis:flush`).
 *
 * Nest adaptation — Laravel's `RedisHelper` tagged UI-response cache has no Nest
 * equivalent, so this is a pragmatic port against what Nest actually has:
 *   - `--all --force`: SCAN+DEL every key on the **main** Redis connection (`REDIS_URL`,
 *     default logical DB 0 — the same connection BullMQ uses; there is no separate
 *     Laravel-style "cache" connection in Nest, so this is destructive to queued jobs too).
 *     `--force` is required (no interactive confirm, matching `redis-lookup-flush`).
 *   - A bare group name: `ncci`/`ncci_rules` → `NcciRulesCacheService.invalidateFullTable()`;
 *     a name matching `LOOKUP_CACHE_TABLE_NAMES` → `LookupCacheService.invalidateTable()`;
 *     anything else → generic `{group}:*` SCAN+DEL on the main connection (keys that don't
 *     exist, e.g. unported article/batch-view groups, simply delete 0 keys).
 *   - `--key=group:rest`: DEL that single literal key.
 *   - No interactive mode (Laravel's `$this->choice(...)`): no args prints usage and exits 1.
 */
@Command({
  name: 'redis:flush',
  arguments: '[groups...]',
  description: 'Delete Redis cache keys — flush all, flush known groups, or remove individual keys',
  argsDescription: {
    groups: 'Cache group name(s), e.g. ncci cpt_codes',
  },
})
export class RedisFlushCommand extends CommandRunner implements OnModuleDestroy {
  private readonly logger = new Logger(RedisFlushCommand.name);
  private readonly client: IORedis;

  constructor(
    private readonly lookupCache: LookupCacheService,
    private readonly ncciRulesCache: NcciRulesCacheService,
    config: ConfigService,
  ) {
    super();
    this.client = createBullRedisConnection(config);
  }

  onModuleDestroy(): void {
    this.client.disconnect();
  }

  async run(passedParams: string[], options: RedisFlushOptions): Promise<void> {
    if (options.list) {
      this.logger.log(`Known groups (${KNOWN_REDIS_FLUSH_GROUPS.length}):`);
      for (const group of KNOWN_REDIS_FLUSH_GROUPS) {
        this.logger.log(`  ${group}`);
      }
      return;
    }

    if (options.all) {
      if (!options.force) {
        this.logger.error(
          'Refusing to flush ALL Redis keys without --force (nest-commander has no interactive confirm).',
        );
        process.exitCode = 1;
        return;
      }
      const deleted = await this.scanDeletePattern('*');
      this.logger.log(`Flushed ${deleted} key(s) from the main Redis DB (--all --force).`);
      return;
    }

    if (options.key && options.key.length > 0) {
      await this.deleteKeys(options.key);
      return;
    }

    if (passedParams.length > 0) {
      await this.flushGroups(passedParams);
      return;
    }

    this.printUsage();
    process.exitCode = 1;
  }

  private async flushGroups(groups: string[]): Promise<void> {
    const unknown = groups.filter((g) => !isKnownRedisFlushGroup(g));
    if (unknown.length > 0) {
      this.logger.warn(`Unknown group(s) (not in the copied Laravel KNOWN_GROUPS list): ${unknown.join(', ')}`);
    }

    for (const group of groups) {
      if (group === 'ncci' || group === 'ncci_rules') {
        await this.ncciRulesCache.invalidateFullTable();
        this.logger.log(`Flushed NCCI rules cache (group: ${group}) via NcciRulesCacheService.invalidateFullTable()`);
        continue;
      }

      if (isKnownLookupTable(group)) {
        await this.lookupCache.invalidateTable(group);
        this.logger.log(`Flushed lookup table cache for group: ${group}`);
        continue;
      }

      const deleted = await this.scanDeletePattern(`${group}:*`);
      this.logger.log(`Flushed group: ${group} (${deleted} key(s) matching "${group}:*")`);
    }
  }

  private async deleteKeys(keys: string[]): Promise<void> {
    for (const raw of keys) {
      const sepIndex = raw.indexOf(':');
      if (sepIndex <= 0 || sepIndex === raw.length - 1) {
        this.logger.error(`Invalid key format "${raw}". Expected group:key (e.g. ncci:data:abc123).`);
        process.exitCode = 1;
        return;
      }
      const deleted = await this.client.del(raw);
      if (deleted > 0) {
        this.logger.log(`Deleted key: ${raw}`);
      } else {
        this.logger.warn(`Key not found or already expired: ${raw}`);
      }
    }
  }

  private async scanDeletePattern(pattern: string): Promise<number> {
    let cursor = '0';
    let deleted = 0;
    do {
      const [nextCursor, keys] = await this.client.scan(cursor, 'MATCH', pattern, 'COUNT', 500);
      cursor = nextCursor;
      if (keys.length > 0) {
        deleted += await this.client.del(...keys);
      }
    } while (cursor !== '0');
    return deleted;
  }

  private printUsage(): void {
    this.logger.error('Usage: redis:flush <group...> | --all --force | --key=group:key | --list');
    this.logger.log(`Known groups: ${KNOWN_REDIS_FLUSH_GROUPS.join(', ')}`);
  }

  @Option({
    flags: '--all',
    description: 'Flush the entire main Redis DB (requires --force; also clears BullMQ queue data)',
  })
  parseAll(): boolean {
    return true;
  }

  @Option({
    flags: '--force',
    description: 'Required with --all to skip the (missing) interactive confirm',
  })
  parseForce(): boolean {
    return true;
  }

  @Option({
    flags: '--key <group:key>',
    description: 'Delete one specific key (format group:key); repeat flag for multiple',
  })
  parseKey(val: string, previous: string[] = []): string[] {
    return [...previous, val];
  }

  @Option({
    flags: '--list',
    description: 'List known cache groups and exit',
  })
  parseList(): boolean {
    return true;
  }
}
