import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type NpiFetchProgress = (message: string) => void;

export interface ResolvedDownloadIdentifiers {
  releaseNodeId: string;
  fileId: string;
}

export interface ZipDownloadRequestResult {
  status: string;
  downloadPath: string;
  zipCacheKey: string | null;
  date: string | null;
}

const CMS_DATA_VIEWER_URL = 'https://data.cms.gov/data-api/v1/dataset/%s/data-viewer';
const CMS_DOWNLOAD_REQUEST_URL = 'https://data.cms.gov/data-api/v1/download-request';
const CMS_MEDIA_URL = 'https://data.cms.gov/jsonapi/media/primary_dataset_file/%s';
const JSON_REQUEST_TIMEOUT_MS = 120_000;

/** Narrow `unknown` JSON into a plain object for `data_get`-style optional-path traversal. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Laravel `data_get($payload, 'a.b.c')` — dot-path lookup through nested plain objects only. */
function dataGet(payload: unknown, dotPath: string): unknown {
  return dotPath.split('.').reduce<unknown>((current, segment) => {
    return isPlainObject(current) ? current[segment] : undefined;
  }, payload);
}

/**
 * Port of Laravel App\Services\CmsRegistry\OrderAndReferringApiClient.
 * Resolves the current CMS "Order and Referring" dataset release/file identifiers and requests
 * the pre-built download zip, polling until CMS reports the build COMPLETE.
 */
@Injectable()
export class OrderAndReferringApiClient {
  private readonly logger = new Logger(OrderAndReferringApiClient.name);

  constructor(private readonly config: ConfigService) {}

  private progress(onProgress: NpiFetchProgress | undefined, message: string): void {
    onProgress?.(message);
  }

  async getDataViewer(): Promise<unknown> {
    const datasetTypeId = this.config.get<string>('NPI_ORDERING_REFERRING_CMS_DATASET_TYPE_ID', '');
    const url = CMS_DATA_VIEWER_URL.replace('%s', datasetTypeId);
    return this.getJson(url);
  }

  /** Laravel OrderAndReferringApiClient::resolveDownloadIdentifiers. */
  async resolveDownloadIdentifiers(
    onProgress?: NpiFetchProgress,
  ): Promise<ResolvedDownloadIdentifiers> {
    this.progress(onProgress, 'Resolving CMS dataset identifiers from data-viewer API...');

    const viewer = await this.getDataViewer();
    const entities = dataGet(viewer, 'meta.data_file_meta_data._entities');

    const releaseNodeId = this.firstEntityUuid(entities, 'node:dataset');
    const mediaId = this.firstEntityUuid(entities, 'media:primary_dataset_file');

    if (releaseNodeId === null || mediaId === null) {
      throw new Error(
        'Unable to resolve CMS release or media identifiers from data-viewer response.',
      );
    }

    this.progress(onProgress, `Resolved release node ID: ${releaseNodeId}`);
    this.progress(onProgress, `Resolved media ID: ${mediaId}`);

    const fileId = await this.resolveFileIdFromMedia(mediaId, onProgress);
    this.progress(onProgress, `Resolved file ID: ${fileId}`);

    return { releaseNodeId, fileId };
  }

  /** Laravel OrderAndReferringApiClient::requestZipDownload. */
  async requestZipDownload(
    releaseNodeId: string,
    fileId: string,
    onProgress?: NpiFetchProgress,
  ): Promise<ZipDownloadRequestResult> {
    const maxAttempts = Math.max(
      1,
      this.config.get<number>('NPI_ORDERING_REFERRING_DOWNLOAD_REQUEST_ATTEMPTS', 30),
    );
    const pollSeconds = Math.max(
      1,
      this.config.get<number>('NPI_ORDERING_REFERRING_DOWNLOAD_REQUEST_POLL_SECONDS', 2),
    );

    this.progress(onProgress, 'Requesting CMS zip build (download-request API)...');

    let lastStatus = 'unknown';

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const response = await this.getJson(CMS_DOWNLOAD_REQUEST_URL, {
        datasets: releaseNodeId,
        files: fileId,
      });

      const status = String((isPlainObject(response) ? response.status : '') ?? '').toUpperCase();
      lastStatus = status || 'unknown';

      this.progress(onProgress, `Zip build status (attempt ${attempt}/${maxAttempts}): ${status}`);

      const downloadPath = isPlainObject(response) ? response.download_path : undefined;
      if (status === 'COMPLETE' && typeof downloadPath === 'string' && downloadPath !== '') {
        const zipCacheKeyRaw = isPlainObject(response) ? response.zipCacheKey : undefined;
        const dateRaw = isPlainObject(response) ? response.date : undefined;
        const zipCacheKey = typeof zipCacheKeyRaw === 'string' ? zipCacheKeyRaw : null;

        this.progress(onProgress, `Zip ready. Cache key: ${zipCacheKey ?? 'n/a'}`);

        return {
          status,
          downloadPath,
          zipCacheKey,
          date: typeof dateRaw === 'string' ? dateRaw : null,
        };
      }

      if (status === 'FAILED') {
        throw new Error('CMS zip build failed.');
      }

      if (attempt < maxAttempts) {
        this.progress(onProgress, `Waiting ${pollSeconds}s before next zip status check...`);
        await this.sleep(pollSeconds * 1000);
      }
    }

    throw new Error(
      `CMS zip download was not ready after ${maxAttempts} attempts. Last status: ${lastStatus}`,
    );
  }

  /** Laravel OrderAndReferringApiClient::resolveFileIdFromMedia. */
  async resolveFileIdFromMedia(mediaId: string, onProgress?: NpiFetchProgress): Promise<string> {
    this.progress(onProgress, 'Fetching file ID from CMS media API...');

    const url = CMS_MEDIA_URL.replace('%s', mediaId);
    const payload = await this.getJson(url);
    const fileId = dataGet(payload, 'data.relationships.field_media_file.data.id');

    if (typeof fileId !== 'string' || fileId === '') {
      throw new Error('Unable to resolve CMS file identifier from media response.');
    }

    return fileId;
  }

  private firstEntityUuid(entities: unknown, key: string): string | null {
    const bucket = isPlainObject(entities) ? entities[key] : undefined;
    if (!isPlainObject(bucket)) {
      return null;
    }
    const uuid = Object.keys(bucket)[0];
    return typeof uuid === 'string' && uuid !== '' ? uuid : null;
  }

  private async getJson(url: string, query: Record<string, string> = {}): Promise<unknown> {
    const requestUrl = new URL(url);
    for (const [key, value] of Object.entries(query)) {
      requestUrl.searchParams.set(key, value);
    }

    let response: Response;
    try {
      response = await fetch(requestUrl, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(JSON_REQUEST_TIMEOUT_MS),
      });
    } catch (e) {
      throw new Error(`CMS API request failed: ${e instanceof Error ? e.message : String(e)}`);
    }

    if (!response.ok) {
      throw new Error(`CMS API request failed: HTTP ${response.status} ${response.statusText}`);
    }

    let json: unknown;
    try {
      json = await response.json();
    } catch {
      throw new Error('CMS API returned an invalid JSON payload.');
    }

    if (!isPlainObject(json)) {
      throw new Error('CMS API returned an invalid JSON payload.');
    }

    return json;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
