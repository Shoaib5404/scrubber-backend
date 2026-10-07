import { Logger } from '@nestjs/common';
import { Command, CommandRunner, Option } from 'nest-commander';
import { assertReadableFile, resolveFilePath } from './import.utils';
import { ModifiersImportService } from './modifiers.import.service';

interface ModifiersImportOptions {
  chunk?: number;
  truncate?: boolean;
}

@Command({
  name: 'modifiers:import',
  arguments: '[file]',
  description: 'Import modifiers dataset from Excel',
  argsDescription: {
    file: 'Path to Excel file (default: import/Modifiers.xlsx)',
  },
})
export class ModifiersImportCommand extends CommandRunner {
  private readonly logger = new Logger(ModifiersImportCommand.name);

  constructor(private readonly importService: ModifiersImportService) {
    super();
  }

  async run(passedParams: string[], options: ModifiersImportOptions): Promise<void> {
    const filePath = resolveFilePath(passedParams[0], 'import/Modifiers.xlsx');

    try {
      assertReadableFile(filePath);
    } catch {
      this.logger.error(`File not found: ${filePath}`);
      process.exitCode = 1;
      return;
    }

    if (options.truncate) {
      this.logger.warn('Truncating modifiers table...');
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
    flags: '--chunk [chunk]',
    description: 'Number of rows per insert batch',
    defaultValue: '1000',
  })
  parseChunk(val: string): number {
    return Number(val);
  }

  @Option({
    flags: '--truncate',
    description: 'Truncate modifiers table before import',
  })
  parseTruncate(): boolean {
    return true;
  }
}
