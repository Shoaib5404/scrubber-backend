import { Logger } from '@nestjs/common';
import { Command, CommandRunner, Option } from 'nest-commander';
import { assertReadableFile, resolveFilePath } from './import.utils';
import { MajorSurgeryCodesImportService } from './major-surgery-codes.import.service';

interface MajorSurgeryCodesImportOptions {
  truncate?: boolean;
  chunk?: number;
}

@Command({
  name: 'major-surgery-codes:import',
  arguments: '[file]',
  description: 'Import major surgery codes from CSV',
  argsDescription: {
    file: 'Path to CSV file (default: import/CPT libraries/Major surgeries codes.csv)',
  },
})
export class MajorSurgeryCodesImportCommand extends CommandRunner {
  private readonly logger = new Logger(MajorSurgeryCodesImportCommand.name);

  constructor(private readonly importService: MajorSurgeryCodesImportService) {
    super();
  }

  async run(passedParams: string[], options: MajorSurgeryCodesImportOptions): Promise<void> {
    const filePath = resolveFilePath(
      passedParams[0],
      'import/CPT libraries/Major surgeries codes.csv',
    );

    try {
      assertReadableFile(filePath);
    } catch {
      this.logger.error(`File not found or not readable: ${filePath}`);
      process.exitCode = 1;
      return;
    }

    if (options.truncate) {
      this.logger.warn('Truncating major_surgery_codes table...');
    }

    try {
      this.logger.log(`Importing from: ${filePath}`);
      const result = await this.importService.importFromFile(filePath, {
        truncate: options.truncate,
        chunk: options.chunk,
      });
      this.logger.log(`Upserted: ${result.upserted}`);
      this.logger.log(`Skipped (blank or invalid code): ${result.skipped}`);
    } catch (e) {
      this.logger.error(`Import failed: ${e instanceof Error ? e.message : String(e)}`);
      process.exitCode = 1;
    }
  }

  @Option({
    flags: '--truncate',
    description: 'Truncate major_surgery_codes table before import',
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
