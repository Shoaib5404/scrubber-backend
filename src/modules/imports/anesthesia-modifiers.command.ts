import { Logger } from '@nestjs/common';
import { Command, CommandRunner, Option } from 'nest-commander';
import { AnesthesiaModifiersImportService } from './anesthesia-modifiers.import.service';
import { assertReadableFile, resolveFilePath } from './import.utils';

interface AnesthesiaModifiersImportOptions {
  truncate?: boolean;
  chunk?: number;
}

@Command({
  name: 'anesthesia-modifiers:import',
  arguments: '[file]',
  description: 'Import anesthesia modifiers from CSV',
  argsDescription: {
    file: 'Path to CSV file (default: import/Anesthesia Modifiers.csv)',
  },
})
export class AnesthesiaModifiersImportCommand extends CommandRunner {
  private readonly logger = new Logger(AnesthesiaModifiersImportCommand.name);

  constructor(private readonly importService: AnesthesiaModifiersImportService) {
    super();
  }

  async run(
    passedParams: string[],
    options: AnesthesiaModifiersImportOptions,
  ): Promise<void> {
    const filePath = resolveFilePath(passedParams[0], 'import/Anesthesia Modifiers.csv');

    try {
      assertReadableFile(filePath);
    } catch {
      this.logger.error(`File not found or not readable: ${filePath}`);
      process.exitCode = 1;
      return;
    }

    if (options.truncate) {
      this.logger.warn('Truncating anesthesia_modifiers table...');
    }

    try {
      this.logger.log(`Importing from: ${filePath}`);
      const result = await this.importService.importFromFile(filePath, {
        truncate: options.truncate,
        chunk: options.chunk,
      });
      this.logger.log(`Upserted: ${result.upserted}`);
      this.logger.log(`Skipped (blank modifier): ${result.skipped}`);
    } catch (e) {
      this.logger.error(`Import failed: ${e instanceof Error ? e.message : String(e)}`);
      process.exitCode = 1;
    }
  }

  @Option({
    flags: '--truncate',
    description: 'Truncate anesthesia_modifiers table before import',
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
