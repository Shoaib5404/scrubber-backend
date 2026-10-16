import { Module, forwardRef } from '@nestjs/common';
import { BatchOwnershipGuard } from '../../common/guards/batch-ownership.guard';
import { AuthModule } from '../auth/auth.module';
import { ClaimValidationModule } from '../claim-validation/claim-validation.module';
import { EdiParserModule } from '../edi-parser/edi-parser.module';
import { EdiStructuralValidationModule } from '../edi-structural-validation/edi-structural.module';
import { QueueModule } from '../queue/queue.module';
import { UploadLogsModule } from '../upload-logs/upload-logs.module';
import { BatchIngestService } from './batch-ingest.service';
import { BatchesController } from './batches.controller';
import { BatchesService } from './batches.service';

@Module({
  imports: [
    AuthModule,
    EdiStructuralValidationModule,
    EdiParserModule,
    ClaimValidationModule,
    forwardRef(() => QueueModule),
    UploadLogsModule,
  ],
  controllers: [BatchesController],
  providers: [BatchOwnershipGuard, BatchIngestService, BatchesService],
  exports: [BatchIngestService, BatchesService],
})
export class BatchesModule {}

