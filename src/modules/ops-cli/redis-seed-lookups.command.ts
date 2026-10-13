import { Logger } from '@nestjs/common';
import { Command, CommandRunner, Option } from 'nest-commander';
import { LOOKUP_CACHE_TABLE_NAMES, isKnownLookupTable } from '../cache/lookup-table.registry';
import { LookupCacheService } from '../cache/lookup-cache.service';
import { LookupWarmService } from '../cache/lookup-warm.service';

interface RedisSeedLookupsOptions {
  force?: boolean;
  list?: boolean;
  warm?: boolean;
  warmAll?: boolean;
}

/**
 * Seed / warm Nest lookup cache on Redis DB 1.
 * Default (no --warm): invalidate so next read rebuilds.
 * --warm / --warm-all: load from Postgres and SET (chunked when large).
 */
@Command({
  name: 'redis:seed-lookups',
  arguments: '[tables...]',
  description: 'Invalidate and/or warm lookup tables into Redis DB 1',
  argsDescription: {
    tables: 'Table name(s); omit with --warm-all / --list',
  },
})
export class RedisSeedLookupsCommand extends CommandRunner {
  private readonly logger = new Logger(RedisSeedLookupsCommand.name);

  constructor(
    private readonly lookupCache: LookupCacheService,
    private readonly warmService: LookupWarmService,
  ) {
    super();
  }

  async run(passedParams: string[], options: RedisSeedLookupsOptions): Promise<void> {
    if (options.list) {
      for (const name of LOOKUP_CACHE_TABLE_NAMES) {
        this.logger.log(`  ${name}`);
      }
      this.logger.log('  nccis  (special — NcciRulesCacheService)');
      return;
    }

    if (!this.lookupCache.isEnabled() && !options.force) {
      this.logger.error(
        'Lookup cache is disabled (LOOKUP_CACHE_ENABLED=false). Use --force to attempt anyway.',
      );
      process.exitCode = 1;
      return;
    }

    if (options.warmAll) {
      const results = await this.warmService.warmAllRegistered();
      for (const r of results) {
        this.logger.log(`${r.ok ? 'OK' : 'FAIL'} ${r.table}: ${r.detail}`);
      }
      if (results.some((r) => !r.ok)) process.exitCode = 1;
      return;
    }

    const tables = passedParams.length > 0 ? passedParams : [...LOOKUP_CACHE_TABLE_NAMES];
    for (const table of tables) {
      if (table !== 'nccis' && !isKnownLookupTable(table)) {
        this.logger.error(`Unknown lookup table [${table}]. Run with --list.`);
        process.exitCode = 1;
        continue;
      }

      if (options.warm) {
        const result = await this.warmService.warmTable(table);
        this.logger.log(`${result.ok ? 'OK' : 'FAIL'} ${result.table}: ${result.detail}`);
        if (!result.ok) process.exitCode = 1;
      } else {
        if (table === 'nccis') {
          await this.lookupCache.invalidate('nccis:full:active');
        } else {
          await this.lookupCache.invalidateTable(table);
        }
        this.logger.log(`${table}: forced cold; warms on next read or use --warm`);
      }
    }
  }

  @Option({
    flags: '--force',
    description: 'Attempt even if LOOKUP_CACHE_ENABLED=false',
  })
  parseForce(): boolean {
    return true;
  }

  @Option({
    flags: '--list',
    description: 'List registered tables and exit',
  })
  parseList(): boolean {
    return true;
  }

  @Option({
    flags: '--warm',
    description: 'Eagerly load table(s) from Postgres into Redis (chunked if large)',
  })
  parseWarm(): boolean {
    return true;
  }

  @Option({
    flags: '--warm-all',
    description: 'Eagerly warm every registered table + nccis',
  })
  parseWarmAll(): boolean {
    return true;
  }
}
