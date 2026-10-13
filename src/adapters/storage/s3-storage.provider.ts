import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type {
  PresignedDownloadUrl,
  PresignedUploadUrl,
  StorageObjectHead,
  StorageProvider,
  StoredObject,
} from './storage.adapter';
import { assertSafeStorageKey } from './storage-key.util';

export type S3StorageConfig = {
  /** Server-side endpoint (Nest ↔ MinIO). */
  endpoint?: string;
  /** Browser-facing endpoint for signing presigned URLs. Defaults to `endpoint`. */
  publicEndpoint?: string;
  bucket: string;
  accessKey: string;
  secretKey: string;
  region: string;
  forcePathStyle: boolean;
  presignTtlSeconds?: number;
};

@Injectable()
export class S3StorageProvider implements StorageProvider {
  private readonly logger = new Logger(S3StorageProvider.name);
  private readonly client: S3Client;
  private readonly signingClient: S3Client;
  private readonly bucket: string;
  private readonly defaultPresignTtl: number;

  constructor(config: S3StorageConfig, client?: S3Client, signingClient?: S3Client) {
    this.bucket = config.bucket;
    this.defaultPresignTtl =
      Number.isFinite(config.presignTtlSeconds) && (config.presignTtlSeconds ?? 0) > 0
        ? (config.presignTtlSeconds as number)
        : 900;

    // Disable flexible checksums so browser PUTs to MinIO do not need
    // x-amz-checksum-* headers that AWS SDK v3 otherwise embeds in signatures.
    const clientOptions = {
      region: config.region,
      forcePathStyle: config.forcePathStyle,
      credentials: {
        accessKeyId: config.accessKey,
        secretAccessKey: config.secretKey,
      },
      requestChecksumCalculation: 'WHEN_REQUIRED' as const,
      responseChecksumValidation: 'WHEN_REQUIRED' as const,
    };

    this.client =
      client ??
      new S3Client({
        ...clientOptions,
        endpoint: config.endpoint || undefined,
      });

    const publicEndpoint = (config.publicEndpoint || config.endpoint || '').trim();
    this.signingClient =
      signingClient ??
      (publicEndpoint && publicEndpoint !== (config.endpoint || '').trim()
        ? new S3Client({
            ...clientOptions,
            endpoint: publicEndpoint,
          })
        : this.client);
  }

  /**
   * Idempotent bucket bootstrap so local/prod deploys do not require a manual `mc mb`.
   * Safe to call on every process start.
   */
  async ensureBucket(): Promise<void> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      return;
    } catch {
      // Missing or inaccessible — attempt create.
    }

    try {
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
      this.logger.log(`Created storage bucket "${this.bucket}"`);
    } catch (err) {
      const name = (err as { name?: string })?.name ?? '';
      if (name === 'BucketAlreadyOwnedByYou' || name === 'BucketAlreadyExists') {
        return;
      }
      const status =
        typeof err === 'object' &&
        err !== null &&
        '$metadata' in err &&
        typeof (err as { $metadata?: { httpStatusCode?: number } }).$metadata
          ?.httpStatusCode === 'number'
          ? (err as { $metadata: { httpStatusCode: number } }).$metadata.httpStatusCode
          : undefined;
      // Some MinIO builds return 409 Conflict for existing buckets.
      if (status === 409) {
        return;
      }
      this.logger.error(`Failed to ensure bucket "${this.bucket}": ${String(err)}`);
      throw err;
    }
  }

  async putObject(key: string, body: Buffer, contentType?: string): Promise<StoredObject> {
    const safeKey = assertSafeStorageKey(key);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: safeKey,
        Body: body,
        ContentType: contentType ?? 'application/octet-stream',
      }),
    );
    this.logger.debug(`Stored object s3://${this.bucket}/${safeKey}`);
    return { key: safeKey, bucket: this.bucket };
  }

  async getObject(key: string): Promise<Buffer> {
    const safeKey = assertSafeStorageKey(key);
    try {
      const result = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: safeKey,
        }),
      );
      const bytes = await result.Body?.transformToByteArray();
      if (!bytes) {
        throw new NotFoundException(`Storage object not found: ${safeKey}`);
      }
      return Buffer.from(bytes);
    } catch (err) {
      if (err instanceof NotFoundException) throw err;
      const name = (err as { name?: string })?.name;
      if (name === 'NoSuchKey' || name === 'NotFound') {
        throw new NotFoundException(`Storage object not found: ${safeKey}`);
      }
      throw err;
    }
  }

  async deleteObject(key: string): Promise<void> {
    const safeKey = assertSafeStorageKey(key);
    try {
      await this.client.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: safeKey,
        }),
      );
    } catch (err) {
      const name = (err as { name?: string })?.name;
      if (name === 'NoSuchKey' || name === 'NotFound') return;
      throw err;
    }
  }

  async headObject(key: string): Promise<StorageObjectHead> {
    const safeKey = assertSafeStorageKey(key);
    try {
      const result = await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: safeKey,
        }),
      );
      return {
        exists: true,
        contentType: result.ContentType,
        contentLength: result.ContentLength,
      };
    } catch (error: unknown) {
      const status =
        typeof error === 'object' &&
        error !== null &&
        '$metadata' in error &&
        typeof (error as { $metadata?: { httpStatusCode?: number } }).$metadata
          ?.httpStatusCode === 'number'
          ? (error as { $metadata: { httpStatusCode: number } }).$metadata.httpStatusCode
          : undefined;
      if (status === 404) {
        return { exists: false };
      }
      const name =
        typeof error === 'object' && error !== null && 'name' in error
          ? String((error as { name: unknown }).name)
          : '';
      if (name === 'NotFound' || name === 'NoSuchKey') {
        return { exists: false };
      }
      throw error;
    }
  }

  async getPresignedUploadUrl(params: {
    objectKey: string;
    mimeType: string;
    maxSizeBytes: number;
    expiresIn?: number;
  }): Promise<PresignedUploadUrl> {
    void params.maxSizeBytes;
    const safeKey = assertSafeStorageKey(params.objectKey);
    const expiresIn = params.expiresIn ?? this.defaultPresignTtl;
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: safeKey,
      ContentType: params.mimeType,
    });
    const url = await getSignedUrl(this.signingClient, command, { expiresIn });
    return {
      url,
      objectKey: safeKey,
      expiresIn,
      headers: { 'Content-Type': params.mimeType },
    };
  }

  async getPresignedDownloadUrl(params: {
    objectKey: string;
    expiresIn?: number;
  }): Promise<PresignedDownloadUrl> {
    const safeKey = assertSafeStorageKey(params.objectKey);
    const expiresIn = params.expiresIn ?? this.defaultPresignTtl;
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: safeKey,
    });
    const url = await getSignedUrl(this.signingClient, command, { expiresIn });
    return { url, expiresIn };
  }
}
