import { Logger } from '@nestjs/common';
import { Command, CommandRunner, Option } from 'nest-commander';
import { ICodesImportService } from './i-codes.import.service';
import { assertReadableFile, resolveFilePath } from './import.utils';

interface ICodesImportOptions {
  truncate?: boolean;
  chunk?: number;
}

@Command({
  name: 'i-codes:import',
  arguments: '[file]',
  description: 'Import I codes (HCPCS) and descriptions from CSV',
  argsDescription: {
    file: 'Path to CSV file (default: import/CPT libraries/I Codes List.csv)',
  },
})
export class ICodesImportCommand extends CommandRunner {
  private readonly logger = new Logger(ICodesImportCommand.name);

  constructor(private readonly importService: ICodesImportService) {
    super();
  }

  async run(passedParams: string[], options: ICodesImportOptions): Promise<void> {
    const filePath = resolveFilePath(
      passedParams[0],
      'import/CPT libraries/I Codes List.csv',
    );

    try {
      assertReadableFile(filePath);
    } catch {
      this.logger.error(`File not found or not readable: ${filePath}`);
      process.exitCode = 1;
      return;
    }

    if (options.truncate) {
      this.logger.warn('Truncating i_codes table...');
    }

    try {
      this.logger.log(`Importing from: ${filePath}`);
      const result = await this.importService.importFromFile(filePath, {
        truncate: options.truncate,
        chunk: options.chunk,
      });
      this.logger.log(`Upserted: ${result.upserted}`);
      this.logger.log(`Skipped (blank hcpcs): ${result.skipped}`);
    } catch (e) {
      this.logger.error(`Import failed: ${e instanceof Error ? e.message : String(e)}`);
      process.exitCode = 1;
    }
  }

  @Option({
    flags: '--truncate',
    description: 'Truncate i_codes table before import',
  })
  parseTruncate(): boolean {
    return true;
  }

  @Option({
    flags: '--chunk [chunk]',
    description: 'Number of rows per insert batch',
    defaultValue: '1000',
  })
  parseChunk(val: string): number {
    return Number(val);
  }
}
