import { Logger } from '@nestjs/common';
import { Command, CommandRunner, Option } from 'nest-commander';
import { assertReadableFile, resolveFilePath } from './import.utils';
import { NcdOtherLabCodesImportService } from './ncd-other-lab-codes.import.service';

interface NcdOtherLabCodesImportOptions {
  chunk?: number;
  truncate?: boolean;
}

@Command({
  name: 'ncd-other-lab:import-codes',
  arguments: '[file]',
  description: 'Import NCD Other Lab CPT x ICD crosswalk (each CPT linked to every ICD from the workbook)',
  argsDescription: {
    file: 'Path to the Excel file (default: import/CPT libraries/NCD Other Lab 1.xls)',
  },
})
export class NcdOtherLabCodesImportCommand extends CommandRunner {
  private readonly logger = new Logger(NcdOtherLabCodesImportCommand.name);

  constructor(private readonly importService: NcdOtherLabCodesImportService) {
    super();
  }

  async run(passedParams: string[], options: NcdOtherLabCodesImportOptions): Promise<void> {
    const filePath = resolveFilePath(passedParams[0], 'import/CPT libraries/NCD Other Lab 1.xls');

    try {
      assertReadableFile(filePath);
    } catch {
      this.logger.error(`File not found or not readable: ${filePath}`);
      process.exitCode = 1;
      return;
    }

    if (options.truncate) {
      this.logger.warn('Truncating ncd_other_lab_codes...');
    }

    try {
      this.logger.log(`Loading: ${filePath}`);
      const result = await this.importService.importFromFile(filePath, {
        truncate: options.truncate,
        chunk: options.chunk,
      });
      this.logger.log(`CPT codes: ${result.cptCodeCount}`);
      this.logger.log(`ICD codes: ${result.icdCodeCount}`);
      this.logger.log(`Expected crosswalk rows: ${result.expectedTotal}`);
      this.logger.log(`Rows upserted: ${result.imported}`);
      this.logger.log(`Table total: ${result.tableTotal}`);
    } catch (e) {
      this.logger.error(`Import failed: ${e instanceof Error ? e.message : String(e)}`);
      process.exitCode = 1;
    }
  }

  @Option({
    flags: '--chunk [chunk]',
    description: 'Rows per insert/upsert batch',
    defaultValue: '1000',
  })
  parseChunk(val: string): number {
    return Number(val);
  }

  @Option({
    flags: '--truncate',
    description: 'Delete all rows before import',
  })
  parseTruncate(): boolean {
    return true;
  }
}
