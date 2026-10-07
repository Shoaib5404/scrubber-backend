import { Logger } from '@nestjs/common';
import { Command, CommandRunner, Option } from 'nest-commander';
import { assertReadableFile, resolveFilePath } from './import.utils';
import { Mue87726Uhc06111OxfordImportService } from './mue-87726-uhc-06111-oxford.import.service';

interface Mue87726ImportOptions {
  truncate?: boolean;
  chunk?: number;
}

@Command({
  name: 'mue-87726-uhc-06111-oxford:import',
  arguments: '[file]',
  description: 'Import MUE values for 87726 and 06111 (UHC/Oxford) from CSV',
  argsDescription: {
    file: 'Path to CSV file (default: import/MUE FOR 87726 and 06111.csv)',
  },
})
export class Mue87726Uhc06111OxfordImportCommand extends CommandRunner {
  private readonly logger = new Logger(Mue87726Uhc06111OxfordImportCommand.name);

  constructor(private readonly importService: Mue87726Uhc06111OxfordImportService) {
    super();
  }

  async run(passedParams: string[], options: Mue87726ImportOptions): Promise<void> {
    const filePath = resolveFilePath(
      passedParams[0],
      'import/MUE FOR 87726 and 06111.csv',
    );

    try {
      assertReadableFile(filePath);
    } catch {
      this.logger.error(`File not found or not readable: ${filePath}`);
      process.exitCode = 1;
      return;
    }

    if (options.truncate) {
      this.logger.warn('Truncating mue_87726_uhc_06111_oxford table...');
    }

    try {
      this.logger.log(`Importing from: ${filePath}`);
      const result = await this.importService.importFromFile(filePath, {
        truncate: options.truncate,
        chunk: options.chunk,
      });
      this.logger.log(`Upserted: ${result.upserted}`);
      this.logger.log(`Skipped (blank or invalid row): ${result.skipped}`);
    } catch (e) {
      this.logger.error(`Import failed: ${e instanceof Error ? e.message : String(e)}`);
      process.exitCode = 1;
    }
  }

  @Option({
    flags: '--truncate',
    description: 'Truncate mue_87726_uhc_06111_oxford table before import',
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
