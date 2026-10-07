import { Logger } from '@nestjs/common';
import { Command, CommandRunner, Option } from 'nest-commander';
import { AnesthesiaCodesWithBillableModifiersImportService } from './anesthesia-codes-with-billable-modifiers.import.service';
import { assertReadableFile, resolveFilePath } from './import.utils';

interface AnesthesiaCodesWithBillableModifiersImportOptions {
  truncate?: boolean;
  chunk?: number;
}

@Command({
  name: 'anesthesia-codes-with-billable-modifiers:import',
  arguments: '[file]',
  description: 'Import anesthesia codes with billable modifiers from CSV',
  argsDescription: {
    file: 'Path to CSV file (default: import/Anesthesia Codes with Billable Modifier.csv)',
  },
})
export class AnesthesiaCodesWithBillableModifiersImportCommand extends CommandRunner {
  private readonly logger = new Logger(
    AnesthesiaCodesWithBillableModifiersImportCommand.name,
  );

  constructor(
    private readonly importService: AnesthesiaCodesWithBillableModifiersImportService,
  ) {
    super();
  }

  async run(
    passedParams: string[],
    options: AnesthesiaCodesWithBillableModifiersImportOptions,
  ): Promise<void> {
    const filePath = resolveFilePath(
      passedParams[0],
      'import/Anesthesia Codes with Billable Modifier.csv',
    );

    try {
      assertReadableFile(filePath);
    } catch {
      this.logger.error(`File not found or not readable: ${filePath}`);
      process.exitCode = 1;
      return;
    }

    if (options.truncate) {
      this.logger.warn('Truncating anesthesia_codes_with_billable_modifiers table...');
    }

    try {
      this.logger.log(`Importing from: ${filePath}`);
      const result = await this.importService.importFromFile(filePath, {
        truncate: options.truncate,
        chunk: options.chunk,
      });
      this.logger.log(`Upserted: ${result.upserted}`);
      this.logger.log(`Skipped (blank code or modifier): ${result.skipped}`);
    } catch (e) {
      this.logger.error(`Import failed: ${e instanceof Error ? e.message : String(e)}`);
      process.exitCode = 1;
    }
  }

  @Option({
    flags: '--truncate',
    description: 'Truncate anesthesia_codes_with_billable_modifiers table before import',
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
