import { Logger } from '@nestjs/common';
import { Command, CommandRunner, Option } from 'nest-commander';
import { assertReadableFile, resolveFilePath } from '../import.utils';
import {
  Icd10TabularImportService,
  parseIcd10TabularEffectiveDate,
} from './icd10-tabular.import.service';

interface Icd10TabularImportCommandOptions {
  effectiveDate?: Date;
  truncate?: boolean;
  dryRun?: boolean;
  updateChapterCodeRanges?: boolean;
}

const DEFAULT_FILE_PATH = 'import/ICD 10 tabular/ICD 10 Tabular.xml';

/** Laravel App\Console\Commands\ImportIcd10Tabular (icd10:tabular-import). */
@Command({
  name: 'icd10:tabular-import',
  arguments: '[file]',
  description:
    'Import CMS ICD-10-CM tabular XML (incl. codeAlso notes) into icd10_tabular_codes and ' +
    'icd10_tabular_code_descriptions',
  argsDescription: {
    file: 'Path to ICD 10 Tabular.xml (default: import/ICD 10 tabular/ICD 10 Tabular.xml)',
  },
})
export class Icd10TabularImportCommand extends CommandRunner {
  private readonly logger = new Logger(Icd10TabularImportCommand.name);

  constructor(private readonly importService: Icd10TabularImportService) {
    super();
  }

  async run(passedParams: string[], options: Icd10TabularImportCommandOptions): Promise<void> {
    // Laravel handle() resolves --update-chapter-code-ranges before touching the file argument.
    if (options.updateChapterCodeRanges) {
      try {
        const result = await this.importService.updateChapterCodeRanges();
        this.logger.log(`Updated ${result.updated} chapter code range record(s).`);
      } catch (e) {
        this.logger.error(
          `Update chapter code ranges failed: ${e instanceof Error ? e.message : String(e)}`,
        );
        process.exitCode = 1;
      }
      return;
    }

    const filePath = resolveFilePath(passedParams[0], DEFAULT_FILE_PATH);

    try {
      assertReadableFile(filePath);
    } catch {
      this.logger.error(`File not found or not readable: ${filePath}`);
      process.exitCode = 1;
      return;
    }

    if (options.truncate) {
      this.logger.warn('Truncating icd10_tabular_code_descriptions and icd10_tabular_codes...');
    }

    try {
      this.logger.log(`Parsing: ${filePath}`);
      const stats = await this.importService.importFromFile(filePath, {
        effectiveDate: options.effectiveDate,
        truncate: options.truncate,
        dryRun: options.dryRun,
      });

      this.logger.log(
        `Chapters: ${stats.chapterCount}, sections: ${stats.sectionCount}, diagnosis nodes ` +
          `(incl. synthetic): ${stats.diagnosisNodeCount}`,
      );

      if (options.dryRun) {
        this.logger.log('Dry run: no database writes.');
        return;
      }

      this.logger.log(`Import finished. Rows written: ${stats.written}`);
    } catch (e) {
      this.logger.error(`Import failed: ${e instanceof Error ? e.message : String(e)}`);
      process.exitCode = 1;
    }
  }

  @Option({
    flags: '--effective-date [effectiveDate]',
    description: 'Effective start date (Y-m-d); defaults to today (UTC)',
  })
  parseEffectiveDate(val: string): Date {
    return parseIcd10TabularEffectiveDate(val);
  }

  @Option({
    flags: '--truncate',
    description: 'Truncate icd10_tabular_code_descriptions and icd10_tabular_codes before import',
  })
  parseTruncate(): boolean {
    return true;
  }

  @Option({
    flags: '--dry-run',
    description: 'Parse XML only; do not write to the database',
  })
  parseDryRun(): boolean {
    return true;
  }

  @Option({
    flags: '--update-chapter-code-ranges',
    description: 'Update chapter codes from abbreviations to ICD-10 code ranges',
  })
  parseUpdateChapterCodeRanges(): boolean {
    return true;
  }
}
