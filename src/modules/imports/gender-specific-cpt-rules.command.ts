import { Logger } from '@nestjs/common';
import { Command, CommandRunner, Option } from 'nest-commander';
import { assertReadableFile, resolveFilePath } from './import.utils';
import { GenderSpecificCptRulesImportService } from './gender-specific-cpt-rules.import.service';

interface GenderSpecificCptImportOptions {
  chunk?: number;
}

@Command({
  name: 'cpt:import-gender',
  arguments: '[file]',
  description: 'Import gender-specific CPT rules from an Excel file',
  argsDescription: {
    file: 'Path to the Excel file (default: import/gender-specific-cpts.xlsx)',
  },
})
export class GenderSpecificCptRulesImportCommand extends CommandRunner {
  private readonly logger = new Logger(GenderSpecificCptRulesImportCommand.name);

  constructor(private readonly importService: GenderSpecificCptRulesImportService) {
    super();
  }

  async run(passedParams: string[], options: GenderSpecificCptImportOptions): Promise<void> {
    const filePath = resolveFilePath(passedParams[0], 'import/gender-specific-cpts.xlsx');

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
      this.logger.log(`Skipped (empty): ${result.skipped}`);
    } catch (e) {
      this.logger.error(`Import failed: ${e instanceof Error ? e.message : String(e)}`);
      process.exitCode = 1;
    }
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
