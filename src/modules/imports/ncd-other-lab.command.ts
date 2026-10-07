import { Logger } from '@nestjs/common';
import { Command, CommandRunner, Option } from 'nest-commander';
import { assertReadableFile, resolveFilePath } from './import.utils';
import { NcdOtherLabImportService } from './ncd-other-lab.import.service';

interface NcdOtherLabImportOptions {
  icdSheet?: number;
  cptSheet?: number;
  chunk?: number;
  truncate?: boolean;
}

@Command({
  name: 'ncd-other-lab:import',
  arguments: '[file]',
  description:
    'Import NCD Other Lab CPT and ICD lists from Excel (two independent lists; no CPT x ICD pairing)',
  argsDescription: {
    file: 'Path to the Excel file (default: import/NCD Other Lab.xls)',
  },
})
export class NcdOtherLabImportCommand extends CommandRunner {
  private readonly logger = new Logger(NcdOtherLabImportCommand.name);

  constructor(private readonly importService: NcdOtherLabImportService) {
    super();
  }

  async run(passedParams: string[], options: NcdOtherLabImportOptions): Promise<void> {
    const filePath = resolveFilePath(passedParams[0], 'import/NCD Other Lab.xls');

    try {
      assertReadableFile(filePath);
    } catch {
      this.logger.error(`File not found or not readable: ${filePath}`);
      process.exitCode = 1;
      return;
    }

    if (options.truncate) {
      this.logger.warn('Truncating ncd_other_lab_icd and ncd_other_lab_cpt...');
    }

    try {
      this.logger.log(`Loading: ${filePath}`);
      const result = await this.importService.importFromFile(filePath, {
        truncate: options.truncate,
        chunk: options.chunk,
        icdSheetIndex: options.icdSheet,
        cptSheetIndex: options.cptSheet,
      });
      this.logger.log(
        `ICD distinct codes: ${result.icdCodeCount}, CPT distinct codes: ${result.cptCodeCount}`,
      );
      this.logger.log(`CPT rows upserted: ${result.cptRowsUpserted}`);
      this.logger.log(`ICD rows upserted: ${result.icdRowsUpserted}`);
    } catch (e) {
      this.logger.error(`Import failed: ${e instanceof Error ? e.message : String(e)}`);
      process.exitCode = 1;
    }
  }

  @Option({
    flags: '--icd-sheet [icdSheet]',
    description: 'Zero-based worksheet index for ICD list',
    defaultValue: '0',
  })
  parseIcdSheet(val: string): number {
    return Number(val);
  }

  @Option({
    flags: '--cpt-sheet [cptSheet]',
    description: 'Zero-based worksheet index for CPT list',
    defaultValue: '1',
  })
  parseCptSheet(val: string): number {
    return Number(val);
  }

  @Option({
    flags: '--chunk [chunk]',
    description: 'Rows per insert/upsert batch',
    defaultValue: '800',
  })
  parseChunk(val: string): number {
    return Number(val);
  }

  @Option({
    flags: '--truncate',
    description: 'Delete all ICD rows and CPT rows before import',
  })
  parseTruncate(): boolean {
    return true;
  }
}
