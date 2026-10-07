import { Logger } from '@nestjs/common';
import { Command, CommandRunner, Option } from 'nest-commander';
import { accessSync, constants } from 'fs';
import { resolveFilePath } from './import.utils';
import { ZeroAmountProceduresImportService } from './zero-amount-procedures.import.service';

interface ZeroAmountProceduresImportOptions {
  truncate?: boolean;
  chunk?: number;
}

@Command({
  name: 'zero-amount-procedures:import',
  arguments: '[file]',
  description:
    'Import zero-amount procedure codes from Excel (ProcedureCode only; ID column ignored)',
  argsDescription: {
    file: 'Path to Excel (.xlsx/.xls) file (default: import/Zero-Amount-Procedures.xlsx)',
  },
})
export class ZeroAmountProceduresImportCommand extends CommandRunner {
  private readonly logger = new Logger(ZeroAmountProceduresImportCommand.name);

  constructor(private readonly importService: ZeroAmountProceduresImportService) {
    super();
  }

  async run(passedParams: string[], options: ZeroAmountProceduresImportOptions): Promise<void> {
    const filePath = resolveFilePath(passedParams[0], 'import/Zero-Amount-Procedures.xlsx');

    try {
      accessSync(filePath, constants.F_OK);
    } catch {
      this.logger.error(`File not found: ${filePath}`);
      process.exitCode = 1;
      return;
    }

    if (options.truncate) {
      this.logger.log('Truncated zero_amount_procedures table.');
    }

    try {
      this.logger.log(`Loading Excel: ${filePath}`);
      const result = await this.importService.importFromFile(filePath, {
        truncate: options.truncate,
        chunk: options.chunk,
      });
      this.logger.log('Importing ProcedureCode only (ID column ignored).');
      this.logger.log(`Upserted: ${result.upserted}`);
      this.logger.log(`Skipped (blank/invalid ProcedureCode): ${result.skipped}`);
    } catch (e) {
      this.logger.error(`Import failed: ${e instanceof Error ? e.message : String(e)}`);
      process.exitCode = 1;
    }
  }

  @Option({
    flags: '--truncate',
    description: 'Truncate the zero_amount_procedures table before importing',
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
