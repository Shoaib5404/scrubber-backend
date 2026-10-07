import { Logger } from '@nestjs/common';
import { Command, CommandRunner, Option } from 'nest-commander';
import { assertReadableFile, resolveFilePath } from './import.utils';
import { TaxonomyCodesImportService } from './taxonomy-codes.import.service';

interface TaxonomyCodesImportOptions {
  truncate?: boolean;
  chunk?: number;
}

@Command({
  name: 'taxonomy:import-codes',
  arguments: '[file]',
  description: 'Import NUCC taxonomy codes from an Excel or JSON file',
  argsDescription: {
    file: 'Path to Excel (.xlsx/.xls) or JSON file (default: import/Taxonomy-Codes.xls)',
  },
})
export class TaxonomyCodesImportCommand extends CommandRunner {
  private readonly logger = new Logger(TaxonomyCodesImportCommand.name);

  constructor(private readonly importService: TaxonomyCodesImportService) {
    super();
  }

  async run(passedParams: string[], options: TaxonomyCodesImportOptions): Promise<void> {
    const filePath = resolveFilePath(passedParams[0], 'import/Taxonomy-Codes.xls');

    try {
      assertReadableFile(filePath);
    } catch {
      this.logger.error(`File not found: ${filePath}`);
      process.exitCode = 1;
      return;
    }

    if (options.truncate) {
      this.logger.log('Truncated taxonomy_codes table.');
    }

    try {
      const result = await this.importService.importFromFile(filePath, {
        truncate: options.truncate,
        chunk: options.chunk,
      });
      this.logger.log(`Upserted: ${result.upserted}, Skipped: ${result.skipped}, Invalid: ${result.invalid}`);
      if (result.invalid > 0) {
        process.exitCode = 1;
      }
    } catch (e) {
      this.logger.error(`Import failed: ${e instanceof Error ? e.message : String(e)}`);
      process.exitCode = 1;
    }
  }

  @Option({
    flags: '--truncate',
    description: 'Truncate the taxonomy_codes table before importing',
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
