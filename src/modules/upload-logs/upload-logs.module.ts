import { Module } from '@nestjs/common';
import { UploadLogsController } from './upload-logs.controller';
import { UploadLogsService } from './upload-logs.service';

@Module({
  controllers: [UploadLogsController],
  providers: [UploadLogsService],
  exports: [UploadLogsService],
})
export class UploadLogsModule {}
