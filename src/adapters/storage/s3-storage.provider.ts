import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { StorageProvider, StoredObject } from './storage.adapter';
import { assertSafeStorageKey } from './storage-key.util';

export type S3StorageConfig = {
  endpoint?: string;
  bucket: string;
  accessKey: string;
  secretKey: string;
  region: string;
  forcePathStyle: boolean;
};

@Injectable()
export class S3StorageProvider implements StorageProvider {
  private readonly logger = new Logger(S3StorageProvider.name);
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: S3StorageConfig, client?: S3Client) {
    this.bucket = config.bucket;
    this.client =
      client ??
      new S3Client({
        region: config.region,
        endpoint: config.endpoint || undefined,
        forcePathStyle: config.forcePathStyle,
        credentials: {
          accessKeyId: config.accessKey,
          secretAccessKey: config.secretKey,
        },
      });
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
}
