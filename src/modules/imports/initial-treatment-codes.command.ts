import { Logger } from '@nestjs/common';
import { Command, CommandRunner, Option } from 'nest-commander';
import { assertReadableFile, resolveFilePath } from './import.utils';
import { InitialTreatmentCodesImportService } from './initial-treatment-codes.import.service';

interface InitialTreatmentCodesImportOptions {
  truncate?: boolean;
  chunk?: number;
}

@Command({
  name: 'initial-treatment-codes:import',
  arguments: '[file]',
  description: 'Import initial treatment codes from CSV',
  argsDescription: {
    file: 'Path to CSV file (default: import/CPT libraries/initial treatment codes.csv)',
  },
})
export class InitialTreatmentCodesImportCommand extends CommandRunner {
  private readonly logger = new Logger(InitialTreatmentCodesImportCommand.name);

  constructor(private readonly importService: InitialTreatmentCodesImportService) {
    super();
  }

  async run(passedParams: string[], options: InitialTreatmentCodesImportOptions): Promise<void> {
    const filePath = resolveFilePath(
      passedParams[0],
      'import/CPT libraries/initial treatment codes.csv',
    );

    try {
      assertReadableFile(filePath);
    } catch {
      this.logger.error(`File not found or not readable: ${filePath}`);
      process.exitCode = 1;
      return;
    }

    if (options.truncate) {
      this.logger.warn('Truncating initial_treatment_codes table...');
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
    description: 'Truncate initial_treatment_codes table before import',
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
