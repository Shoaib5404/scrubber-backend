import { Logger } from '@nestjs/common';
import { Command, CommandRunner, Option } from 'nest-commander';
import { AnesthesiaCodesImportService } from './anesthesia-codes.import.service';
import { assertReadableFile, resolveFilePath } from './import.utils';

interface AnesthesiaCodesImportOptions {
  truncate?: boolean;
  chunk?: number;
}

@Command({
  name: 'anesthesia-codes:import',
  arguments: '[file]',
  description: 'Import anesthesia CPT codes and units from CSV',
  argsDescription: {
    file: 'Path to CSV file (default: import/Anesthesia Codes.csv)',
  },
})
export class AnesthesiaCodesImportCommand extends CommandRunner {
  private readonly logger = new Logger(AnesthesiaCodesImportCommand.name);

  constructor(private readonly importService: AnesthesiaCodesImportService) {
    super();
  }

  async run(passedParams: string[], options: AnesthesiaCodesImportOptions): Promise<void> {
    const filePath = resolveFilePath(passedParams[0], 'import/Anesthesia Codes.csv');

    try {
      assertReadableFile(filePath);
    } catch {
      this.logger.error(`File not found or not readable: ${filePath}`);
      process.exitCode = 1;
      return;
    }

    if (options.truncate) {
      this.logger.warn('Truncating anesthesia_codes table...');
    }

    try {
      this.logger.log(`Importing from: ${filePath}`);
      const result = await this.importService.importFromFile(filePath, {
        truncate: options.truncate,
        chunk: options.chunk,
      });
      this.logger.log(`Upserted: ${result.upserted}`);
      this.logger.log(`Skipped (blank cpt code or unit): ${result.skipped}`);
    } catch (e) {
      this.logger.error(`Import failed: ${e instanceof Error ? e.message : String(e)}`);
      process.exitCode = 1;
    }
  }

  @Option({
    flags: '--truncate',
    description: 'Truncate anesthesia_codes table before import',
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
