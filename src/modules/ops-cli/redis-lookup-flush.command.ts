import { Logger } from '@nestjs/common';
import { Command, CommandRunner, Option } from 'nest-commander';
import { LookupCacheService } from '../cache/lookup-cache.service';
import { RedisLookupStore } from '../cache/redis-lookup.store';
import { isKnownLookupTable } from '../cache/lookup-table.registry';

interface RedisLookupFlushOptions {
  all?: boolean;
  force?: boolean;
}

/**
 * Laravel App\Console\Commands\RedisLookupFlush (redis:lookup-flush).
 *
 * Nest adaptation: nest-commander ships no interactive confirm prompt (Laravel's
 * `$this->confirm(...)`), so `--all` requires an explicit `--force` flag instead of an
 * interactive y/n. `--all` SCANs + DELs keys under `${LOOKUP_CACHE_KEY_PREFIX}:*` on the
 * RedisLookupStore connection rather than FLUSHDB, so it is safe even if that connection
 * is ever shared with unrelated keys.
 */
@Command({
  name: 'redis:lookup-flush',
  arguments: '[tables...]',
  description: 'Flush permanent lookup cache keys (does not touch RedisHelper UI cache)',
  argsDescription: {
    tables: 'Table name(s) to flush; omit with --all',
  },
})
export class RedisLookupFlushCommand extends CommandRunner {
  private readonly logger = new Logger(RedisLookupFlushCommand.name);

  constructor(
    private readonly lookupCache: LookupCacheService,
    private readonly store: RedisLookupStore,
  ) {
    super();
  }

  async run(passedParams: string[], options: RedisLookupFlushOptions): Promise<void> {
    if (options.all) {
      if (!options.force) {
        this.logger.error(
          'Refusing to flush ALL lookup keys without --force (nest-commander has no interactive confirm).',
        );
        process.exitCode = 1;
        return;
      }
      const deleted = await this.flushAll();
      this.logger.log(
        `Flushed ${deleted} key(s) matching ${this.store.keyPrefix()}:* on the lookups Redis DB.`,
      );
      return;
    }

    if (passedParams.length === 0) {
      this.logger.error('Pass table names or --all. Example: redis:lookup-flush cpt_codes');
      process.exitCode = 1;
      return;
    }

    for (const table of passedParams) {
      if (!isKnownLookupTable(table)) {
        this.logger.warn(`Skipping unknown table [${table}]`);
        continue;
      }
      await this.lookupCache.invalidateTable(table);
      this.logger.log(`Flushed lookup table [${table}]`);
    }
  }

  /** SCAN + DEL keys under the lookup prefix (preferred over FLUSHDB per migration plan). */
  private async flushAll(): Promise<number> {
    const client = this.store.raw();
    const pattern = `${this.store.keyPrefix()}:*`;
    let cursor = '0';
    let deleted = 0;
    do {
      const [nextCursor, keys] = await client.scan(cursor, 'MATCH', pattern, 'COUNT', 500);
      cursor = nextCursor;
      if (keys.length > 0) {
        deleted += await client.del(...keys);
      }
    } while (cursor !== '0');
    return deleted;
  }

  @Option({
    flags: '--all',
    description: 'Flush every lookup key in the lookups Redis DB',
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
}
