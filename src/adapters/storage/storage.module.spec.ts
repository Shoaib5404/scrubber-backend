import { ConfigService } from '@nestjs/config';
import { LocalStorageProvider } from './local-storage.provider';
import { S3StorageProvider } from './s3-storage.provider';
import { createStorageProvider } from './storage.module';

describe('createStorageProvider', () => {
  it('defaults to local disk', () => {
    const config = {
      get: (key: string, fallback?: unknown) => {
        if (key === 'STORAGE_DRIVER') return 'local';
        if (key === 'EDI_LOCAL_PATH') return './storage/edi-test';
        return fallback;
      },
    } as ConfigService;

    const provider = createStorageProvider(config);
    expect(provider).toBeInstanceOf(LocalStorageProvider);
  });

  it('builds S3 provider when STORAGE_DRIVER=s3', () => {
    const config = {
      get: (key: string, fallback?: unknown) => {
        const map: Record<string, unknown> = {
          STORAGE_DRIVER: 's3',
          S3_BUCKET: 'neo-scrubber',
          S3_ACCESS_KEY: 'minioadmin',
          S3_SECRET_KEY: 'minioadmin',
          S3_ENDPOINT: 'http://localhost:9020',
          S3_PUBLIC_ENDPOINT: 'http://localhost:9020',
          S3_REGION: 'us-east-1',
          S3_FORCE_PATH_STYLE: true,
          S3_PRESIGN_TTL: 900,
        };
        return map[key] ?? fallback;
      },
    } as ConfigService;

    const provider = createStorageProvider(config);
    expect(provider).toBeInstanceOf(S3StorageProvider);
  });

  it('requires bucket credentials for s3', () => {
    const config = {
      get: (key: string, fallback?: unknown) =>
        key === 'STORAGE_DRIVER' ? 's3' : fallback,
    } as ConfigService;

    expect(() => createStorageProvider(config)).toThrow(/S3_BUCKET/);
  });

  it('requires S3_ENDPOINT when STORAGE_DRIVER=s3', () => {
    const config = {
      get: (key: string, fallback?: unknown) => {
        const map: Record<string, unknown> = {
          STORAGE_DRIVER: 's3',
          S3_BUCKET: 'neo-scrubber',
          S3_ACCESS_KEY: 'minioadmin',
          S3_SECRET_KEY: 'minioadmin',
        };
        return map[key] ?? fallback;
      },
    } as ConfigService;

    expect(() => createStorageProvider(config)).toThrow(/S3_ENDPOINT/);
  });
});
