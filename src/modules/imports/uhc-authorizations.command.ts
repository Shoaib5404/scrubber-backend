import { Logger } from '@nestjs/common';
import { Command, CommandRunner, Option } from 'nest-commander';
import { assertReadableFile, resolveFilePath } from './import.utils';
import { UhcAuthorizationsImportService } from './uhc-authorizations.import.service';

interface UhcAuthorizationsImportOptions {
  truncate?: boolean;
  chunk?: number;
}

@Command({
  name: 'uhc:import-authorizations',
  arguments: '[file]',
  description: 'Import UHC prior authorization library from CSV',
  argsDescription: {
    file: 'Path to CSV file (default: import/CPT libraries/UHC Authorization.csv)',
  },
})
export class UhcAuthorizationsImportCommand extends CommandRunner {
  private readonly logger = new Logger(UhcAuthorizationsImportCommand.name);

  constructor(private readonly importService: UhcAuthorizationsImportService) {
    super();
  }

  async run(passedParams: string[], options: UhcAuthorizationsImportOptions): Promise<void> {
    const filePath = resolveFilePath(
      passedParams[0],
      'import/CPT libraries/UHC Authorization.csv',
    );

    try {
      assertReadableFile(filePath);
    } catch {
      this.logger.error(`File not found: ${filePath}`);
      process.exitCode = 1;
      return;
    }

    if (options.truncate) {
      this.logger.warn('Truncating uhc_authorizations table...');
    }

    try {
      const result = await this.importService.importFromFile(filePath, {
        truncate: options.truncate,
        chunk: options.chunk,
      });

      this.logger.log(
        `Imported: ${result.imported}, Skipped: ${result.skipped}, Errors: ${result.errors}`,
      );
      for (const [condition, count] of Object.entries(result.countsByCondition).sort(([a], [b]) =>
        a.localeCompare(b),
      )) {
        this.logger.log(`  ${condition}: ${count}`);
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
    description: 'Truncate uhc_authorizations before importing',
  })
  parseTruncate(): boolean {
    return true;
  }

  @Option({
    flags: '--chunk [chunk]',
    description: 'Number of records to insert per batch',
    defaultValue: '500',
  })
  parseChunk(val: string): number {
    return Number(val);
  }
}
