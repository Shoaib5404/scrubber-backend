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
    const endpoint = config.get<string>('S3_ENDPOINT');
    if (!bucket || !accessKey || !secretKey) {
      throw new Error(
        'STORAGE_DRIVER=s3 requires S3_BUCKET, S3_ACCESS_KEY, and S3_SECRET_KEY.',
      );
    }
    if (!endpoint?.trim()) {
      throw new Error('STORAGE_DRIVER=s3 requires S3_ENDPOINT.');
    }
    const publicEndpoint =
      config.get<string>('S3_PUBLIC_ENDPOINT')?.trim() || endpoint.trim();
    return new S3StorageProvider({
      endpoint: endpoint.trim(),
      publicEndpoint,
      bucket,
      accessKey,
      secretKey,
      region: config.get<string>('S3_REGION', 'us-east-1') ?? 'us-east-1',
      forcePathStyle: config.get<boolean>('S3_FORCE_PATH_STYLE', true) ?? true,
      presignTtlSeconds: config.get<number>('S3_PRESIGN_TTL', 900) ?? 900,
    });
  }

  if (driver !== 'local') {
    throw new Error(`Unknown STORAGE_DRIVER="${driver}". Use "local" or "s3".`);
  }

  return new LocalStorageProvider(config.get<string>('EDI_LOCAL_PATH', './storage/edi'));
}

async function createStorageProviderReady(
  config: ConfigService,
): Promise<LocalStorageProvider | S3StorageProvider> {
  const provider = createStorageProvider(config);
  if (provider instanceof S3StorageProvider) {
    await provider.ensureBucket();
  }
  return provider;
}

@Global()
@Module({
  providers: [
    {
      provide: STORAGE_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => createStorageProviderReady(config),
    },
    StorageService,
  ],
  exports: [StorageService, STORAGE_PROVIDER],
})
export class StorageModule {}

export { createStorageProvider, createStorageProviderReady };
