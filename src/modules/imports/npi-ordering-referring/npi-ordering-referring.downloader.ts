import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NpiOrderingReferringSync } from '@prisma/client';
import AdmZip from 'adm-zip';
import { randomUUID } from 'crypto';
import { createWriteStream, Dirent, existsSync, readdirSync, statSync } from 'fs';
import { copyFile, mkdir, readdir, rm, stat, unlink } from 'fs/promises';
import * as path from 'path';
import { Readable } from 'stream';
import { finished } from 'stream/promises';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { normalizeHeader } from '../import.utils';
import { countNpiCsvDataRows, readNpiCsvHeaderRow } from './npi-ordering-referring-csv.util';
import {
  formatBytes,
  isReleaseDateFolderName,
  parseCsvFilenameDate,
  resolveNpiImportDirectory,
  standardCsvFilename,
} from './npi-ordering-referring.helpers';
import { NpiFetchProgress, OrderAndReferringApiClient } from './order-and-referring-api.client';

const REQUIRED_CSV_COLUMNS = ['npi', 'last_name', 'first_name'] as const;
const MIN_DOWNLOAD_TIMEOUT_SECONDS = 60;
const SYNC_STATUS_PENDING = 'pending';
const SYNC_STATUS_DOWNLOADED = 'downloaded';
const SYNC_STATUS_IMPORTED = 'imported';
const SYNC_STATUS_FAILED = 'failed';

export const NpiSyncStatus = {
  PENDING: SYNC_STATUS_PENDING,
  DOWNLOADED: SYNC_STATUS_DOWNLOADED,
  IMPORTED: SYNC_STATUS_IMPORTED,
  FAILED: SYNC_STATUS_FAILED,
} as const;

export interface NpiOrderingReferringFetchResult {
  skipped: boolean;
  reason?: string;
  sync?: NpiOrderingReferringSync;
  csvPath?: string;
  datasetReleaseDate?: string;
}

interface ResolvedExtractCsv {
  csvPath: string;
  sourceName: string;
  releaseDate: string;
}

/**
 * Port of Laravel App\Services\CmsRegistry\NpiOrderingReferringDownloader. Downloads the CMS
 * "Order and Referring" zip, extracts it (adm-zip, in lieu of PHP ZipArchive), resolves the
 * newest dated CSV inside, stores it under the configured import directory, validates headers,
 * prunes old local CSVs, and records an `npi_ordering_referring_syncs` row.
 */
@Injectable()
export class NpiOrderingReferringDownloader {
  constructor(
    private readonly apiClient: OrderAndReferringApiClient,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async fetch(
    force: boolean,
    onProgress?: NpiFetchProgress,
  ): Promise<NpiOrderingReferringFetchResult> {
    const progress = (message: string) => onProgress?.(message);

    progress(
      force
        ? 'Starting CMS fetch (force mode: will re-download even if already synced).'
        : 'Starting CMS fetch...',
    );

    const tempRoot = path.resolve(process.cwd(), 'storage/cms/npi-ordering-referring', randomUUID());
    const zipPath = path.join(tempRoot, 'Order and Referring.zip');
    const extractPath = path.join(tempRoot, 'extracted');
    const importDirectory = this.importDirectory();

    await mkdir(tempRoot, { recursive: true });
    await mkdir(importDirectory, { recursive: true });

    progress(`Temp workspace: ${tempRoot}`);

    let sync: NpiOrderingReferringSync | null = null;

    try {
      const identifiers = await this.apiClient.resolveDownloadIdentifiers(onProgress);
      const zipRequest = await this.apiClient.requestZipDownload(
        identifiers.releaseNodeId,
        identifiers.fileId,
        onProgress,
      );

      await this.downloadZip(zipRequest.downloadPath, zipPath, progress);
      await this.extractZip(zipPath, extractPath, progress);

      const resolved = this.resolveLatestCsvFromExtract(extractPath);
      const releaseDate = resolved.releaseDate;

      progress(`Latest dataset release date in zip: ${releaseDate}`);
      progress(`Source CSV in zip: ${resolved.sourceName}`);

      if (!force && (await this.isAlreadySynced(releaseDate))) {
        progress(`Skipping: release ${releaseDate} is already recorded in sync table.`);
        return {
          skipped: true,
          reason: `Dataset release ${releaseDate} is already synced.`,
          datasetReleaseDate: releaseDate,
        };
      }

      const filename = standardCsvFilename(releaseDate);
      const targetPath = path.join(importDirectory, filename);

      if (!force && (await this.pathExists(targetPath))) {
        progress(`Skipping: local file already exists (${filename}).`);
        return {
          skipped: true,
          reason: `CSV already exists for release ${releaseDate}.`,
          csvPath: targetPath,
          datasetReleaseDate: releaseDate,
        };
      }

      progress(`Copying CSV to import directory as ${filename}...`);
      await copyFile(resolved.csvPath, targetPath);

      progress('Validating CSV headers (NPI, LAST_NAME, FIRST_NAME)...');
      await this.validateCsvHeaders(targetPath);

      progress('Counting CSV data rows...');
      const rowCount = await countNpiCsvDataRows(targetPath);
      progress(`CSV data rows: ${rowCount.toLocaleString('en-US')}`);

      await this.pruneOldCsvFiles(importDirectory, filename, progress);

      const fileSize = (await stat(targetPath)).size;
      progress(`Stored CSV size: ${formatBytes(fileSize)}`);

      const syncData = {
        cmsReleaseNodeId: identifiers.releaseNodeId,
        cmsFileId: identifiers.fileId,
        zipCacheKey: zipRequest.zipCacheKey,
        zipUrl: zipRequest.downloadPath,
        sourceCsvName: resolved.sourceName,
        storedCsvFilename: filename,
        storedCsvPath: this.relativeImportPath(targetPath),
        fileSizeBytes: fileSize,
        rowCount,
        status: SYNC_STATUS_DOWNLOADED,
        errorMessage: null,
        downloadedAt: new Date(),
      };

      sync = await this.prisma.npiOrderingReferringSync.upsert({
        where: { datasetReleaseDate: this.toUtcDate(releaseDate) },
        create: { datasetReleaseDate: this.toUtcDate(releaseDate), ...syncData },
        update: syncData,
      });

      progress('Fetch completed successfully. Sync record saved (status: downloaded).');

      return {
        skipped: false,
        sync,
        csvPath: targetPath,
        datasetReleaseDate: releaseDate,
      };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      progress(`Fetch failed: ${message}`);

      if (sync !== null) {
        await this.prisma.npiOrderingReferringSync.update({
          where: { id: sync.id },
          data: { status: SYNC_STATUS_FAILED, errorMessage: message },
        });
      }

      throw e;
    } finally {
      progress('Cleaning up temp workspace...');
      await rm(tempRoot, { recursive: true, force: true });
    }
  }

  private async downloadZip(
    url: string,
    destination: string,
    progress: (message: string) => void,
  ): Promise<void> {
    const timeoutSeconds = Math.max(
      MIN_DOWNLOAD_TIMEOUT_SECONDS,
      this.config.get<number>('NPI_ORDERING_REFERRING_DOWNLOAD_TIMEOUT_SECONDS', 600),
    );

    progress('Downloading CMS zip archive (this may take several minutes)...');
    progress(`Zip URL: ${url}`);

    let response: Response;
    try {
      response = await fetch(url, { signal: AbortSignal.timeout(timeoutSeconds * 1000) });
    } catch (e) {
      throw new Error(
        `Failed to download CMS zip archive: ${e instanceof Error ? e.message : String(e)}`,
      );
    }

    if (!response.ok || response.body === null) {
      throw new Error('Failed to download CMS zip archive.');
    }

    const fileStream = createWriteStream(destination);
    await finished(Readable.fromWeb(response.body as never).pipe(fileStream));

    const downloaded = await stat(destination).catch(() => null);
    if (downloaded === null || downloaded.size === 0) {
      throw new Error('Failed to download CMS zip archive.');
    }

    progress(`Zip downloaded: ${formatBytes(downloaded.size)}`);
  }

  private async extractZip(
    zipPath: string,
    extractPath: string,
    progress: (message: string) => void,
  ): Promise<void> {
    progress('Extracting zip archive...');
    await mkdir(extractPath, { recursive: true });

    let zip: AdmZip;
    try {
      zip = new AdmZip(zipPath);
    } catch {
      throw new Error('Unable to open downloaded CMS zip archive.');
    }

    try {
      zip.extractAllTo(extractPath, true);
    } catch {
      throw new Error('Unable to extract CMS zip archive.');
    }

    progress(`Zip extracted to: ${extractPath}`);
  }

  /** Laravel NpiOrderingReferringDownloader::resolveLatestCsvFromExtract. */
  private resolveLatestCsvFromExtract(extractPath: string): ResolvedExtractCsv {
    const datasetRoot = this.findOrderAndReferringRoot(extractPath);
    if (datasetRoot === null) {
      throw new Error('Could not find "Order and Referring" directory inside the CMS zip.');
    }

    const dateFolders = new Map<string, string>();

    for (const entry of readdirSync(datasetRoot, { withFileTypes: true })) {
      if (!entry.isDirectory() || !isReleaseDateFolderName(entry.name)) {
        continue;
      }

      const directory = path.join(datasetRoot, entry.name);
      const csvFiles = readdirSync(directory).filter((name) => name.toLowerCase().endsWith('.csv'));

      if (csvFiles.length === 0) {
        continue;
      }

      dateFolders.set(entry.name, path.join(directory, csvFiles[0] as string));
    }

    if (dateFolders.size === 0) {
      throw new Error('No dated CSV directory found under "Order and Referring".');
    }

    const releaseDate = [...dateFolders.keys()].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0))[0] as string;
    const csvPath = dateFolders.get(releaseDate) as string;

    return { csvPath, sourceName: path.basename(csvPath), releaseDate };
  }

  /** Laravel NpiOrderingReferringDownloader::findOrderAndReferringRoot. */
  private findOrderAndReferringRoot(extractPath: string): string | null {
    const direct = path.join(extractPath, 'Order and Referring');
    if (existsSync(direct) && statSync(direct).isDirectory()) {
      return direct;
    }

    const stack: string[] = [extractPath];
    while (stack.length > 0) {
      const current = stack.pop() as string;
      let entries: Dirent[];
      try {
        entries = readdirSync(current, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries) {
        if (!entry.isDirectory()) {
          continue;
        }
        const full = path.join(current, entry.name);
        if (entry.name.toLowerCase() === 'order and referring') {
          return full;
        }
        stack.push(full);
      }
    }

    return null;
  }

  private async validateCsvHeaders(csvPath: string): Promise<void> {
    const headers = await readNpiCsvHeaderRow(csvPath);
    if (headers.length === 0) {
      throw new Error('Downloaded CSV is empty.');
    }

    const normalized = new Set(headers.map((header) => normalizeHeader(String(header ?? ''))));

    for (const required of REQUIRED_CSV_COLUMNS) {
      if (!normalized.has(required)) {
        throw new Error(`Downloaded CSV is missing required column: ${required}.`);
      }
    }
  }

  /** Laravel NpiOrderingReferringDownloader::pruneOldCsvFiles. */
  private async pruneOldCsvFiles(
    importDirectory: string,
    keepFilename: string,
    progress: (message: string) => void,
  ): Promise<void> {
    const maxFiles = Math.max(
      1,
      this.config.get<number>('NPI_ORDERING_REFERRING_MAX_LOCAL_CSV_FILES', 2),
    );

    const files = (await readdir(importDirectory)).filter((name) => name.toLowerCase().endsWith('.csv'));

    const datedFiles = new Map<string, string>();
    for (const filename of files) {
      const releaseDate = parseCsvFilenameDate(filename);
      if (releaseDate === null) {
        continue;
      }
      datedFiles.set(releaseDate, filename);
    }

    if (datedFiles.size === 0) {
      progress('No dated local CSV files to prune.');
      return;
    }

    const sortedDates = [...datedFiles.keys()].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
    const keepFilenames = new Set(
      sortedDates.slice(0, maxFiles).map((date) => datedFiles.get(date) as string),
    );
    keepFilenames.add(keepFilename);

    progress(`Keeping local CSV file(s): ${[...keepFilenames].join(', ')}`);

    const deleted: string[] = [];
    for (const filename of files) {
      if (keepFilenames.has(filename)) {
        continue;
      }
      await unlink(path.join(importDirectory, filename));
      deleted.push(filename);
    }

    if (deleted.length === 0) {
      progress('No old local CSV files to delete.');
    } else {
      progress(`Deleted old local CSV file(s): ${deleted.join(', ')}`);
    }
  }

  private async isAlreadySynced(releaseDateYmd: string): Promise<boolean> {
    const existing = await this.prisma.npiOrderingReferringSync.findUnique({
      where: { datasetReleaseDate: this.toUtcDate(releaseDateYmd) },
    });
    return (
      existing !== null &&
      (existing.status === SYNC_STATUS_DOWNLOADED || existing.status === SYNC_STATUS_IMPORTED)
    );
  }

  private importDirectory(): string {
    return resolveNpiImportDirectory(
      this.config.get<string>('NPI_ORDERING_REFERRING_IMPORT_DIRECTORY', 'import/NPI_Ordering_Referring'),
    );
  }

  private relativeImportPath(absolutePath: string): string {
    const base = `${process.cwd()}${path.sep}`;
    return absolutePath.startsWith(base)
      ? absolutePath.slice(base.length).replace(/\\/g, '/')
      : absolutePath.replace(/\\/g, '/');
  }

  private toUtcDate(ymd: string): Date {
    const [year, month, day] = ymd.split('-').map(Number);
    return new Date(Date.UTC(year as number, (month as number) - 1, day as number));
  }

  private async pathExists(filePath: string): Promise<boolean> {
    try {
      await stat(filePath);
      return true;
    } catch {
      return false;
    }
  }
}
