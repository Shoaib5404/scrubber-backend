import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Command, CommandRunner } from 'nest-commander';
import { lookupLogicalName, lookupV1Key, lookupChunkMetaKey } from '../cache/cache.constants';
import { RedisLookupStore } from '../cache/redis-lookup.store';
import { LOOKUP_CACHE_TABLE_NAMES, isKnownLookupTable } from '../cache/lookup-table.registry';

/**
 * Report Nest v1 lookup cache presence for registered tables on Redis DB 1.
 */
@Command({
  name: 'redis:lookup-status',
  arguments: '[table]',
  description: 'Show lookup cache key presence for one or all known tables',
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
    this.logger.log(`REDIS_LOOKUP_DB=${this.config.get<number>('REDIS_LOOKUP_DB', 1)}`);
    this.logger.log(`lookup Redis dbIndex=${this.store.dbIndex()}`);

    const requested = passedParams[0];
    if (requested !== undefined && requested !== 'nccis' && !isKnownLookupTable(requested)) {
      this.logger.error(`Unknown table [${requested}]`);
      process.exitCode = 1;
      return;
    }

    const tables =
      requested !== undefined ? [requested] : [...LOOKUP_CACHE_TABLE_NAMES, 'nccis'];

    for (const table of tables) {
      const logical =
        table === 'nccis'
          ? 'nccis:full:active'
          : lookupLogicalName(table, 'full', 'all');
      const prefix = this.store.keyPrefix();
      const singleKey = lookupV1Key(prefix, logical);
      const metaKey = lookupChunkMetaKey(prefix, logical);
      const [single, meta] = await this.store.mget([singleKey, metaKey]);
      let state = 'cold';
      if (single != null) state = 'warm (single)';
      else if (meta != null) state = 'warm (chunked)';
      this.logger.log(`${table}  key=${singleKey}  state=${state}`);
    }
  }
}
