import { Logger } from '@nestjs/common';
import { Command, CommandRunner, Option } from 'nest-commander';
import { LookupCacheService } from '../cache/lookup-cache.service';
import { NcciRulesCacheService } from '../cache/ncci-rules-cache.service';
import { LOOKUP_CACHE_TABLE_NAMES, isKnownLookupTable } from '../cache/lookup-table.registry';

interface RedisSeedLookupsOptions {
  force?: boolean;
  list?: boolean;
}

/**
 * Laravel App\Console\Commands\RedisSeedLookupTables (redis:seed-lookups).
 *
 * Nest adaptation: Laravel's `LookupCacheWriter::rebuild()` eagerly builds profile-specific
 * rows/idx_map/group_rows blobs. Nest has no equivalent writer — tables warm lazily via
 * `LookupCacheService.getOrLoad` on first read. "Seeding" here means forcing a table cold
 * (`invalidateTable`) so the next read rebuilds it, except `nccis`, which special-cases
 * through `NcciRulesCacheService.warmFullTable()` for an eager warm matching its real
 * (non-lazy) cache shape.
 */
@Command({
  name: 'redis:seed-lookups',
  arguments: '[table]',
  description: 'Force lookup tables cold so Nest warms them on next read via getOrLoad/DB',
  argsDescription: {
    table: 'Optional single table name from LOOKUP_CACHE_TABLE_NAMES',
  },
})
export class RedisSeedLookupsCommand extends CommandRunner {
  private readonly logger = new Logger(RedisSeedLookupsCommand.name);

  constructor(
    private readonly lookupCache: LookupCacheService,
    private readonly ncciRulesCache: NcciRulesCacheService,
  ) {
    super();
  }

  async run(passedParams: string[], options: RedisSeedLookupsOptions): Promise<void> {
    if (options.list) {
      for (const name of LOOKUP_CACHE_TABLE_NAMES) {
        this.logger.log(`  ${name}`);
      }
      return;
    }

    if (!this.lookupCache.isEnabled() && !options.force) {
      this.logger.error('Lookup cache is disabled (LOOKUP_CACHE_ENABLED=false). Use --force to attempt anyway.');
      process.exitCode = 1;
      return;
    }

    const requested = passedParams[0];

    if (requested === 'nccis') {
      await this.ncciRulesCache.warmFullTable();
      this.logger.log('nccis: warmed via NcciRulesCacheService.warmFullTable() (not in LOOKUP_CACHE_TABLE_NAMES)');
      return;
    }

    if (requested !== undefined && !isKnownLookupTable(requested)) {
      this.logger.error(`Unknown lookup table [${requested}]. Run with --list.`);
      process.exitCode = 1;
      return;
    }

    const tables = requested !== undefined ? [requested] : [...LOOKUP_CACHE_TABLE_NAMES];
    for (const table of tables) {
      await this.lookupCache.invalidateTable(table);
      this.logger.log(`${table}: forced cold; Nest warms on read via getOrLoad/DB`);
    }
  }

  @Option({
    flags: '--force',
    description: 'Rebuild even if LOOKUP_CACHE_ENABLED is false (writes still require Redis)',
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
}
