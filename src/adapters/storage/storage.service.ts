import { Inject, Injectable } from '@nestjs/common';
import { STORAGE_PROVIDER, type StorageProvider, type StoredObject } from './storage.adapter';

@Injectable()
export class StorageService {
  constructor(
    @Inject(STORAGE_PROVIDER)
    private readonly provider: StorageProvider,
  ) {}

  putObject(key: string, body: Buffer, contentType?: string): Promise<StoredObject> {
    return this.provider.putObject(key, body, contentType);
  }

  getObject(key: string): Promise<Buffer> {
    return this.provider.getObject(key);
  }

  deleteObject(key: string): Promise<void> {
    return this.provider.deleteObject(key);
  }
}
