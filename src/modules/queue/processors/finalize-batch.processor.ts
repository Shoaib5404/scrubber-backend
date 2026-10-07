import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { FinalizeBatchJobData } from '../queue.constants';

/**
 * Laravel FinalizeBatchValidationJob::finalize —
 * recompute counts; mark validated only when no pending claims remain.
 */
@Injectable()
export class FinalizeBatchValidationProcessor {
  private readonly logger = new Logger(FinalizeBatchValidationProcessor.name);

  constructor(private readonly prisma: PrismaService) {}

  async handle(data: FinalizeBatchJobData): Promise<void> {
    const batch = await this.prisma.batchFile.findUnique({ where: { id: data.batchId } });
    if (!batch) return;

    const groups = await this.prisma.claim.groupBy({
      by: ['status'],
      where: { batchFileId: data.batchId },
      _count: { _all: true },
    });
    const counts = Object.fromEntries(groups.map((g) => [g.status, g._count._all]));

    const validCount = counts['valid'] ?? 0;
    const errorCount = counts['error'] ?? 0;
    const warningCount = counts['warning'] ?? 0;
    const pendingCount = counts['pending'] ?? 0;
    const isComplete = pendingCount === 0;

    await this.prisma.batchFile.update({
      where: { id: data.batchId },
      data: {
        status: isComplete ? 'validated' : 'validating',
        validClaims: validCount,
        errorClaims: errorCount,
        warningClaims: warningCount,
        errorMessage: isComplete ? null : batch.errorMessage,
        processedAt: isComplete ? new Date() : batch.processedAt,
      },
    });

    this.logger.log(
      `Finalize batch=${data.batchId} complete=${isComplete} valid=${validCount} error=${errorCount} warning=${warningCount} pending=${pendingCount}`,
    );
  }
}
