import { Logger } from '@nestjs/common';
import { Command, CommandRunner, Option } from 'nest-commander';
import { assertReadableFile, resolveFilePath } from './import.utils';
import { AetnaB12LcdImportService } from './aetna-b12-lcd.import.service';

interface AetnaB12LcdImportOptions {
  cpt?: string;
  chunk?: number;
  truncate?: boolean;
  dryRun?: boolean;
}

@Command({
  name: 'aetna-b12-lcd:import',
  arguments: '[file]',
  description: 'Import Aetna B12 LCD CPT-to-ICD crosswalk (expand ICD ranges into individual rows)',
  argsDescription: {
    file: 'Path to Excel (.xlsx/.xls) or ICD CSV (default: import/AETNA B12 LCD.xlsx)',
  },
})
export class AetnaB12LcdImportCommand extends CommandRunner {
  private readonly logger = new Logger(AetnaB12LcdImportCommand.name);

  constructor(private readonly importService: AetnaB12LcdImportService) {
    super();
  }

  async run(passedParams: string[], options: AetnaB12LcdImportOptions): Promise<void> {
    const filePath = resolveFilePath(passedParams[0], 'import/AETNA B12 LCD.xlsx');

    try {
      assertReadableFile(filePath);
    } catch {
      this.logger.error(`File not found or not readable: ${filePath}`);
      process.exitCode = 1;
      return;
    }

    try {
      const result = await this.importService.importFromFile(filePath, {
        truncate: options.truncate,
        chunk: options.chunk,
        dryRun: options.dryRun,
        cpt: options.cpt,
      });
      this.logger.log(`CPT codes: ${result.cptCodeCount}`);
      this.logger.log(`Source ICD rows: ${result.sourceIcdRowCount}`);
      this.logger.log(`Expanded ICD codes: ${result.expandedIcdCount}`);
      this.logger.log(`Crosswalk rows (CPT x ICD): ${result.crosswalkRowCount}`);
      if (result.dryRun) {
        this.logger.log('Dry run complete. No database changes made.');
      } else {
        this.logger.log(`Upserted ${result.imported} crosswalk rows.`);
      }
    } catch (e) {
      this.logger.error(`Import failed: ${e instanceof Error ? e.message : String(e)}`);
      process.exitCode = 1;
    }
  }

  @Option({
    flags: '--cpt [cpt]',
    description: 'Comma-separated CPT codes (required for CSV when CPT sheet is not available)',
  })
  parseCpt(val: string): string {
    return val;
  }

  @Option({
    flags: '--chunk [chunk]',
    description: 'Rows per upsert batch',
    defaultValue: '500',
  })
  parseChunk(val: string): number {
    return Number(val);
  }

  @Option({
    flags: '--truncate',
    description: 'Truncate aetna_b12_lcd before import',
  })
  parseTruncate(): boolean {
    return true;
  }

  @Option({
    flags: '--dry-run',
    description: 'Parse and report counts without writing',
  })
  parseDryRun(): boolean {
    return true;
  }
}
