import { Logger } from '@nestjs/common';
import { Command, CommandRunner, Option } from 'nest-commander';
import { assertReadableFile, resolveFilePath } from './import.utils';
import { CignaCptIcdCrosswalkImportService } from './cigna-cpt-icd-crosswalk.import.service';

interface CignaCptIcdCrosswalkImportOptions {
  truncate?: boolean;
  chunk?: number;
  noWarm?: boolean;
}

@Command({
  name: 'cigna:import-cpt-icd-crosswalk',
  arguments: '[file]',
  description: 'Import Cigna CPT to ICD-10 crosswalk from Excel (HCPCS + ICD sheets) or JSON',
  argsDescription: {
    file: 'Path to Excel (.xlsx/.xls) or JSON file (default: import/CPT-ICD-crosswalk-for-cigna.xlsx)',
  },
})
export class CignaCptIcdCrosswalkImportCommand extends CommandRunner {
  private readonly logger = new Logger(CignaCptIcdCrosswalkImportCommand.name);

  constructor(private readonly importService: CignaCptIcdCrosswalkImportService) {
    super();
  }

  async run(passedParams: string[], options: CignaCptIcdCrosswalkImportOptions): Promise<void> {
    const filePath = resolveFilePath(passedParams[0], 'import/CPT-ICD-crosswalk-for-cigna.xlsx');

    try {
      assertReadableFile(filePath);
    } catch {
      this.logger.error(`File not found: ${filePath}`);
      process.exitCode = 1;
      return;
    }

    try {
      const result = await this.importService.importFromFile(filePath, {
        truncate: options.truncate,
        chunk: options.chunk,
        noWarm: options.noWarm,
      });
      this.logger.log(
        `Imported: ${result.imported}, Updated: ${result.updated}, Skipped: ${result.skipped}, Errors: ${result.errors}`,
      );
      if (!options.noWarm && result.errors === 0) {
        this.logger.log('Lookup cache invalidated for cigna_cpt_icd_crosswalk.');
      }
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
    description: 'Truncate the cigna_cpt_icd_crosswalk table before importing',
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

  @Option({
    flags: '--no-warm',
    description: 'Skip rebuilding the lookup cache after import',
  })
  parseNoWarm(): boolean {
    return true;
  }
}
