export const STORAGE_PROVIDER = Symbol('STORAGE_PROVIDER');

export interface StoredObject {
  key: string;
  bucket?: string;
}

export interface StorageProvider {
  putObject(key: string, body: Buffer, contentType?: string): Promise<StoredObject>;
  getObject(key: string): Promise<Buffer>;
  deleteObject(key: string): Promise<void>;
}
