import { Logger } from '@nestjs/common';
import { Command, CommandRunner, Option } from 'nest-commander';
import { assertReadableFile, resolveFilePath } from './import.utils';
import { EnmProceduresImportService } from './enm-procedures.import.service';

interface EnmProceduresImportOptions {
  truncate?: boolean;
  chunk?: number;
}

@Command({
  name: 'cpt:import-enm-procedures',
  arguments: '[file]',
  description: 'Import E/M procedure CPT codes from an Excel or JSON file',
  argsDescription: {
    file: 'Path to Excel (.xlsx/.xls) or JSON file (default: import/EnM-procedures.xlsx)',
  },
})
export class EnmProceduresImportCommand extends CommandRunner {
  private readonly logger = new Logger(EnmProceduresImportCommand.name);

  constructor(private readonly importService: EnmProceduresImportService) {
    super();
  }

  async run(passedParams: string[], options: EnmProceduresImportOptions): Promise<void> {
    const filePath = resolveFilePath(passedParams[0], 'import/EnM-procedures.xlsx');

    try {
      assertReadableFile(filePath);
    } catch {
      this.logger.error(`File not found: ${filePath}`);
      process.exitCode = 1;
      return;
    }

    if (options.truncate) {
      this.logger.log('Truncated enm_procedures table.');
    }

    try {
      this.logger.log(`Importing from: ${filePath}`);
      const result = await this.importService.importFromFile(filePath, {
        truncate: options.truncate,
        chunk: options.chunk,
      });
      this.logger.log(`Upserted: ${result.upserted}`);
      this.logger.log(`Skipped (blank CPT): ${result.skipped}`);
    } catch (e) {
      this.logger.error(`Import failed: ${e instanceof Error ? e.message : String(e)}`);
      process.exitCode = 1;
    }
  }

  @Option({
    flags: '--truncate',
    description: 'Truncate the enm_procedures table before importing',
  })
  parseTruncate(): boolean {
    return true;
  }

  @Option({
    flags: '--chunk [chunk]',
    description: 'Number of records to process at a time (Excel only)',
    defaultValue: '500',
  })
  parseChunk(val: string): number {
    return Number(val);
  }
}
