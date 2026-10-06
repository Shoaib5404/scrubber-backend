import { Module } from '@nestjs/common';
import { BatchOwnershipGuard } from '../../common/guards/batch-ownership.guard';
import { BatchesController } from './batches.controller';

@Module({
  controllers: [BatchesController],
  providers: [BatchOwnershipGuard],
})
export class BatchesModule {}
