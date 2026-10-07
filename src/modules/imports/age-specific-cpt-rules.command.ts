import { Logger } from '@nestjs/common';
import { Command, CommandRunner, Option } from 'nest-commander';
import { assertReadableFile, resolveFilePath } from './import.utils';
import { AgeSpecificCptRulesImportService } from './age-specific-cpt-rules.import.service';

interface AgeSpecificCptImportOptions {
  chunk?: number;
}

@Command({
  name: 'cpt:import-age',
  arguments: '[file]',
  description: 'Import age-specific CPT rules from an Excel or JSON file',
  argsDescription: {
    file: 'Path to Excel (.xlsx/.xls) or JSON file (default: import/age-specific-cpts.xlsx)',
  },
})
export class AgeSpecificCptRulesImportCommand extends CommandRunner {
  private readonly logger = new Logger(AgeSpecificCptRulesImportCommand.name);

  constructor(private readonly importService: AgeSpecificCptRulesImportService) {
    super();
  }

  async run(passedParams: string[], options: AgeSpecificCptImportOptions): Promise<void> {
    const filePath = resolveFilePath(passedParams[0], 'import/age-specific-cpts.xlsx');

    try {
      assertReadableFile(filePath);
    } catch {
      this.logger.error(`File not found: ${filePath}`);
      process.exitCode = 1;
      return;
    }

    try {
      this.logger.log(`Importing from: ${filePath}`);
      const result = await this.importService.importFromFile(filePath, {
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
    flags: '--chunk [chunk]',
    description: 'Number of records to process at a time (Excel only)',
    defaultValue: '500',
  })
  parseChunk(val: string): number {
    return Number(val);
  }
}
