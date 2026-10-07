import { Logger } from '@nestjs/common';
import { Command, CommandRunner, Option } from 'nest-commander';
import { assertReadableFile, resolveFilePath } from './import.utils';
import { UhcPosCrosswalkImportService } from './uhc-pos-crosswalk.import.service';

interface UhcPosCrosswalkImportOptions {
  truncate?: boolean;
  chunk?: number;
}

@Command({
  name: 'uhc:import-pos-crosswalk',
  arguments: '[file]',
  description: 'Import UHC CPT to POS crosswalk records from an Excel or JSON file',
  argsDescription: {
    file: 'Path to Excel (.xlsx/.xls) or JSON file (default: import/UHC_POS_Crosswalk.xlsx)',
  },
})
export class UhcPosCrosswalkImportCommand extends CommandRunner {
  private readonly logger = new Logger(UhcPosCrosswalkImportCommand.name);

  constructor(private readonly importService: UhcPosCrosswalkImportService) {
    super();
  }

  async run(passedParams: string[], options: UhcPosCrosswalkImportOptions): Promise<void> {
    const filePath = resolveFilePath(passedParams[0], 'import/UHC_POS_Crosswalk.xlsx');

    try {
      assertReadableFile(filePath);
    } catch {
      this.logger.error(`File not found: ${filePath}`);
      process.exitCode = 1;
      return;
    }

    if (options.truncate) {
      this.logger.log('Truncated uhc_pos_crosswalk table.');
    }

    try {
      const result = await this.importService.importFromFile(filePath, {
        truncate: options.truncate,
        chunk: options.chunk,
      });
      this.logger.log(
        `Imported: ${result.imported}, Updated: ${result.updated}, Skipped: ${result.skipped}, Errors: ${result.errors}`,
      );
      if (result.errors > 0) {
        process.exitCode = 1;
      }
    } catch (e) {
      this.logger.error(`Import failed: ${e instanceof Error ? e.message : String(e)}`);
      process.exitCode = 1;
    }
  }

  @Option({
    flags: '--truncate',
    description: 'Truncate the uhc_pos_crosswalk table before importing',
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
