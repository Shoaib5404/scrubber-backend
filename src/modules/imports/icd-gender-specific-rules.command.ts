import { Logger } from '@nestjs/common';
import { Command, CommandRunner, Option } from 'nest-commander';
import { assertReadableFile, resolveFilePath } from './import.utils';
import { IcdGenderSpecificRulesImportService } from './icd-gender-specific-rules.import.service';

interface IcdGenderSpecificImportOptions {
  truncate?: boolean;
  chunk?: number;
}

@Command({
  name: 'icd:import-gender',
  arguments: '[file]',
  description: 'Import ICD gender-specific rules from Excel',
  argsDescription: {
    file: 'Path to the Excel file (default: import/ICD-Gender-Specific.xlsx)',
  },
})
export class IcdGenderSpecificRulesImportCommand extends CommandRunner {
  private readonly logger = new Logger(IcdGenderSpecificRulesImportCommand.name);

  constructor(private readonly importService: IcdGenderSpecificRulesImportService) {
    super();
  }

  async run(passedParams: string[], options: IcdGenderSpecificImportOptions): Promise<void> {
    const filePath = resolveFilePath(passedParams[0], 'import/ICD-Gender-Specific.xlsx');

    try {
      assertReadableFile(filePath);
    } catch {
      this.logger.error(`File not found: ${filePath}`);
      process.exitCode = 1;
      return;
    }

    if (options.truncate) {
      this.logger.warn('Truncating icd_gender_specific_rules table...');
    }

    try {
      this.logger.log(`Importing from: ${filePath}`);
      const result = await this.importService.importFromFile(filePath, {
        truncate: options.truncate,
        chunk: options.chunk,
      });
      this.logger.log(`Upserted: ${result.upserted}`);
      this.logger.log(`Skipped (blank ICD): ${result.skipped}`);
    } catch (e) {
      this.logger.error(`Import failed: ${e instanceof Error ? e.message : String(e)}`);
      process.exitCode = 1;
    }
  }

  @Option({
    flags: '--truncate',
    description: 'Truncate table before import',
  })
  parseTruncate(): boolean {
    return true;
  }

  @Option({
    flags: '--chunk [chunk]',
    description: 'Number of records to process per insert batch',
    defaultValue: '1000',
  })
  parseChunk(val: string): number {
    return Number(val);
  }
}
