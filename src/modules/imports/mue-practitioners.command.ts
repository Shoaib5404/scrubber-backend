import { Logger } from '@nestjs/common';
import { Command, CommandRunner, Option } from 'nest-commander';
import { assertReadableFile, resolveFilePath } from './import.utils';
import { MuePractitionersImportService } from './mue-practitioners.import.service';

interface MuePractitionersImportOptions {
  chunk?: number;
  fresh?: boolean;
}

@Command({
  name: 'mue-practitioners:import',
  arguments: '[file]',
  description: 'Import CMS Practitioner Services MUE values from Excel into mue_practitioners',
  argsDescription: {
    file: 'Path to MCR_MUE_Practitioner.xlsx (default: import/MCR_MUE_Practitioner.xlsx)',
  },
})
export class MuePractitionersImportCommand extends CommandRunner {
  private readonly logger = new Logger(MuePractitionersImportCommand.name);

  constructor(private readonly importService: MuePractitionersImportService) {
    super();
  }

  async run(passedParams: string[], options: MuePractitionersImportOptions): Promise<void> {
    const filePath = resolveFilePath(passedParams[0], 'import/MCR_MUE_Practitioner.xlsx');

    try {
      assertReadableFile(filePath);
    } catch {
      this.logger.error(`File not found: ${filePath}`);
      process.exitCode = 1;
      return;
    }

    if (options.fresh) {
      this.logger.warn('Truncating mue_practitioners...');
    }

    try {
      this.logger.log(`Streaming: ${filePath}`);
      const result = await this.importService.importFromFile(filePath, {
        truncate: options.fresh,
        chunk: options.chunk,
      });
      this.logger.log(`Rows upserted: ${result.upserted}`);
      this.logger.log(`Rows skipped (empty/header CPT): ${result.skipped}`);
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
    flags: '--fresh',
    description: 'Truncate mue_practitioners before import',
  })
  parseFresh(): boolean {
    return true;
  }
}
