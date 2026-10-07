import { Logger } from '@nestjs/common';
import { Command, CommandRunner, Option } from 'nest-commander';
import { assertReadableFile, resolveFilePath } from './import.utils';
import { AetnaFetalLcdImportService } from './aetna-fetal-lcd.import.service';

interface AetnaFetalLcdImportOptions {
  chunk?: number;
  truncate?: boolean;
  dryRun?: boolean;
}

@Command({
  name: 'aetna-fetal-lcd:import',
  arguments: '[file]',
  description: 'Import Aetna Fetal LCD CPT-to-ICD crosswalk (comma ICD fix, range expansion)',
  argsDescription: {
    file: 'Path to Excel workbook (default: import/AETNA Fetal LCD.xlsx)',
  },
})
export class AetnaFetalLcdImportCommand extends CommandRunner {
  private readonly logger = new Logger(AetnaFetalLcdImportCommand.name);

  constructor(private readonly importService: AetnaFetalLcdImportService) {
    super();
  }

  async run(passedParams: string[], options: AetnaFetalLcdImportOptions): Promise<void> {
    const filePath = resolveFilePath(passedParams[0], 'import/AETNA Fetal LCD.xlsx');

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
    flags: '--chunk [chunk]',
    description: 'Rows per upsert batch',
    defaultValue: '500',
  })
  parseChunk(val: string): number {
    return Number(val);
  }

  @Option({
    flags: '--truncate',
    description: 'Truncate aetna_fetal_lcd before import',
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
