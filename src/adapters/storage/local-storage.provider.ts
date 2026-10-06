import { Injectable, Logger } from '@nestjs/common';
import { mkdir, readFile, unlink, writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import type { StorageProvider, StoredObject } from './storage.adapter';

@Injectable()
export class LocalStorageProvider implements StorageProvider {
  private readonly logger = new Logger(LocalStorageProvider.name);
  private readonly root: string;

  constructor(root = './storage/edi') {
    this.root = root;
  }

  private resolve(key: string): string {
    return join(this.root, key);
  }

  async putObject(key: string, body: Buffer): Promise<StoredObject> {
    const path = this.resolve(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, body);
    this.logger.debug(`Stored object locally at ${path}`);
    return { key };
  }

  async getObject(key: string): Promise<Buffer> {
    return readFile(this.resolve(key));
  }

  async deleteObject(key: string): Promise<void> {
    await unlink(this.resolve(key));
  }
}
