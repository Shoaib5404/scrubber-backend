import { Logger } from '@nestjs/common';
import { Command, CommandRunner, Option } from 'nest-commander';
import { assertReadableFile, resolveFilePath } from './import.utils';
import { Icd10UnacceptablePrincipalDxCodesImportService } from './icd10-unacceptable-principal-dx-codes.import.service';

interface Icd10UnacceptablePrincipalDxCodesImportOptions {
  truncate?: boolean;
  chunk?: number;
}

@Command({
  name: 'icd10-unacceptable-principal-dx-codes:import',
  arguments: '[file]',
  description: 'Import ICD UnAcceptable Principal DX Codes dataset from CSV',
  argsDescription: {
    file: 'Path to CSV file (default: import/UnAcceptable Principal DX Codes.csv)',
  },
})
export class Icd10UnacceptablePrincipalDxCodesImportCommand extends CommandRunner {
  private readonly logger = new Logger(Icd10UnacceptablePrincipalDxCodesImportCommand.name);

  constructor(private readonly importService: Icd10UnacceptablePrincipalDxCodesImportService) {
    super();
  }

  async run(
    passedParams: string[],
    options: Icd10UnacceptablePrincipalDxCodesImportOptions,
  ): Promise<void> {
    const filePath = resolveFilePath(passedParams[0], 'import/UnAcceptable Principal DX Codes.csv');

    try {
      assertReadableFile(filePath);
    } catch {
      this.logger.error(`File not found or not readable: ${filePath}`);
      process.exitCode = 1;
      return;
    }

    if (options.truncate) {
      this.logger.warn('Truncating ICD10 unacceptable principal diagnose codes table...');
    }

    try {
      this.logger.log(`Importing from: ${filePath}`);
      const result = await this.importService.importFromFile(filePath, {
        truncate: options.truncate,
        chunk: options.chunk,
      });
      this.logger.log(`Upserted: ${result.upserted}`);
      this.logger.log(`Skipped (blank code or invalid claim type): ${result.skipped}`);
    } catch (e) {
      this.logger.error(`Import failed: ${e instanceof Error ? e.message : String(e)}`);
      process.exitCode = 1;
    }
  }

  @Option({
    flags: '--chunk [chunk]',
    description: 'Number of rows per insert batch',
    defaultValue: '1000',
  })
  parseChunk(val: string): number {
    return Number(val);
  }

  @Option({
    flags: '--truncate',
    description: 'Truncate ICD10 unacceptable principal diagnose codes table before import',
  })
  parseTruncate(): boolean {
    return true;
  }
}
