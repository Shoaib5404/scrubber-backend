import { Logger } from '@nestjs/common';
import { Command, CommandRunner, Option } from 'nest-commander';
import { assertReadableFile, resolveFilePath } from './import.utils';
import { VaccineCodesImportService } from './vaccine-codes.import.service';

interface VaccineCodesImportOptions {
  truncate?: boolean;
  chunk?: number;
}

@Command({
  name: 'vaccine-codes:import',
  arguments: '[file]',
  description:
    'Import vaccine codes from Excel (Vaccine Code, Descriptions, # of Vaccine Components)',
  argsDescription: {
    file: 'Path to Excel (.xlsx/.xls) file (default: import/vaccine-codes.xlsx)',
  },
})
export class VaccineCodesImportCommand extends CommandRunner {
  private readonly logger = new Logger(VaccineCodesImportCommand.name);

  constructor(private readonly importService: VaccineCodesImportService) {
    super();
  }

  async run(passedParams: string[], options: VaccineCodesImportOptions): Promise<void> {
    const filePath = resolveFilePath(passedParams[0], 'import/vaccine-codes.xlsx');

    try {
      assertReadableFile(filePath);
    } catch {
      this.logger.error(`File not found: ${filePath}`);
      process.exitCode = 1;
      return;
    }

    if (options.truncate) {
      this.logger.log('Truncated vaccine_codes table.');
    }

    try {
      this.logger.log(`Loading Excel: ${filePath}`);
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
    description: 'Truncate the vaccine_codes table before importing',
  })
  parseTruncate(): boolean {
    return true;
  }

  @Option({
    flags: '--chunk [chunk]',
    description: 'Number of records to process at a time',
    defaultValue: '500',
  })
  parseChunk(val: string): number {
    return Number(val);
  }
}
