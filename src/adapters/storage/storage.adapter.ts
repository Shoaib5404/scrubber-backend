export const STORAGE_PROVIDER = Symbol('STORAGE_PROVIDER');

export interface StoredObject {
  key: string;
  bucket?: string;
}

export interface PresignedUploadUrl {
  url: string;
  objectKey: string;
  expiresIn: number;
  headers?: Record<string, string>;
}

export interface PresignedDownloadUrl {
  url: string;
  expiresIn: number;
}

export interface StorageObjectHead {
  exists: boolean;
  contentType?: string;
  contentLength?: number;
}

/**
 * Object storage adapter — local disk or S3-compatible (MinIO).
 * Presigned URLs require an S3-compatible driver; all buckets stay private.
 */
export interface StorageProvider {
  putObject(key: string, body: Buffer, contentType?: string): Promise<StoredObject>;
  getObject(key: string): Promise<Buffer>;
  deleteObject(key: string): Promise<void>;
  headObject(key: string): Promise<StorageObjectHead>;
  getPresignedUploadUrl(params: {
    objectKey: string;
    mimeType: string;
    maxSizeBytes: number;
    expiresIn?: number;
  }): Promise<PresignedUploadUrl>;
  getPresignedDownloadUrl(params: {
    objectKey: string;
    expiresIn?: number;
  }): Promise<PresignedDownloadUrl>;
}
