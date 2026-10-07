import { existsSync, readFileSync } from 'fs';
import * as path from 'path';
import { Logger } from '@nestjs/common';
import { Command, CommandRunner } from 'nest-commander';
import { PrismaService } from '../../common/prisma/prisma.service';
import { BatchIngestService } from '../batches/batch-ingest.service';
import { ClaimValidationService } from '../claim-validation/claim-validation.service';

/**
 * Laravel `App\Console\Commands\TestBatchService` (`batch:test {file?}`).
 *
 * Nest deviation: Laravel builds a fake `Illuminate\Http\UploadedFile` in test mode and calls
 * `BatchServiceInterface::upload()` then `::process()` as two steps, then
 * `ClaimServiceInterface::validateBatch()`. Nest's `BatchIngestService.ingestUpload` already
 * combines "upload" + structural-validate + parse/store into one call (it is the service
 * behind `POST /api/v1/batches/ingest`), so this command calls `ingestUpload` once and then
 * `ClaimValidationService.validateBatch` — functionally equivalent to the Laravel 3-step flow,
 * but with one fewer explicit step since Nest has no separate upload-without-parse stage.
 * Also requires an explicit file path (no bundled sample default — see `edi:parse`).
 */
@Command({
  name: 'batch:test',
  arguments: '<file>',
  description: 'Test batch ingest + claim validation end-to-end by processing a file',
  argsDescription: {
    file: 'EDI file path (required — no bundled sample default)',
  },
})
export class BatchTestCommand extends CommandRunner {
  private readonly logger = new Logger(BatchTestCommand.name);

  constructor(
    private readonly batchIngest: BatchIngestService,
    private readonly claimValidation: ClaimValidationService,
    private readonly prisma: PrismaService,
  ) {
    super();
  }

  async run(passedParams: string[]): Promise<void> {
    const filePath = passedParams[0];
    if (!filePath) {
      this.logger.error('Usage: batch:test <file>');
      process.exitCode = 1;
      return;
    }
    if (!existsSync(filePath)) {
      this.logger.error(`File not found: ${filePath}`);
      process.exitCode = 1;
      return;
    }

    this.logger.log('Testing Batch Ingest + Validation...');
    const buffer = readFileSync(filePath);

    try {
      this.logger.log('1. Ingesting file (structural validate + parse + store)...');
      const batch = await this.batchIngest.ingestUpload(
        { originalname: path.basename(filePath), buffer, size: buffer.length },
        null,
      );
      this.logger.log(
        `   Batch created: ID ${batch.id}, status=${batch.status}, claims=${batch.totalClaims}, amount=$${Number(batch.totalAmount).toFixed(2)}`,
      );

      this.logger.log('2. Validating claims...');
      const results = await this.claimValidation.validateBatch(batch.id, true);
      const valid = results.filter((r) => r.status === 'valid').length;
      const errors = results.filter((r) => r.status === 'error').length;
      const warnings = results.filter((r) => r.status === 'warning').length;
      this.logger.log(`   Valid: ${valid}, Errors: ${errors}, Warnings: ${warnings}`);

      this.logger.log('3. Sample claim:');
      const sample = await this.prisma.claim.findFirst({
        where: { batchFileId: batch.id },
        include: { diagnoses: true, serviceLines: true },
      });
      if (sample) {
        const subscriber = [sample.subscriberFirstName, sample.subscriberLastName]
          .filter(Boolean)
          .join(' ');
        this.logger.log(`   Claim ID: ${sample.claimId}`);
        this.logger.log(`   Subscriber: ${subscriber || 'N/A'}`);
        this.logger.log(`   Member ID: ${sample.subscriberMemberId ?? 'N/A'}`);
        this.logger.log(`   Payer: ${sample.payerName ?? 'N/A'}`);
        this.logger.log(`   Total Charge: $${Number(sample.totalCharge).toFixed(2)}`);
        this.logger.log(`   Diagnoses: ${sample.diagnoses.length}`);
        this.logger.log(`   Service Lines: ${sample.serviceLines.length}`);
        this.logger.log(`   Status: ${sample.status}`);
      } else {
        this.logger.warn('   No claims found on the ingested batch.');
      }

      this.logger.log('');
      this.logger.log('All steps completed successfully.');
    } catch (e) {
      this.logger.error(`Error: ${e instanceof Error ? e.message : String(e)}`);
      process.exitCode = 1;
    }
  }
}
