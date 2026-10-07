import { Logger } from '@nestjs/common';
import { Command, CommandRunner, Option } from 'nest-commander';
import { assertReadableFile, resolveFilePath } from './import.utils';
import { ConsultationProceduresImportService } from './consultation-procedures.import.service';

interface ConsultationProceduresImportOptions {
  truncate?: boolean;
  chunk?: number;
}

@Command({
  name: 'cpt:import-consultation-procedures',
  arguments: '[file]',
  description: 'Import consultation procedure CPT codes from an Excel file',
  argsDescription: {
    file: 'Path to Excel (.xlsx/.xls) file (default: import/Consultation-Procedures.xlsx)',
  },
})
export class ConsultationProceduresImportCommand extends CommandRunner {
  private readonly logger = new Logger(ConsultationProceduresImportCommand.name);

  constructor(private readonly importService: ConsultationProceduresImportService) {
    super();
  }

  async run(passedParams: string[], options: ConsultationProceduresImportOptions): Promise<void> {
    const filePath = resolveFilePath(passedParams[0], 'import/Consultation-Procedures.xlsx');

    try {
      assertReadableFile(filePath);
    } catch {
      this.logger.error(`File not found: ${filePath}`);
      process.exitCode = 1;
      return;
    }

    if (options.truncate) {
      this.logger.log('Truncated consultation_procedures table.');
    }

    try {
      this.logger.log(`Loading Excel: ${filePath}`);
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
    description: 'Truncate the consultation_procedures table before importing',
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
