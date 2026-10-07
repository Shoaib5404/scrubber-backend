import { Logger } from '@nestjs/common';
import { Command, CommandRunner, Option } from 'nest-commander';
import { assertReadableFile, resolveFilePath } from './import.utils';
import { McrVaccineCodesImportService } from './mcr-vaccine-codes.import.service';

interface McrVaccineCodesImportOptions {
  truncate?: boolean;
  chunk?: number;
}

@Command({
  name: 'mcr-vaccine-codes:import',
  arguments: '[file]',
  description: 'Import MCR vaccine codes from Excel (sheet name = type: Flu, Pneumococcal, Hepatitis)',
  argsDescription: {
    file: 'Path to Excel (.xlsx/.xls) file (default: import/mcr-vaccine-codes.xlsx)',
  },
})
export class McrVaccineCodesImportCommand extends CommandRunner {
  private readonly logger = new Logger(McrVaccineCodesImportCommand.name);

  constructor(private readonly importService: McrVaccineCodesImportService) {
    super();
  }

  async run(passedParams: string[], options: McrVaccineCodesImportOptions): Promise<void> {
    const filePath = resolveFilePath(passedParams[0], 'import/mcr-vaccine-codes.xlsx');

    try {
      assertReadableFile(filePath);
    } catch {
      this.logger.error(`File not found: ${filePath}`);
      process.exitCode = 1;
      return;
    }

    if (options.truncate) {
      this.logger.warn('Truncating mcr_vaccine_codes table.');
    }

    try {
      this.logger.log(`Loading Excel: ${filePath}`);
      const result = await this.importService.importFromFile(filePath, {
        truncate: options.truncate,
        chunk: options.chunk,
      });
      this.logger.log(
        `Imported: ${result.imported}, Updated: ${result.updated}, Skipped: ${result.skipped}, Errors: ${result.errors}`,
      );
      if (result.errors > 0) {
        process.exitCode = 1;
      }
    } catch (e) {
      this.logger.error(`Import failed: ${e instanceof Error ? e.message : String(e)}`);
      process.exitCode = 1;
    }
  }

  @Option({
    flags: '--truncate',
    description: 'Truncate the mcr_vaccine_codes table before importing',
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
