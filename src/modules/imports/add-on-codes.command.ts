import { Logger } from '@nestjs/common';
import { Command, CommandRunner, Option } from 'nest-commander';
import { assertReadableFile, resolveFilePath } from './import.utils';
import { AddOnCodesImportService } from './add-on-codes.import.service';

interface AddOnCodesImportOptions {
  truncate?: boolean;
  chunk?: number;
}

@Command({
  name: 'add-on-codes:import',
  arguments: '[file]',
  description: 'Import Add On Codes from the AOC Excel file into the add_on_codes table',
  argsDescription: {
    file: 'Path to the Excel file (default: import/AOC_V2026Q2-MCR.xlsx)',
  },
})
export class AddOnCodesImportCommand extends CommandRunner {
  private readonly logger = new Logger(AddOnCodesImportCommand.name);

  constructor(private readonly importService: AddOnCodesImportService) {
    super();
  }

  async run(passedParams: string[], options: AddOnCodesImportOptions): Promise<void> {
    const filePath = resolveFilePath(passedParams[0], 'import/AOC_V2026Q2-MCR.xlsx');

    try {
      assertReadableFile(filePath);
    } catch {
      this.logger.error(`File not found: ${filePath}`);
      process.exitCode = 1;
      return;
    }

    if (options.truncate) {
      this.logger.warn('Truncating add_on_codes table before import...');
    }

    try {
      this.logger.log(`Loading Excel file: ${filePath}`);
      const result = await this.importService.importFromFile(filePath, {
        truncate: options.truncate,
        chunk: options.chunk,
      });
      this.logger.log(`Imported (new rows): ${result.imported}`);
      this.logger.log(`Skipped (blank primary_code): ${result.skipped}`);
    } catch (e) {
      this.logger.error(`Import failed: ${e instanceof Error ? e.message : String(e)}`);
      process.exitCode = 1;
    }
  }

  @Option({
    flags: '--chunk [chunk]',
    description: 'Number of records to insert at a time',
    defaultValue: '1000',
  })
  parseChunk(val: string): number {
    return Number(val);
  }

  @Option({
    flags: '--truncate',
    description: 'Truncate add_on_codes table before import',
  })
  parseTruncate(): boolean {
    return true;
  }
}
