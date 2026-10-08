import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LocalStorageProvider } from './local-storage.provider';
import { S3StorageProvider } from './s3-storage.provider';
import { STORAGE_PROVIDER } from './storage.adapter';
import { StorageService } from './storage.service';

function createStorageProvider(config: ConfigService): LocalStorageProvider | S3StorageProvider {
  const driver = String(config.get<string>('STORAGE_DRIVER', 'local'))
    .trim()
    .toLowerCase();

  if (driver === 's3') {
    const bucket = config.get<string>('S3_BUCKET');
    const accessKey = config.get<string>('S3_ACCESS_KEY');
    const secretKey = config.get<string>('S3_SECRET_KEY');
    if (!bucket || !accessKey || !secretKey) {
      throw new Error(
        'STORAGE_DRIVER=s3 requires S3_BUCKET, S3_ACCESS_KEY, and S3_SECRET_KEY.',
      );
    }
    return new S3StorageProvider({
      endpoint: config.get<string>('S3_ENDPOINT'),
      bucket,
      accessKey,
      secretKey,
      region: config.get<string>('S3_REGION', 'us-east-1') ?? 'us-east-1',
      forcePathStyle: config.get<boolean>('S3_FORCE_PATH_STYLE', true) ?? true,
    });
  }

  if (driver !== 'local') {
    throw new Error(`Unknown STORAGE_DRIVER="${driver}". Use "local" or "s3".`);
  }

  return new LocalStorageProvider(config.get<string>('EDI_LOCAL_PATH', './storage/edi'));
}

@Global()
@Module({
  providers: [
    {
      provide: STORAGE_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => createStorageProvider(config),
    },
    StorageService,
  ],
  exports: [StorageService, STORAGE_PROVIDER],
})
export class StorageModule {}

export { createStorageProvider };
