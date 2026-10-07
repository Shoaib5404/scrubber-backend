import { Logger } from '@nestjs/common';
import { Command, CommandRunner, Option } from 'nest-commander';
import { assertReadableFile, resolveFilePath } from './import.utils';
import { RadiologyCptCodesImportService } from './radiology-cpt-codes.import.service';

interface RadiologyCptCodesImportOptions {
  truncate?: boolean;
  chunk?: number;
}

@Command({
  name: 'radiology-cpt-codes:import',
  arguments: '[file]',
  description: 'Import radiology CPT codes from CSV',
  argsDescription: {
    file: 'Path to CSV file (default: import/CPT libraries/Radiology Rule.csv)',
  },
})
export class RadiologyCptCodesImportCommand extends CommandRunner {
  private readonly logger = new Logger(RadiologyCptCodesImportCommand.name);

  constructor(private readonly importService: RadiologyCptCodesImportService) {
    super();
  }

  async run(passedParams: string[], options: RadiologyCptCodesImportOptions): Promise<void> {
    const filePath = resolveFilePath(
      passedParams[0],
      'import/CPT libraries/Radiology Rule.csv',
    );

    try {
      assertReadableFile(filePath);
    } catch {
      this.logger.error(`File not found or not readable: ${filePath}`);
      process.exitCode = 1;
      return;
    }

    if (options.truncate) {
      this.logger.warn('Truncating radiology_cpt_codes table...');
    }

    try {
      this.logger.log(`Importing from: ${filePath}`);
      const result = await this.importService.importFromFile(filePath, {
        truncate: options.truncate,
        chunk: options.chunk,
      });
      this.logger.log(`Upserted: ${result.upserted}`);
      this.logger.log(`Skipped (blank, header, or invalid CPT): ${result.skipped}`);
    } catch (e) {
      this.logger.error(`Import failed: ${e instanceof Error ? e.message : String(e)}`);
      process.exitCode = 1;
    }
  }

  @Option({
    flags: '--truncate',
    description: 'Truncate radiology_cpt_codes table before import',
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
