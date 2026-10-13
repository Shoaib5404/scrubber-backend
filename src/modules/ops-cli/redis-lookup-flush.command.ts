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
 * Flush Nest lookup cache keys on Redis DB 1.
 * One table, multiple tables, or --all --force (SCAN+DEL under prefix; never FLUSHDB).
 */
@Command({
  name: 'redis:lookup-flush',
  arguments: '[tables...]',
  description: 'Flush lookup cache keys on Redis DB 1 (single / multiple / all)',
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
      const deleted = await this.lookupCache.flushAllLookupKeys();
      this.logger.log(
        `Flushed ${deleted} key(s) matching ${this.store.keyPrefix()}:* on lookup Redis db=${this.store.dbIndex()}.`,
      );
      return;
    }

    if (passedParams.length === 0) {
      this.logger.error(
        'Pass table names or --all. Example: redis:lookup-flush cpt_codes zip_codes',
      );
      process.exitCode = 1;
      return;
    }

    for (const table of passedParams) {
      if (table === 'nccis') {
        await this.lookupCache.invalidate('nccis:full:active');
        this.logger.log('Flushed lookup table [nccis]');
        continue;
      }
      if (!isKnownLookupTable(table)) {
        this.logger.warn(`Skipping unknown table [${table}]`);
        continue;
      }
      await this.lookupCache.invalidateTable(table);
      this.logger.log(`Flushed lookup table [${table}]`);
    }
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
    description: 'Required with --all',
  })
  parseForce(): boolean {
    return true;
  }
}
