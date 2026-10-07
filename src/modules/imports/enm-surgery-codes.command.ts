import { Logger } from '@nestjs/common';
import { Command, CommandRunner, Option } from 'nest-commander';
import { assertReadableFile, resolveFilePath } from './import.utils';
import { EnmSurgeryCodesImportService } from './enm-surgery-codes.import.service';

interface EnmSurgeryCodesImportOptions {
  truncate?: boolean;
  chunk?: number;
}

@Command({
  name: 'cpt:import-enm-surgery-codes',
  arguments: '[file]',
  description: 'Import E/M surgery CPT codes from an Excel file',
  argsDescription: {
    file: 'Path to Excel (.xlsx/.xls) file (default: import/EnM-surgery-codes.xlsx)',
  },
})
export class EnmSurgeryCodesImportCommand extends CommandRunner {
  private readonly logger = new Logger(EnmSurgeryCodesImportCommand.name);

  constructor(private readonly importService: EnmSurgeryCodesImportService) {
    super();
  }

  async run(passedParams: string[], options: EnmSurgeryCodesImportOptions): Promise<void> {
    const filePath = resolveFilePath(passedParams[0], 'import/EnM-surgery-codes.xlsx');

    try {
      assertReadableFile(filePath);
    } catch {
      this.logger.error(`File not found: ${filePath}`);
      process.exitCode = 1;
      return;
    }

    if (options.truncate) {
      this.logger.log('Truncated enm_surgery_codes table.');
    }

    try {
      this.logger.log(`Loading Excel: ${filePath}`);
      const result = await this.importService.importFromFile(filePath, {
        truncate: options.truncate,
        chunk: options.chunk,
      });
      this.logger.log(`Upserted: ${result.upserted}`);
      this.logger.log(`Skipped (blank or invalid CPT): ${result.skipped}`);
    } catch (e) {
      this.logger.error(`Import failed: ${e instanceof Error ? e.message : String(e)}`);
      process.exitCode = 1;
    }
  }

  @Option({
    flags: '--truncate',
    description: 'Truncate the enm_surgery_codes table before importing',
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
