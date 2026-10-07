import { Logger } from '@nestjs/common';
import { Command, CommandRunner, Option } from 'nest-commander';
import { assertReadableFile, resolveFilePath } from './import.utils';
import { NdcCodesImportService } from './ndc-codes.import.service';

interface NdcCodesImportOptions {
  truncate?: boolean;
  chunk?: number;
}

@Command({
  name: 'ndc:import-codes',
  arguments: '[file]',
  description: 'Import NDC package codes from an Excel or JSON file',
  argsDescription: {
    file: 'Path to Excel (.xlsx/.xls) or JSON file (default: import/NDC_code.xlsx)',
  },
})
export class NdcCodesImportCommand extends CommandRunner {
  private readonly logger = new Logger(NdcCodesImportCommand.name);

  constructor(private readonly importService: NdcCodesImportService) {
    super();
  }

  async run(passedParams: string[], options: NdcCodesImportOptions): Promise<void> {
    const filePath = resolveFilePath(passedParams[0], 'import/NDC_code.xlsx');

    try {
      assertReadableFile(filePath);
    } catch {
      this.logger.error(`File not found: ${filePath}`);
      process.exitCode = 1;
      return;
    }

    if (options.truncate) {
      this.logger.log('Truncated ndc_codes table.');
    }

    try {
      const result = await this.importService.importFromFile(filePath, {
        truncate: options.truncate,
        chunk: options.chunk,
      });
      this.logger.log(`Upserted: ${result.upserted}, Skipped: ${result.skipped}, Invalid NDC: ${result.invalidNdc}`);
      if (result.invalidNdc > 0) {
        process.exitCode = 1;
      }
    } catch (e) {
      this.logger.error(`Import failed: ${e instanceof Error ? e.message : String(e)}`);
      process.exitCode = 1;
    }
  }

  @Option({
    flags: '--truncate',
    description: 'Truncate the ndc_codes table before importing',
  })
  parseTruncate(): boolean {
    return true;
  }

  @Option({
    flags: '--chunk [chunk]',
    description: 'Number of records to process at a time',
    defaultValue: '1000',
  })
  parseChunk(val: string): number {
    return Number(val);
  }
}
