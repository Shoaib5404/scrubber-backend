import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { QueueProducerService } from '../queue-producer.service';
import { ValidateBatchJobData } from '../queue.constants';
import { FinalizeBatchValidationProcessor } from './finalize-batch.processor';

/** Laravel ValidateBatchJob — fan-out claim jobs then finalize. */
@Injectable()
export class ValidateBatchProcessor {
  private readonly logger = new Logger(ValidateBatchProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly producer: QueueProducerService,
    private readonly finalize: FinalizeBatchValidationProcessor,
  ) {}

  async handle(data: ValidateBatchJobData): Promise<void> {
    const batch = await this.prisma.batchFile.findUnique({ where: { id: data.batchId } });
    if (!batch) {
      this.logger.error(`ValidateBatchJob: batch not found id=${data.batchId}`);
      return;
    }

    await this.prisma.batchFile.update({
      where: { id: data.batchId },
      data: { status: 'validating' },
    });

    const where = data.force
      ? { batchFileId: data.batchId }
      : { batchFileId: data.batchId, status: 'pending' };

    const claims = await this.prisma.claim.findMany({
      where,
      select: { id: true },
    });
    const claimIds = claims.map((c) => c.id);

    if (claimIds.length === 0) {
      this.logger.log(`No claims left to validate; finalizing batch=${data.batchId}`);
      await this.finalize.handle({ batchId: data.batchId });
      return;
    }

    await this.producer.enqueueClaimValidationFlow(data.batchId, claimIds, data.force);
  }
}
