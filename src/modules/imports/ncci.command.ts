import { Logger } from '@nestjs/common';
import { existsSync } from 'fs';
import { Command, CommandRunner, Option } from 'nest-commander';
import { assertReadableFile, resolveFilePath } from './import.utils';
import { NcciImportResult, NcciImportService } from './ncci.import.service';

interface NcciImportCommandOptions {
  chunk?: number;
  merge?: boolean;
  fresh?: boolean;
  source?: string;
}

/**
 * Laravel App\Console\Commands\ImportNcci (ncci:import).
 * Default (no `file` argument): imports the 4 default files (import/ncci_1..4.xlsx).
 */
@Command({
  name: 'ncci:import',
  arguments: '[file]',
  description: 'Import NCCI PTP records from Excel (imports all 4 default files if file is omitted)',
  argsDescription: {
    file: 'Path to a specific NCCI Excel file (imports import/ncci_1..4.xlsx if omitted)',
  },
})
export class NcciImportCommand extends CommandRunner {
  private readonly logger = new Logger(NcciImportCommand.name);

  constructor(private readonly importService: NcciImportService) {
    super();
  }

  async run(passedParams: string[], options: NcciImportCommandOptions): Promise<void> {
    if (options.fresh) {
      this.logger.warn('Truncating nccis table before import...');
      await this.importService.truncateAndInvalidate();
    }

    const file = passedParams[0];
    if (file) {
      await this.importSingleFile(file, options);
      return;
    }

    await this.importDefaultFiles(options);
  }

  private async importSingleFile(file: string, options: NcciImportCommandOptions): Promise<void> {
    const filePath = resolveFilePath(file, file);

    try {
      assertReadableFile(filePath);
    } catch {
      this.logger.error(`File not found: ${filePath}`);
      process.exitCode = 1;
      return;
    }

    this.logger.log(`Importing: ${filePath}`);
    const result = await this.importService.importFromFile(filePath, {
      chunk: options.chunk,
      merge: options.merge,
      source: options.source,
    });
    this.printResult(result);

    if (result.errors > 0) {
      process.exitCode = 1;
    }
  }

  private async importDefaultFiles(options: NcciImportCommandOptions): Promise<void> {
    const { files, skippedFiles } = await this.importService.importDefaultFiles(
      (relativePath) => resolveFilePath(undefined, relativePath),
      (filePath) => existsSync(filePath),
      { chunk: options.chunk, merge: options.merge },
    );

    for (const relativePath of skippedFiles) {
      this.logger.warn(`Skipping (not found): ${relativePath}`);
    }

    for (const result of files) {
      this.printResult(result);
    }

    const totals = files.reduce(
      (acc, result) => ({
        imported: acc.imported + result.imported,
        updated: acc.updated + result.updated,
        skipped: acc.skipped + result.skipped,
        errors: acc.errors + result.errors,
      }),
      { imported: 0, updated: 0, skipped: 0, errors: 0 },
    );

    this.logger.log(
      `OVERALL: files=${files.length} imported=${totals.imported} updated=${totals.updated} ` +
        `skipped=${totals.skipped} errors=${totals.errors}`,
    );

    if (totals.errors > 0) {
      process.exitCode = 1;
    }
  }

  private printResult(result: NcciImportResult): void {
    this.logger.log(
      `${result.source}: imported=${result.imported} updated=${result.updated} ` +
        `skipped=${result.skipped} errors=${result.errors} totalProcessed=${result.totalProcessed}`,
    );
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
    flags: '--merge',
    description: 'Update existing records instead of skipping duplicates',
  })
  parseMerge(): boolean {
    return true;
  }

  @Option({
    flags: '--fresh',
    description: 'Truncate the nccis table before importing',
  })
  parseFresh(): boolean {
    return true;
  }

  @Option({
    flags: '--source [source]',
    description: 'Source label override (auto-detected from filename)',
  })
  parseSource(val: string): string {
    return val;
  }
}
