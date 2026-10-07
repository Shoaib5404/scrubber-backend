import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Command, CommandRunner, Option } from 'nest-commander';
import { defaultNpiImportFilePath, resolveNpiImportDirectory } from './npi-ordering-referring.helpers';
import { NpiOrderingReferringImportService } from './npi-ordering-referring.import.service';

interface NpiOrderingReferringImportCommandOptions {
  date?: string;
  chunk?: number;
  truncate?: boolean;
  syncId?: number;
}

/** Laravel App\Console\Commands\ImportNpiOrderingReferrings (npi-ordering-referrings:import). */
@Command({
  name: 'npi-ordering-referrings:import',
  arguments: '[file]',
  description: 'Import NPI Ordering Referring dataset from CSV',
  argsDescription: {
    file: 'Path to CSV file (default: <import dir>/<Month>_<Day>_<Year>.csv for --date or yesterday)',
  },
})
export class NpiOrderingReferringImportCommand extends CommandRunner {
  private readonly logger = new Logger(NpiOrderingReferringImportCommand.name);

  constructor(
    private readonly importService: NpiOrderingReferringImportService,
    private readonly config: ConfigService,
  ) {
    super();
  }

  async run(
    passedParams: string[],
    options: NpiOrderingReferringImportCommandOptions,
  ): Promise<void> {
    const importDirectory = resolveNpiImportDirectory(
      this.config.get<string>('NPI_ORDERING_REFERRING_IMPORT_DIRECTORY', 'import/NPI_Ordering_Referring'),
    );

    let filePath: string;
    try {
      filePath = passedParams[0] ?? defaultNpiImportFilePath(importDirectory, options.date);
    } catch (e) {
      this.logger.error(e instanceof Error ? e.message : String(e));
      process.exitCode = 1;
      return;
    }

    try {
      const stats = await this.importService.importFromFile(filePath, {
        chunk: options.chunk,
        truncate: options.truncate,
        syncId: options.syncId,
      });

      this.logger.log(`Importing from: ${filePath}`);
      this.logger.log(`  Processed: ${stats.processed.toLocaleString('en-US')}`);
      this.logger.log(`  Upserted: ${stats.upserted.toLocaleString('en-US')}`);
      this.logger.log(`  Skipped (blank NPI): ${stats.skippedBlankNpi.toLocaleString('en-US')}`);
      this.logger.log(
        `  Deactivated (not seen in import): ${stats.deactivated.toLocaleString('en-US')}`,
      );
    } catch (e) {
      this.logger.error(`Import failed: ${e instanceof Error ? e.message : String(e)}`);
      process.exitCode = 1;
    }
  }

  @Option({
    flags: '--date [date]',
    description: 'CSV file date in Y-m-d format (default: yesterday, UTC)',
  })
  parseDate(val: string): string {
    return val;
  }

  @Option({
    flags: '--chunk [chunk]',
    description: 'Number of rows per upsert batch',
    defaultValue: '1000',
  })
  parseChunk(val: string): number {
    return Number(val);
  }

  @Option({
    flags: '--truncate',
    description: 'Truncate NPI ordering referrings table before import',
  })
  parseTruncate(): boolean {
    return true;
  }

  @Option({
    flags: '--sync-id [syncId]',
    description: 'Update npi_ordering_referring_syncs row_count after a successful import',
  })
  parseSyncId(val: string): number {
    return Number(val);
  }
}
