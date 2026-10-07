import { Logger } from '@nestjs/common';
import { Command, CommandRunner, Option } from 'nest-commander';
import { assertReadableFile, resolveFilePath } from './import.utils';
import { ModifierSequencesImportService } from './modifier-sequences.import.service';

interface ModifierSequencesImportOptions {
  truncate?: boolean;
  chunk?: number;
}

@Command({
  name: 'modifiers:import-sequence',
  arguments: '[file]',
  description: 'Import modifier sequence rules from an Excel or JSON file',
  argsDescription: {
    file: 'Path to Excel (.xlsx/.xls) or JSON file (default: import/MODIFIERS_SEQUENCE.xlsx)',
  },
})
export class ModifierSequencesImportCommand extends CommandRunner {
  private readonly logger = new Logger(ModifierSequencesImportCommand.name);

  constructor(private readonly importService: ModifierSequencesImportService) {
    super();
  }

  async run(passedParams: string[], options: ModifierSequencesImportOptions): Promise<void> {
    const filePath = resolveFilePath(passedParams[0], 'import/MODIFIERS_SEQUENCE.xlsx');

    try {
      assertReadableFile(filePath);
    } catch {
      this.logger.error(`File not found: ${filePath}`);
      process.exitCode = 1;
      return;
    }

    if (options.truncate) {
      this.logger.warn('Truncating modifier_sequences table...');
    }

    try {
      this.logger.log(`Importing from: ${filePath}`);
      const result = await this.importService.importFromFile(filePath, {
        truncate: options.truncate,
        chunk: options.chunk,
      });
      this.logger.log(`Upserted: ${result.upserted}`);
      this.logger.log(`Skipped: ${result.skipped}`);
    } catch (e) {
      this.logger.error(`Import failed: ${e instanceof Error ? e.message : String(e)}`);
      process.exitCode = 1;
    }
  }

  @Option({
    flags: '--truncate',
    description: 'Truncate the modifier_sequences table before importing',
  })
  parseTruncate(): boolean {
    return true;
  }

  @Option({
    flags: '--chunk [chunk]',
    description: 'Number of records to process at a time (Excel only)',
    defaultValue: '500',
  })
  parseChunk(val: string): number {
    return Number(val);
  }
}
