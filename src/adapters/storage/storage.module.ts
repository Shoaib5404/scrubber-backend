import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LocalStorageProvider } from './local-storage.provider';
import { STORAGE_PROVIDER } from './storage.adapter';
import { StorageService } from './storage.service';

@Global()
@Module({
  providers: [
    {
      provide: STORAGE_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        // SP-1b: always local disk. S3/MinIO provider is deferred to SP-4 (EDI upload).
        // S3_* keys remain in .env.example for Compose/MinIO readiness.
        return new LocalStorageProvider(
          config.get<string>('EDI_LOCAL_PATH', './storage/edi'),
        );
      },
    },
    StorageService,
  ],
  exports: [StorageService, STORAGE_PROVIDER],
})
export class StorageModule {}
