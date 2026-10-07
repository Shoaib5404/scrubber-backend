import { Logger } from '@nestjs/common';
import { Command, CommandRunner, Option } from 'nest-commander';
import { assertReadableFile, parseCptImportDelimiter, resolveFilePath } from './import.utils';
import { CptCodesImportService } from './cpt-codes.import.service';

interface CptCodesImportOptions {
  chunk?: number;
  merge?: boolean;
  delimiter?: string;
  skipHeader?: boolean;
  truncate?: boolean;
}

@Command({
  name: 'cpt:import',
  arguments: '[file]',
  description: 'Import CPT codes from an Excel (.xlsx) or text (.txt) file',
  argsDescription: {
    file: 'Path to the Excel or text file (default: import/cpt_codes.xlsx)',
  },
})
export class CptCodesImportCommand extends CommandRunner {
  private readonly logger = new Logger(CptCodesImportCommand.name);

  constructor(private readonly importService: CptCodesImportService) {
    super();
  }

  async run(passedParams: string[], options: CptCodesImportOptions): Promise<void> {
    const filePath = resolveFilePath(passedParams[0], 'import/cpt_codes.xlsx');

    try {
      assertReadableFile(filePath);
    } catch {
      this.logger.error(`File not found: ${filePath}`);
      process.exitCode = 1;
      return;
    }

    if (options.truncate) {
      this.logger.warn('Truncating cpt_codes table before import...');
    }

    try {
      this.logger.log(`Loading file: ${filePath}`);
      const result = await this.importService.importFromFile(filePath, {
        truncate: options.truncate,
        chunk: options.chunk,
        merge: options.merge,
        delimiter: parseCptImportDelimiter(options.delimiter),
        skipHeader: options.skipHeader,
      });
      this.logger.log(`Imported (new): ${result.imported}`);
      this.logger.log(`Updated (existing): ${result.updated}`);
      this.logger.log(`Skipped: ${result.skipped}`);
      this.logger.log(`Errors: ${result.errors}`);
      if (result.errors > 0) {
        process.exitCode = 1;
      }
    } catch (e) {
      this.logger.error(`Import failed: ${e instanceof Error ? e.message : String(e)}`);
      process.exitCode = 1;
    }
  }

  @Option({
    flags: '--chunk [chunk]',
    description: 'Number of records to process at a time',
    defaultValue: '1000',
  })
  parseChunk(val: string): number {
    return Number(val);
  }

  @Option({
    flags: '--merge',
    description: 'Merge with existing records (update if exists)',
  })
  parseMerge(): boolean {
    return true;
  }

  @Option({
    flags: '--delimiter [delimiter]',
    description: 'For text/CSV: comma (,) or tab (tab). Default: space-separated',
  })
  parseDelimiter(val: string): string {
    return val;
  }

  @Option({
    flags: '--skip-header',
    description: 'Skip first line of text/CSV file (header row)',
  })
  parseSkipHeader(): boolean {
    return true;
  }

  @Option({
    flags: '--truncate',
    description: 'Truncate the cpt_codes table before import',
  })
  parseTruncate(): boolean {
    return true;
  }
}
