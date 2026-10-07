import { Logger } from '@nestjs/common';
import { Command, CommandRunner, Option } from 'nest-commander';
import { assertReadableFile, resolveFilePath } from './import.utils';
import { ZipCodesImportService } from './zip-codes.import.service';

interface ZipCodesImportOptions {
  truncate?: boolean;
  chunk?: number;
}

@Command({
  name: 'zip:import-codes',
  arguments: '[file]',
  description:
    'Import ZIP codes from zip-code-library.xlsx (or CSV). Maps vZIPCode, ZIPCodeType, vCity, vStateName, vState.',
  argsDescription: {
    file: 'Path to Excel (.xlsx) or CSV (default: import/zip-code-library.xlsx)',
  },
})
export class ZipCodesImportCommand extends CommandRunner {
  private readonly logger = new Logger(ZipCodesImportCommand.name);

  constructor(private readonly importService: ZipCodesImportService) {
    super();
  }

  async run(passedParams: string[], options: ZipCodesImportOptions): Promise<void> {
    const filePath = resolveFilePath(passedParams[0], 'import/zip-code-library.xlsx');

    try {
      assertReadableFile(filePath);
    } catch {
      this.logger.error(`File not found or not readable: ${filePath}`);
      process.exitCode = 1;
      return;
    }

    if (options.truncate) {
      this.logger.log('Truncated zip_codes table.');
    }

    try {
      this.logger.log(`Importing from ${filePath}`);
      const result = await this.importService.importFromFile(filePath, {
        truncate: options.truncate,
        chunk: options.chunk,
      });
      this.logger.log(`Upserted: ${result.imported}, Skipped: ${result.skipped}`);
    } catch (e) {
      this.logger.error(`Import failed: ${e instanceof Error ? e.message : String(e)}`);
      process.exitCode = 1;
    }
  }

  @Option({
    flags: '--truncate',
    description: 'Truncate zip_codes before importing',
  })
  parseTruncate(): boolean {
    return true;
  }

  @Option({
    flags: '--chunk [chunk]',
    description: 'Number of records to upsert per batch',
    defaultValue: '1000',
  })
  parseChunk(val: string): number {
    return Number(val);
  }
}
