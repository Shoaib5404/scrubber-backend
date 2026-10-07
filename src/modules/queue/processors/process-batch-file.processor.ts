import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { BatchIngestService } from '../../batches/batch-ingest.service';
import { ProcessBatchFileJobData } from '../queue.constants';

/** Laravel ProcessBatchFile — runs ingest+validate path via BatchIngestService.process. */
@Injectable()
export class ProcessBatchFileProcessor {
  private readonly logger = new Logger(ProcessBatchFileProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ingest: BatchIngestService,
  ) {}

  async handle(data: ProcessBatchFileJobData): Promise<void> {
    this.logger.log(`ProcessBatchFile started batch=${data.batchId} force=${data.force}`);
    try {
      await this.ingest.process(data.batchId, data.force);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await this.prisma.batchFile.update({
        where: { id: data.batchId },
        data: {
          status: 'error',
          errorMessage: `Processing failed: ${message}`,
        },
      });
      throw e;
    }
  }
}
