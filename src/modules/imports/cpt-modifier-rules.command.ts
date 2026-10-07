import { Logger } from '@nestjs/common';
import { Command, CommandRunner, Option } from 'nest-commander';
import { assertReadableFile, resolveFilePath } from './import.utils';
import { CptModifierRulesImportService } from './cpt-modifier-rules.import.service';

interface CptModifierRulesImportOptions {
  chunk?: number;
  merge?: boolean;
  fresh?: boolean;
}

@Command({
  name: 'cpt:import-modifier',
  arguments: '[file]',
  description: 'Import CPT-Modifier rules from cpt_to_modifier.xlsx',
  argsDescription: {
    file: 'Path to the Excel file (default: import/cpt_to_modifier.xlsx)',
  },
})
export class CptModifierRulesImportCommand extends CommandRunner {
  private readonly logger = new Logger(CptModifierRulesImportCommand.name);

  constructor(private readonly importService: CptModifierRulesImportService) {
    super();
  }

  async run(passedParams: string[], options: CptModifierRulesImportOptions): Promise<void> {
    const filePath = resolveFilePath(passedParams[0], 'import/cpt_to_modifier.xlsx');

    try {
      assertReadableFile(filePath);
    } catch {
      this.logger.error(`File not found: ${filePath}`);
      process.exitCode = 1;
      return;
    }

    if (options.fresh) {
      this.logger.warn('Truncating cpt_modifier_rules table before import...');
    }

    try {
      this.logger.log(`Streaming: ${filePath}`);
      const result = await this.importService.importFromFile(filePath, {
        truncate: options.fresh,
        chunk: options.chunk,
        merge: options.merge,
      });
      this.logger.log(`Imported (new): ${result.imported}`);
      this.logger.log(`Updated: ${result.updated}`);
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
    description: 'Rows per database batch',
    defaultValue: '1000',
  })
  parseChunk(val: string): number {
    return Number(val);
  }

  @Option({
    flags: '--merge',
    description: 'Update existing records instead of skipping duplicates',
  })
  parseMerge(): boolean {
    return true;
  }

  @Option({
    flags: '--fresh',
    description: 'Truncate existing rules before import',
  })
  parseFresh(): boolean {
    return true;
  }
}
