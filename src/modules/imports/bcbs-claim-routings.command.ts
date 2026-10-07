import { Logger } from '@nestjs/common';
import { Command, CommandRunner, Option } from 'nest-commander';
import { assertReadableFile, resolveFilePath } from './import.utils';
import { BcbsClaimRoutingsImportService } from './bcbs-claim-routings.import.service';

interface BcbsClaimRoutingsImportOptions {
  truncate?: boolean;
  chunk?: number;
}

@Command({
  name: 'bcbs-claim-routings:import',
  arguments: '[file]',
  description: 'Import BCBS claim routing prefix to payer mappings from CSV',
  argsDescription: {
    file: 'Path to CSV file (default: import/Member ID codes for BCBS claim routing.csv)',
  },
})
export class BcbsClaimRoutingsImportCommand extends CommandRunner {
  private readonly logger = new Logger(BcbsClaimRoutingsImportCommand.name);

  constructor(private readonly importService: BcbsClaimRoutingsImportService) {
    super();
  }

  async run(passedParams: string[], options: BcbsClaimRoutingsImportOptions): Promise<void> {
    const filePath = resolveFilePath(
      passedParams[0],
      'import/Member ID codes for BCBS claim routing.csv',
    );

    try {
      assertReadableFile(filePath);
    } catch {
      this.logger.error(`File not found or not readable: ${filePath}`);
      process.exitCode = 1;
      return;
    }

    if (options.truncate) {
      this.logger.warn('Truncating bcbs_claim_routings table...');
    }

    try {
      this.logger.log(`Importing from: ${filePath}`);
      const result = await this.importService.importFromFile(filePath, {
        truncate: options.truncate,
        chunk: options.chunk,
      });
      this.logger.log(`Upserted: ${result.upserted}`);
      this.logger.log(
        `Duplicate prefix + payer ID occurrences (last wins): ${result.duplicates}`,
      );
    } catch (e) {
      this.logger.error(`Import failed: ${e instanceof Error ? e.message : String(e)}`);
      process.exitCode = 1;
    }
  }

  @Option({
    flags: '--truncate',
    description: 'Truncate bcbs_claim_routings table before import',
  })
  parseTruncate(): boolean {
    return true;
  }

  @Option({
    flags: '--chunk [chunk]',
    description: 'Number of rows per upsert batch',
    defaultValue: '500',
  })
  parseChunk(val: string): number {
    return Number(val);
  }
}
