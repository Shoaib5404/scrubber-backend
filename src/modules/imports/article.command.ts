import { Logger } from '@nestjs/common';
import { Command, CommandRunner, Option } from 'nest-commander';
import { ArticleImportFormat, ArticleImportService } from './article.import.service';

interface ArticleImportCommandOptions {
  table?: string;
  list?: boolean;
  chunk?: number;
  fresh?: boolean;
  truncate?: boolean;
  path?: string;
  format?: string;
}

/** Laravel App\Console\Commands\ImportArticleData (`article:import`). */
@Command({
  name: 'article:import',
  description:
    'Import article data (CSV or Excel) into database tables in dependency order ' +
    '(lookups -> main entities -> relations -> cross-references)',
})
export class ArticleImportCommand extends CommandRunner {
  private readonly logger = new Logger(ArticleImportCommand.name);

  constructor(private readonly importService: ArticleImportService) {
    super();
  }

  async run(_passedParams: string[], options: ArticleImportCommandOptions): Promise<void> {
    if (options.list) {
      this.printTableList();
      return;
    }

    const format: ArticleImportFormat = options.format === 'xlsx' ? 'xlsx' : 'csv';
    if (options.format && options.format !== 'csv' && options.format !== 'xlsx') {
      this.logger.error('Invalid format. Use csv or xlsx.');
      process.exitCode = 1;
      return;
    }

    // --truncate is accepted as an alias for --fresh (Laravel only has --fresh; some operators
    // reach for --truncate by habit from the other import commands in this module).
    const truncate = Boolean(options.fresh || options.truncate);

    try {
      const stats = await this.importService.importAll({
        table: options.table,
        chunk: options.chunk,
        truncate,
        path: options.path,
        format,
      });

      this.logger.log(`Importing article data from: ${stats.dataPath} (format: ${stats.format})`);

      let currentPhase = '';
      for (const tableResult of stats.tables) {
        if (tableResult.phase !== currentPhase) {
          currentPhase = tableResult.phase;
          this.logger.log(`=== Phase: ${currentPhase} ===`);
        }
        if (!tableResult.found) {
          this.logger.warn(`  SKIP ${tableResult.table} — file not found: ${tableResult.csv}`);
          continue;
        }
        this.logger.log(
          `  ${tableResult.table}: ${tableResult.imported} imported, ${tableResult.skipped} skipped, ` +
            `${tableResult.errors} errors`,
        );
      }

      this.logger.log('=== IMPORT COMPLETE ===');
      this.logger.log(`Tables processed: ${stats.totals.tablesProcessed}`);
      this.logger.log(`Total rows imported: ${stats.totals.imported}`);
      this.logger.log(`Total rows skipped: ${stats.totals.skipped}`);
      this.logger.log(`Total errors: ${stats.totals.errors}`);

      process.exitCode = stats.totals.errors > 0 ? 1 : 0;
    } catch (e) {
      this.logger.error(`Import failed: ${e instanceof Error ? e.message : String(e)}`);
      process.exitCode = 1;
    }
  }

  private printTableList(): void {
    const order = this.importService.getImportOrder();
    this.logger.log('#\tTable\tCSV File\tPhase');
    order.forEach((entry, index) => {
      this.logger.log(`${index + 1}\t${entry.table}\t${entry.csv}\t${entry.phase}`);
    });
  }

  @Option({
    flags: '--table [table]',
    description: 'Import only a specific table (use --list to see available tables)',
  })
  parseTable(val: string): string {
    return val;
  }

  @Option({
    flags: '--list',
    description: 'List all available tables and exit',
  })
  parseList(): boolean {
    return true;
  }

  @Option({
    flags: '--chunk [chunk]',
    description: 'Rows per database batch',
    defaultValue: '1000',
  })
  parseChunk(val: string): number {
    return Number(val);
  }

  @Option({
    flags: '--fresh',
    description: 'Truncate tables before importing',
  })
  parseFresh(): boolean {
    return true;
  }

  @Option({
    flags: '--truncate',
    description: 'Alias for --fresh',
  })
  parseTruncate(): boolean {
    return true;
  }

  @Option({
    flags: '--path [path]',
    description: 'Path to data directory (default: import/article_csv)',
  })
  parsePath(val: string): string {
    return val;
  }

  @Option({
    flags: '--format [format]',
    description: 'Input format: csv or xlsx',
    defaultValue: 'csv',
  })
  parseFormat(val: string): string {
    return val;
  }
}
