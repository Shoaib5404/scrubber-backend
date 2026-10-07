import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Command, CommandRunner } from 'nest-commander';
import { lookupMetaKey } from '../cache/cache.constants';
import { RedisLookupStore } from '../cache/redis-lookup.store';
import { LOOKUP_CACHE_TABLE_NAMES, isKnownLookupTable } from '../cache/lookup-table.registry';

/**
 * Laravel App\Console\Commands\RedisLookupStatus (redis:lookup-status).
 *
 * Nest adaptation: there is no `LookupTableRegistry` service with per-table profile/version
 * metadata yet, so this reports table names from the static LOOKUP_CACHE_TABLE_NAMES
 * registry and only checks whether the Laravel-shaped meta key
 * (`${prefix}:meta:${table}`) exists — Nest tables don't write that key until something
 * calls `invalidateTable`/a future Laravel-style seed writes it, so most tables will show
 * "not seeded" until first touched. This stays honest about the gap rather than fabricating
 * row counts/versions Nest does not track per-table.
 */
@Command({
  name: 'redis:lookup-status',
  arguments: '[table]',
  description: 'Show lookup cache meta-key presence for one or all known tables',
  argsDescription: {
    table: 'Optional table to inspect',
  },
})
export class RedisLookupStatusCommand extends CommandRunner {
  private readonly logger = new Logger(RedisLookupStatusCommand.name);

  constructor(
    private readonly store: RedisLookupStore,
    private readonly config: ConfigService,
  ) {
    super();
  }

  async run(passedParams: string[]): Promise<void> {
    this.logger.log(`LOOKUP_CACHE_ENABLED=${this.store.enabled()}`);
    this.logger.log(`REDIS_LOOKUP_DB=${this.config.get<number>('REDIS_LOOKUP_DB', 2)}`);

    const requested = passedParams[0];
    if (requested !== undefined && !isKnownLookupTable(requested)) {
      this.logger.error(`Unknown table [${requested}]`);
      process.exitCode = 1;
      return;
    }

    const tables = requested !== undefined ? [requested] : [...LOOKUP_CACHE_TABLE_NAMES];
    for (const table of tables) {
      const metaKey = lookupMetaKey(this.store.keyPrefix(), table);
      const meta = await this.store.get(metaKey);
      const warmedAt = meta !== null ? 'present' : 'not seeded';
      this.logger.log(`${table}  meta_key=${metaKey}  warmed_at=${warmedAt}`);
    }
  }
}
