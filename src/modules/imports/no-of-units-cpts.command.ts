import { existsSync } from 'fs';
import { Logger } from '@nestjs/common';
import { Command, CommandRunner, Option } from 'nest-commander';
import { resolveFilePath } from './import.utils';
import { NoOfUnitsCptsImportService } from './no-of-units-cpts.import.service';

interface NoOfUnitsCptsImportOptions {
  truncate?: boolean;
  chunk?: number;
}

@Command({
  name: 'no-of-units-cpts:import',
  arguments: '[file]',
  description: 'Import no-of-units CPT/HCPCS codes from CSV (HCPCS Code column)',
  argsDescription: {
    file: 'Path to CSV file (default: import/CPT libraries/No of Units.csv)',
  },
})
export class NoOfUnitsCptsImportCommand extends CommandRunner {
  private readonly logger = new Logger(NoOfUnitsCptsImportCommand.name);

  constructor(private readonly importService: NoOfUnitsCptsImportService) {
    super();
  }

  async run(passedParams: string[], options: NoOfUnitsCptsImportOptions): Promise<void> {
    const filePath = resolveFilePath(
      passedParams[0],
      'import/CPT libraries/No of Units.csv',
    );

    if (!existsSync(filePath)) {
      this.logger.error(`File not found: ${filePath}`);
      process.exitCode = 1;
      return;
    }

    try {
      if (options.truncate) {
        this.logger.log('Truncated no_of_units_cpts table.');
      }
      this.logger.log(`Loading CSV: ${filePath}`);
      const result = await this.importService.importFromFile(filePath, {
        truncate: options.truncate,
        chunk: options.chunk,
      });
      this.logger.log(`Upserted (unique CPT): ${result.upserted}`);
      this.logger.log(`Skipped (blank/invalid): ${result.skipped}`);
    } catch (e) {
      this.logger.error(`Import failed: ${e instanceof Error ? e.message : String(e)}`);
      process.exitCode = 1;
    }
  }

  @Option({
    flags: '--truncate',
    description: 'Truncate the no_of_units_cpts table before importing',
  })
  parseTruncate(): boolean {
    return true;
  }

  @Option({
    flags: '--chunk [chunk]',
    description: 'Number of records to process at a time',
    defaultValue: '500',
  })
  parseChunk(val: string): number {
    return Number(val);
  }
}
