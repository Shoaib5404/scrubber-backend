import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  STORAGE_PROVIDER,
  type PresignedDownloadUrl,
  type PresignedUploadUrl,
  type StorageObjectHead,
  type StorageProvider,
  type StoredObject,
} from './storage.adapter';

export const DEFAULT_PRESIGN_TTL_SECONDS = 900;

@Injectable()
export class StorageService {
  private readonly defaultPresignTtl: number;

  constructor(
    @Inject(STORAGE_PROVIDER)
    private readonly provider: StorageProvider,
    private readonly config: ConfigService,
  ) {
    const ttl = this.config.get<number>('S3_PRESIGN_TTL', DEFAULT_PRESIGN_TTL_SECONDS);
    this.defaultPresignTtl =
      Number.isFinite(ttl) && (ttl ?? 0) > 0 ? (ttl as number) : DEFAULT_PRESIGN_TTL_SECONDS;
  }

  getPresignTtlSeconds(): number {
    return this.defaultPresignTtl;
  }

  putObject(key: string, body: Buffer, contentType?: string): Promise<StoredObject> {
    return this.provider.putObject(key, body, contentType);
  }

  getObject(key: string): Promise<Buffer> {
    return this.provider.getObject(key);
  }

  deleteObject(key: string): Promise<void> {
    return this.provider.deleteObject(key);
  }

  headObject(key: string): Promise<StorageObjectHead> {
    return this.provider.headObject(key);
  }

  getPresignedUploadUrl(params: {
    objectKey: string;
    mimeType: string;
    maxSizeBytes: number;
    expiresIn?: number;
  }): Promise<PresignedUploadUrl> {
    return this.provider.getPresignedUploadUrl({
      objectKey: params.objectKey,
      mimeType: params.mimeType,
      maxSizeBytes: params.maxSizeBytes,
      expiresIn: params.expiresIn ?? this.defaultPresignTtl,
    });
  }

  getPresignedDownloadUrl(params: {
    objectKey: string;
    expiresIn?: number;
  }): Promise<PresignedDownloadUrl> {
    return this.provider.getPresignedDownloadUrl({
      objectKey: params.objectKey,
      expiresIn: params.expiresIn ?? this.defaultPresignTtl,
    });
  }
}
