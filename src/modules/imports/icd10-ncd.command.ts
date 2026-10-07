import { Logger } from '@nestjs/common';
import { Command, CommandRunner, Option } from 'nest-commander';
import { assertReadableFile, resolveFilePath } from './import.utils';
import { Icd10NcdImportService } from './icd10-ncd.import.service';

interface Icd10NcdImportCommandOptions {
  headerRow?: number;
  chunk?: number;
  maxRange?: number;
  truncate?: boolean;
}

/** Laravel App\Console\Commands\ImportIcd10Ncd (icd10-ncd:import). */
@Command({
  name: 'icd10-ncd:import',
  arguments: '[file]',
  description:
    'Import CMS ICD10-NCD workbook into ncd_cpt and ncd_icd (carry-forward, merge consecutive ' +
    'CPT rows in column C, ICD ranges, @ starts new section; one ncd_cpt per ' +
    'section+NCD+desc+CPT — D/E carry does not split parents)',
  argsDescription: {
    file: 'Path to ICD10-NCD.xlsx (default: import/ICD10-NCD.xlsx)',
  },
})
export class Icd10NcdImportCommand extends CommandRunner {
  private readonly logger = new Logger(Icd10NcdImportCommand.name);

  constructor(private readonly importService: Icd10NcdImportService) {
    super();
  }

  async run(passedParams: string[], options: Icd10NcdImportCommandOptions): Promise<void> {
    const filePath = resolveFilePath(passedParams[0], 'import/ICD10-NCD.xlsx');

    try {
      assertReadableFile(filePath);
    } catch {
      this.logger.error(`File not found or not readable: ${filePath}`);
      process.exitCode = 1;
      return;
    }

    if (options.truncate) {
      this.logger.warn('Truncating ncd_icd and ncd_cpt...');
    }

    try {
      this.logger.log(`Loading: ${filePath}`);
      const stats = await this.importService.importFromFile(filePath, {
        headerRow: options.headerRow,
        chunk: options.chunk,
        maxRange: options.maxRange,
        truncate: options.truncate,
      });

      this.logger.log('Import completed.');
      this.logger.log(`rows read: ${stats.rowsRead}`);
      this.logger.log(`icd inserted: ${stats.icdInserted}`);
      this.logger.log(`cpt inserted: ${stats.cptInserted}`);
      this.logger.log(`skipped no icd: ${stats.skippedNoIcd}`);
      this.logger.log(`skipped no cpt: ${stats.skippedNoCpt}`);
      this.logger.log(`desc truncated: ${stats.descTruncated}`);
      this.logger.log(`icd codes from ranges: ${stats.icdCodesFromRanges}`);
      this.logger.log(`skipped icd markers: ${stats.skippedIcdMarkers}`);

      if (stats.descTruncated > 0) {
        this.logger.warn(
          'Some NCD descriptions were truncated to 255 characters (ncd_cpt.ncd_description).',
        );
      }

      // Laravel also calls RedisHelper::flushGroup('ncd_icd10') here. That Redis group isn't
      // one of the Nest LookupCacheService-managed tables (see LOOKUP_CACHE_TABLE_NAMES), so it
      // isn't wired through Icd10NcdImportService — run `redis:flush ncd_icd10` separately
      // (generic SCAN+DEL via RedisFlushCommand) if that cache group needs clearing too.
      this.logger.log(
        "Note: run 'redis:flush ncd_icd10' separately to clear that cache group " +
          '(not covered by LookupCacheService.syncTables).',
      );
    } catch (e) {
      this.logger.error(`Import failed: ${e instanceof Error ? e.message : String(e)}`);
      process.exitCode = 1;
    }
  }

  @Option({
    flags: '--header-row [headerRow]',
    description: 'Last header row number (data starts next row)',
    defaultValue: '7',
  })
  parseHeaderRow(val: string): number {
    return Number(val);
  }

  @Option({
    flags: '--chunk [chunk]',
    description: 'ICD rows per insert batch (minimum 50)',
    defaultValue: '500',
  })
  parseChunk(val: string): number {
    return Number(val);
  }

  @Option({
    flags: '--max-range [maxRange]',
    description: 'Max codes to expand per range (e.g. A4150-A4153)',
    defaultValue: '2000',
  })
  parseMaxRange(val: string): number {
    return Number(val);
  }

  @Option({
    flags: '--truncate',
    description: 'Truncate ncd_icd and ncd_cpt before import',
  })
  parseTruncate(): boolean {
    return true;
  }
}
