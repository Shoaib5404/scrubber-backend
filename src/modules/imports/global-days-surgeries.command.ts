import { Logger } from '@nestjs/common';
import { Command, CommandRunner, Option } from 'nest-commander';
import { GlobalDaysSurgeriesImportService } from './global-days-surgeries.import.service';
import { assertReadableFile, resolveFilePath } from './import.utils';

interface GlobalDaysSurgeriesImportOptions {
  truncate?: boolean;
  chunk?: number;
}

@Command({
  name: 'global-days-surgeries:import',
  arguments: '[file]',
  description: 'Import global days surgery codes from CSV',
  argsDescription: {
    file: 'Path to CSV file (default: import/Global Days Surgery.csv)',
  },
})
export class GlobalDaysSurgeriesImportCommand extends CommandRunner {
  private readonly logger = new Logger(GlobalDaysSurgeriesImportCommand.name);

  constructor(private readonly importService: GlobalDaysSurgeriesImportService) {
    super();
  }

  async run(
    passedParams: string[],
    options: GlobalDaysSurgeriesImportOptions,
  ): Promise<void> {
    const filePath = resolveFilePath(passedParams[0], 'import/Global Days Surgery.csv');

    try {
      assertReadableFile(filePath);
    } catch {
      this.logger.error(`File not found or not readable: ${filePath}`);
      process.exitCode = 1;
      return;
    }

    if (options.truncate) {
      this.logger.warn('Truncating global_days_surgeries table...');
    }

    try {
      this.logger.log(`Importing from: ${filePath}`);
      const result = await this.importService.importFromFile(filePath, {
        truncate: options.truncate,
        chunk: options.chunk,
      });
      this.logger.log(`Upserted: ${result.upserted}`);
      this.logger.log(`Skipped (blank or invalid row): ${result.skipped}`);
    } catch (e) {
      this.logger.error(`Import failed: ${e instanceof Error ? e.message : String(e)}`);
      process.exitCode = 1;
    }
  }

  @Option({
    flags: '--truncate',
    description: 'Truncate global_days_surgeries table before import',
  })
  parseTruncate(): boolean {
    return true;
  }

  @Option({
    flags: '--chunk [chunk]',
    description: 'Number of rows per insert batch',
    defaultValue: '1000',
  })
  parseChunk(val: string): number {
    return Number(val);
  }
}
