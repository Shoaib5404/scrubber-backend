import { Logger } from '@nestjs/common';
import { Command, CommandRunner, Option } from 'nest-commander';
import { assertReadableFile, resolveFilePath } from './import.utils';
import { AgeSpecificIcdRulesImportService } from './age-specific-icd-rules.import.service';

interface AgeSpecificIcdImportOptions {
  truncate?: boolean;
  chunk?: number;
}

@Command({
  name: 'icd:import-age',
  arguments: '[file]',
  description: 'Import age-specific ICD rules from an Excel or JSON file',
  argsDescription: {
    file: 'Path to Excel (.xlsx/.xls) or JSON file (default: import/Age Specific ICDs.xlsx)',
  },
})
export class AgeSpecificIcdRulesImportCommand extends CommandRunner {
  private readonly logger = new Logger(AgeSpecificIcdRulesImportCommand.name);

  constructor(private readonly importService: AgeSpecificIcdRulesImportService) {
    super();
  }

  async run(passedParams: string[], options: AgeSpecificIcdImportOptions): Promise<void> {
    const filePath = resolveFilePath(passedParams[0], 'import/Age Specific ICDs.xlsx');

    try {
      assertReadableFile(filePath);
    } catch {
      this.logger.error(`File not found: ${filePath}`);
      process.exitCode = 1;
      return;
    }

    if (options.truncate) {
      this.logger.warn('Truncating age_specific_icd_rules table...');
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
    description: 'Truncate the age_specific_icd_rules table before importing',
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
