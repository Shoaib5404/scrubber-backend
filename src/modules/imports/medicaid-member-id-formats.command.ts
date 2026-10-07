import { Logger } from '@nestjs/common';
import { Command, CommandRunner, Option } from 'nest-commander';
import { assertReadableFile, resolveFilePath } from './import.utils';
import { MedicaidMemberIdFormatsImportService } from './medicaid-member-id-formats.import.service';

interface MedicaidMemberIdFormatsImportOptions {
  truncate?: boolean;
  dryRun?: boolean;
}

@Command({
  name: 'medicaid:import-member-id-formats',
  arguments: '[file]',
  description: 'Import Medicaid member ID formats from Excel into JSON storage',
  argsDescription: {
    file: 'Path to Excel workbook (default: import/MemberIDFormatsforMedicaid.xlsx)',
  },
})
export class MedicaidMemberIdFormatsImportCommand extends CommandRunner {
  private readonly logger = new Logger(MedicaidMemberIdFormatsImportCommand.name);

  constructor(private readonly importService: MedicaidMemberIdFormatsImportService) {
    super();
  }

  async run(passedParams: string[], options: MedicaidMemberIdFormatsImportOptions): Promise<void> {
    const filePath = resolveFilePath(passedParams[0], 'import/MemberIDFormatsforMedicaid.xlsx');

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
        dryRun: options.dryRun,
      });
      this.logger.log(`Parsed records: ${result.parsed}`);
      this.logger.log(`Unique payers: ${result.uniquePayers}`);
      this.logger.log(`Existing JSON records: ${result.existing}`);
      if (result.dryRun) {
        this.logger.log('Dry run complete. No JSON changes made.');
      } else {
        this.logger.log(`Stored ${result.stored} Medicaid member ID format records in JSON.`);
      }
    } catch (e) {
      this.logger.error(`Import failed: ${e instanceof Error ? e.message : String(e)}`);
      process.exitCode = 1;
    }
  }

  @Option({
    flags: '--truncate',
    description: 'Replace all JSON records with imported data',
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
