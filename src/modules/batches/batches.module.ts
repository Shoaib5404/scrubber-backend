import { Module } from '@nestjs/common';
import { BatchOwnershipGuard } from '../../common/guards/batch-ownership.guard';
import { ClaimValidationModule } from '../claim-validation/claim-validation.module';
import { EdiParserModule } from '../edi-parser/edi-parser.module';
import { EdiStructuralValidationModule } from '../edi-structural-validation/edi-structural.module';
import { BatchIngestService } from './batch-ingest.service';
import { BatchesController, ClaimsController } from './batches.controller';

@Module({
  imports: [EdiStructuralValidationModule, EdiParserModule, ClaimValidationModule],
  controllers: [BatchesController, ClaimsController],
  providers: [BatchOwnershipGuard, BatchIngestService],
  exports: [BatchIngestService],
})
export class BatchesModule {}
