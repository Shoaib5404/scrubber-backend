import { existsSync, readFileSync } from 'fs';
import { Logger } from '@nestjs/common';
import { Command, CommandRunner, Option } from 'nest-commander';
import { ModelDrivenEdiParser } from '../edi-parser/model-driven-edi.parser';

interface EdiParseOptions {
  json?: boolean;
}

/**
 * Laravel `App\Console\Commands\ParseEdiFile` (`edi:parse {file?} {--json}`).
 *
 * Nest deviation: Laravel defaults to a bundled sample path
 * (`base_path('Scrubber/01162026/...')`) that may not exist outside the Laravel repo. Nest
 * requires the file argument instead of silently defaulting to a path that might 404.
 */
@Command({
  name: 'edi:parse',
  arguments: '<file>',
  description: 'Parse an EDI 837 file and display the results',
  argsDescription: {
    file: 'Path to EDI file (required — no bundled sample default)',
  },
})
export class EdiParseCommand extends CommandRunner {
  private readonly logger = new Logger(EdiParseCommand.name);

  constructor(private readonly parser: ModelDrivenEdiParser) {
    super();
  }

  async run(passedParams: string[], options: EdiParseOptions): Promise<void> {
    const filePath = passedParams[0];
    if (!filePath) {
      this.logger.error('Usage: edi:parse <file> [--json]');
      process.exitCode = 1;
      return;
    }
    if (!existsSync(filePath)) {
      this.logger.error(`File not found: ${filePath}`);
      process.exitCode = 1;
      return;
    }

    this.logger.log(`Parsing EDI file: ${filePath}`);
    const raw = readFileSync(filePath, 'utf8');

    let parsed;
    try {
      parsed = this.parser.parse(raw);
    } catch (e) {
      this.logger.error(`Error parsing file: ${e instanceof Error ? e.message : String(e)}`);
      process.exitCode = 1;
      return;
    }

    if (options.json) {
      this.logger.log(JSON.stringify(parsed, null, 2));
      return;
    }

    this.logger.log('=== Interchange (ISA) / Functional Group (GS) ===');
    this.logger.log(`ISA Sender ID: ${parsed.isaSenderId ?? 'N/A'}`);
    this.logger.log(`ISA Receiver ID: ${parsed.isaReceiverId ?? 'N/A'}`);
    this.logger.log(`ISA Date: ${parsed.isaDate ?? 'N/A'}`);
    this.logger.log(`BHT Date: ${parsed.bhtDate ?? 'N/A'}`);
    this.logger.log(`ISA Control Number: ${parsed.isaControlNumber ?? 'N/A'}`);
    this.logger.log(`GS Sender Code: ${parsed.gsSenderCode ?? 'N/A'}`);
    this.logger.log(`GS Receiver Code: ${parsed.gsReceiverCode ?? 'N/A'}`);
    this.logger.log(`GS Control Number: ${parsed.gsControlNumber ?? 'N/A'}`);
    this.logger.log(`GS Version: ${parsed.gsVersionCode ?? 'N/A'}`);

    this.logger.log('');
    this.logger.log('=== Statistics ===');
    const totalAmount = parsed.claims.reduce((sum, c) => sum + c.totalCharge, 0);
    const totalServiceLines = parsed.claims.reduce((sum, c) => sum + c.serviceLines.length, 0);
    this.logger.log(`Total Claims: ${parsed.claims.length}`);
    this.logger.log(`Total Amount: $${totalAmount.toFixed(2)}`);
    this.logger.log(`Total Service Lines: ${totalServiceLines}`);

    if (parsed.claims.length > 0) {
      const first = parsed.claims[0];
      this.logger.log('');
      this.logger.log('=== First Claim ===');
      this.logger.log(`Claim ID: ${first.claimId}`);
      this.logger.log(`Control #: ${first.stControlNumber ?? 'N/A'}`);
      this.logger.log(`Total Charge: $${first.totalCharge.toFixed(2)}`);
      this.logger.log(`Place of Service: ${first.placeOfService ?? 'N/A'}`);
      this.logger.log(`Diagnoses: ${first.diagnoses.length}`);
      this.logger.log(`Service Lines: ${first.serviceLines.length}`);
    }

    if (parsed.parseErrors.length > 0) {
      this.logger.warn(`Parse Errors: ${parsed.parseErrors.length}`);
      for (const err of parsed.parseErrors) {
        this.logger.error(`  - ${err}`);
      }
    } else {
      this.logger.log('');
      this.logger.log('Parsing completed successfully.');
    }
  }

  @Option({
    flags: '--json',
    description: 'Output the full parsed batch as JSON',
  })
  parseJson(): boolean {
    return true;
  }
}
