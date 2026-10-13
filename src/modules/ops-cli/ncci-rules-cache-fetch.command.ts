import { Logger } from '@nestjs/common';
import { writeFileSync } from 'fs';
import * as path from 'path';
import { Command, CommandRunner, Option } from 'nest-commander';
import { NcciRulesCacheService } from '../cache/ncci-rules-cache.service';

interface NcciRulesCacheFetchOptions {
  warm?: boolean;
  output?: string;
}

/**
 * Inspect/warm Nest NCCI lookup cache (`lookup:v1:nccis:full:active`, auto-chunked).
 */
@Command({
  name: 'ncci:rules-cache-fetch',
  description: 'Inspect/warm the NCCI rules cache (lookup:v1:nccis:full:active)',
})
export class NcciRulesCacheFetchCommand extends CommandRunner {
  private readonly logger = new Logger(NcciRulesCacheFetchCommand.name);

  constructor(private readonly ncciRulesCache: NcciRulesCacheService) {
    super();
  }

  async run(_passedParams: string[], options: NcciRulesCacheFetchOptions): Promise<void> {
    this.logger.log('Cache key: lookup:v1:nccis:full:active (chunked when large)');

    let rows;
    let hit: boolean;

    if (options.warm) {
      this.logger.log('Warming cache from database (loads full active nccis table)...');
      rows = await this.ncciRulesCache.warmFullTable();
      hit = false;
      this.logger.log('Warm complete.');
    } else {
      const peeked = await this.ncciRulesCache.peekFullTable();
      hit = peeked !== null;
      rows = peeked ?? (await this.ncciRulesCache.getFullTable());
    }

    this.logger.log(hit ? `Cache hit: ${rows.length} row(s).` : `Cache miss: loaded ${rows.length} row(s) from DB.`);

    if (options.output) {
      const outputPath = path.isAbsolute(options.output)
        ? options.output
        : path.resolve(process.cwd(), options.output);
      writeFileSync(outputPath, JSON.stringify(rows), 'utf8');
      this.logger.log(`Wrote JSON to: ${outputPath}`);
      return;
    }

    if (rows.length > 0) {
      this.logger.log(`Sample (first row): ${JSON.stringify(rows[0])}`);
    } else {
      this.logger.log('Table is cached as empty (0 rows).');
    }
  }

  @Option({
    flags: '--warm',
    description: 'Load all active NCCI rows from the database into cache first (use on cache miss)',
  })
  parseWarm(): boolean {
    return true;
  }

  @Option({
    flags: '--output [path]',
    description: 'Path to write JSON (full array); omit to print a summary + sample row only',
  })
  parseOutput(val: string): string {
    return val;
  }
}
