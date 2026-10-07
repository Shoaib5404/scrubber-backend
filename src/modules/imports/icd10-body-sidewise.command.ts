import { Logger } from '@nestjs/common';
import { Command, CommandRunner, Option } from 'nest-commander';
import { assertReadableFile, resolveFilePath } from './import.utils';
import { Icd10BodySidewiseImportService } from './icd10-body-sidewise.import.service';

interface Icd10BodySidewiseImportOptions {
  truncate?: boolean;
  chunk?: number;
}

@Command({
  name: 'icd10-body-sidewise:import',
  arguments: '[file]',
  description: 'Import ICD10 body side-wise data from Excel into icd10_body_sidewise table',
  argsDescription: {
    file: 'Path to Excel file (default: import/ICD10-body-sidewise.xlsx)',
  },
})
export class Icd10BodySidewiseImportCommand extends CommandRunner {
  private readonly logger = new Logger(Icd10BodySidewiseImportCommand.name);

  constructor(private readonly importService: Icd10BodySidewiseImportService) {
    super();
  }

  async run(passedParams: string[], options: Icd10BodySidewiseImportOptions): Promise<void> {
    const filePath = resolveFilePath(passedParams[0], 'import/ICD10-body-sidewise.xlsx');

    try {
      assertReadableFile(filePath);
    } catch {
      this.logger.error(`File not found: ${filePath}`);
      process.exitCode = 1;
      return;
    }

    if (options.truncate) {
      this.logger.warn('Truncating icd10_body_sidewise table...');
    }

    try {
      this.logger.log(`Importing from: ${filePath}`);
      const result = await this.importService.importFromFile(filePath, {
        truncate: options.truncate,
        chunk: options.chunk,
      });
      this.logger.log(`Imported: ${result.imported}`);
      this.logger.log(`Skipped (blank code): ${result.skipped}`);
    } catch (e) {
      this.logger.error(`Import failed: ${e instanceof Error ? e.message : String(e)}`);
      process.exitCode = 1;
    }
  }

  @Option({
    flags: '--chunk [chunk]',
    description: 'Number of records inserted per batch',
    defaultValue: '1000',
  })
  parseChunk(val: string): number {
    return Number(val);
  }

  @Option({
    flags: '--truncate',
    description: 'Truncate table before import',
  })
  parseTruncate(): boolean {
    return true;
  }
}
