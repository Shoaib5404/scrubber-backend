import {
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { mkdir, readFile, stat, unlink, writeFile } from 'fs/promises';
import { dirname, resolve, sep } from 'path';
import type {
  PresignedDownloadUrl,
  PresignedUploadUrl,
  StorageObjectHead,
  StorageProvider,
  StoredObject,
} from './storage.adapter';
import { assertSafeStorageKey } from './storage-key.util';

@Injectable()
export class LocalStorageProvider implements StorageProvider {
  private readonly logger = new Logger(LocalStorageProvider.name);
  private readonly root: string;

  constructor(root = './storage/edi') {
    this.root = resolve(root);
  }

  private resolvePath(key: string): string {
    const safeKey = assertSafeStorageKey(key);
    const full = resolve(this.root, ...safeKey.split('/'));
    const rootWithSep = this.root.endsWith(sep) ? this.root : `${this.root}${sep}`;
    if (full !== this.root && !full.startsWith(rootWithSep)) {
      throw new Error('Storage path escapes configured root.');
    }
    return full;
  }

  async putObject(key: string, body: Buffer): Promise<StoredObject> {
    const path = this.resolvePath(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, body);
    this.logger.debug(`Stored object locally at ${path}`);
    return { key: assertSafeStorageKey(key) };
  }

  async getObject(key: string): Promise<Buffer> {
    try {
      return await readFile(this.resolvePath(key));
    } catch (err) {
      const code = (err as NodeJS.ErrnoException)?.code;
      if (code === 'ENOENT') {
        throw new NotFoundException(`Storage object not found: ${key}`);
      }
      throw err;
    }
  }

  async deleteObject(key: string): Promise<void> {
    try {
      await unlink(this.resolvePath(key));
    } catch (err) {
      const code = (err as NodeJS.ErrnoException)?.code;
      if (code === 'ENOENT') return;
      throw err;
    }
  }

  async headObject(key: string): Promise<StorageObjectHead> {
    try {
      const info = await stat(this.resolvePath(key));
      if (!info.isFile()) {
        return { exists: false };
      }
      return {
        exists: true,
        contentLength: info.size,
        contentType: 'application/octet-stream',
      };
    } catch (err) {
      const code = (err as NodeJS.ErrnoException)?.code;
      if (code === 'ENOENT') {
        return { exists: false };
      }
      throw err;
    }
  }

  async getPresignedUploadUrl(_params: {
    objectKey: string;
    mimeType: string;
    maxSizeBytes: number;
    expiresIn?: number;
  }): Promise<PresignedUploadUrl> {
    void _params;
    throw new ServiceUnavailableException(
      'Presigned uploads require STORAGE_DRIVER=s3 (MinIO). Local disk storage does not support browser direct upload.',
    );
  }

  async getPresignedDownloadUrl(_params: {
    objectKey: string;
    expiresIn?: number;
  }): Promise<PresignedDownloadUrl> {
    void _params;
    throw new ServiceUnavailableException(
      'Presigned downloads require STORAGE_DRIVER=s3 (MinIO). Use the Nest EDI viewer proxy with local storage.',
    );
  }
}
