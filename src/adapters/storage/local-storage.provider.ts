import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { mkdir, readFile, unlink, writeFile } from 'fs/promises';
import { dirname, join, resolve, sep } from 'path';
import type { StorageProvider, StoredObject } from './storage.adapter';
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
}
