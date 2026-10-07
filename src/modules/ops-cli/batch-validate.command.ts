import { Logger } from '@nestjs/common';
import { Command, CommandRunner } from 'nest-commander';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ClaimValidationService } from '../claim-validation/claim-validation.service';

/**
 * Laravel `App\Console\Commands\ValidateBatch` (`batch:validate {batch_id?}`).
 *
 * Nest deviation: all per-claim rule logic already lives in
 * `ClaimValidationService.validateClaim`/`validateBatch` (ported for SP-4 Task 11) — this
 * command is a thin wrapper, not a re-implementation of the Laravel rule set. `"all"` targets
 * batches with `status` in `['parsed', 'processing']` (Nest's plain-string `BatchStatus`
 * equivalents of Laravel's `BatchStatus::PARSED`/`PROCESSING`). Re-validation always passes
 * `force: true` to `validateBatch`, matching Laravel's unconditional re-validate-every-claim
 * behavior (no "skip already valid" filtering in the Artisan command).
 */
@Command({
  name: 'batch:validate',
  arguments: '[batch_id]',
  description: 'Validate claims in a batch',
  argsDescription: {
    batch_id: 'Batch ID to validate, or "all" for all parsed/processing batches',
  },
})
export class BatchValidateCommand extends CommandRunner {
  private readonly logger = new Logger(BatchValidateCommand.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly claimValidation: ClaimValidationService,
  ) {
    super();
  }

  async run(passedParams: string[]): Promise<void> {
    const batchIdArg = passedParams[0];

    if (batchIdArg === 'all') {
      const batches = await this.prisma.batchFile.findMany({
        where: { status: { in: ['parsed', 'processing'] } },
        orderBy: { id: 'asc' },
      });

      if (batches.length === 0) {
        this.logger.warn('No batches need validation');
        return;
      }

      for (const batch of batches) {
        await this.runValidate(batch.id);
      }
      this.logger.log(`Validated ${batches.length} batch(es)`);
      return;
    }

    if (!batchIdArg) {
      this.logger.error('Please provide a batch ID or "all"');
      process.exitCode = 1;
      return;
    }

    const batchId = Number(batchIdArg);
    const batch = Number.isInteger(batchId)
      ? await this.prisma.batchFile.findUnique({ where: { id: batchId } })
      : null;

    if (!batch) {
      this.logger.error(`Batch ${batchIdArg} not found`);
      process.exitCode = 1;
      return;
    }

    await this.runValidate(batch.id);
  }

  private async runValidate(batchId: number): Promise<void> {
    this.logger.log(`Validating batch ${batchId}...`);
    const results = await this.claimValidation.validateBatch(batchId, true);
    const validCount = results.filter((r) => r.status === 'valid').length;
    const errorCount = results.filter((r) => r.status === 'error').length;
    const warningCount = results.filter((r) => r.status === 'warning').length;
    this.logger.log(`  Valid: ${validCount}, Errors: ${errorCount}, Warnings: ${warningCount}`);
  }
}
