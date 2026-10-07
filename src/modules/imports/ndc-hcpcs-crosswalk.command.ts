import { Logger } from '@nestjs/common';
import { Command, CommandRunner, Option } from 'nest-commander';
import { assertReadableFile, resolveFilePath } from './import.utils';
import { NdcHcpcsCrosswalkImportService } from './ndc-hcpcs-crosswalk.import.service';

interface NdcHcpcsCrosswalkImportOptions {
  truncate?: boolean;
  chunk?: number;
}

@Command({
  name: 'ndc:import-hcpcs-crosswalk',
  arguments: '[file]',
  description: 'Import NDC to HCPCS crosswalk records from an Excel or JSON file',
  argsDescription: {
    file: 'Path to Excel (.xlsx/.xls) or JSON file (default: import/NDC HCPS CROSSWALK.xlsx)',
  },
})
export class NdcHcpcsCrosswalkImportCommand extends CommandRunner {
  private readonly logger = new Logger(NdcHcpcsCrosswalkImportCommand.name);

  constructor(private readonly importService: NdcHcpcsCrosswalkImportService) {
    super();
  }

  async run(passedParams: string[], options: NdcHcpcsCrosswalkImportOptions): Promise<void> {
    const filePath = resolveFilePath(passedParams[0], 'import/NDC HCPS CROSSWALK.xlsx');

    try {
      assertReadableFile(filePath);
    } catch {
      this.logger.error(`File not found: ${filePath}`);
      process.exitCode = 1;
      return;
    }

    if (options.truncate) {
      this.logger.log('Truncated ndc_hcpcs_crosswalk table.');
    }

    try {
      const result = await this.importService.importFromFile(filePath, {
        truncate: options.truncate,
        chunk: options.chunk,
      });
      this.logger.log(
        `Imported: ${result.imported}, Already in DB (skipped): ${result.skippedExisting}, Skipped (empty): ${result.skipped}, Invalid NDC: ${result.invalidNdc}, Errors: ${result.errors}`,
      );
      if (result.errors > 0 || result.invalidNdc > 0) {
        process.exitCode = 1;
      }
    } catch (e) {
      this.logger.error(`Import failed: ${e instanceof Error ? e.message : String(e)}`);
      process.exitCode = 1;
    }
  }

  @Option({
    flags: '--truncate',
    description: 'Truncate the ndc_hcpcs_crosswalk table before importing',
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
