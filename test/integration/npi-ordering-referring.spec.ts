import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { mkdtempSync, writeFileSync } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { PrismaModule } from '../../src/common/prisma/prisma.module';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { loadEnvFrom } from '../../src/config';
import { LookupCacheService } from '../../src/modules/cache/lookup-cache.service';
import { ImportsModule } from '../../src/modules/imports/imports.module';
import { NpiOrderingReferringSyncCommand } from '../../src/modules/imports/npi-ordering-referring/npi-ordering-referring-sync.command';
import {
  NpiOrderingReferringDownloader,
  NpiOrderingReferringFetchResult,
  NpiSyncStatus,
} from '../../src/modules/imports/npi-ordering-referring/npi-ordering-referring.downloader';
import {
  defaultNpiImportFilePath,
  formatBytes,
  isReleaseDateFolderName,
  parseCsvFilenameDate,
  standardCsvFilename,
  yesterdayUtcYmd,
} from '../../src/modules/imports/npi-ordering-referring/npi-ordering-referring.helpers';
import { NpiOrderingReferringImportService } from '../../src/modules/imports/npi-ordering-referring/npi-ordering-referring.import.service';

/**
 * SP-8 Task 20 — CMS/NPI ordering-referring sync. Port of Laravel
 * FetchNpiOrderingReferrings / ImportNpiOrderingReferrings / SyncNpiOrderingReferrings +
 * NpiOrderingReferringDownloader / OrderAndReferringApiClient. HTTP (CMS data-viewer/
 * download-request/media APIs and the zip download itself) is never hit in these tests — the
 * downloader is swapped for a jest mock in the sync-command suite instead of mocking `fetch`
 * globally, since `OrderAndReferringApiClient` already isolates all HTTP calls behind it.
 *
 * Schedule note: daily 06:00 America/New_York sync is gated by `NPI_SYNC_SCHEDULE_ENABLED`
 * (default false; Laravel schedule was commented). When true, SchedulerHost runs the sync service.
 */

function envOverrides(config: Record<string, unknown>) {
  return loadEnvFrom({
    ...config,
    DATABASE_URL:
      process.env.DATABASE_URL ?? 'postgresql://scrubber:scrubber@localhost:5433/scrubber?schema=public',
    JWT_SECRET: process.env.JWT_SECRET ?? 'change-me-in-production-min-32-chars',
    JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET ?? 'change-me-refresh-in-production-min-32',
    REDIS_URL: process.env.REDIS_URL ?? 'redis://localhost:6381',
  });
}

function tempDir(): string {
  return mkdtempSync(path.join(os.tmpdir(), 'scrubber-npi-ordering-referring-'));
}

function writeCsv(dir: string, name: string, body: string): string {
  const filePath = path.join(dir, name);
  writeFileSync(filePath, body, 'utf8');
  return filePath;
}

describe('npi-ordering-referring.helpers (pure, no DB)', () => {
  describe('standardCsvFilename / parseCsvFilenameDate', () => {
    it('formats F_j_Y (no leading zero on day) from a Y-m-d release date', () => {
      expect(standardCsvFilename('2026-01-01')).toBe('January_1_2026.csv');
      expect(standardCsvFilename('2026-10-08')).toBe('October_8_2026.csv');
      expect(standardCsvFilename('2026-12-25')).toBe('December_25_2026.csv');
    });

    it('round-trips back to the original Y-m-d via parseCsvFilenameDate', () => {
      for (const ymd of ['2026-01-01', '2026-03-08', '2026-11-01', '2026-12-31']) {
        expect(parseCsvFilenameDate(standardCsvFilename(ymd))).toBe(ymd);
      }
    });

    it('is stable across a US DST transition date regardless of a non-UTC process TZ', () => {
      // 2026-03-08 is the America/New_York "spring forward" date; a naive implementation that
      // parsed/formatted via local-timezone Date methods could roll this to March 7 or 9
      // depending on the host's TZ. standardCsvFilename is UTC-date-only, so it must not.
      const originalTz = process.env.TZ;
      try {
        process.env.TZ = 'America/New_York';
        expect(standardCsvFilename('2026-03-08')).toBe('March_8_2026.csv');
        process.env.TZ = 'Pacific/Kiritimati'; // UTC+14, far ahead of UTC
        expect(standardCsvFilename('2026-03-08')).toBe('March_8_2026.csv');
      } finally {
        process.env.TZ = originalTz;
      }
    });

    it('returns null for an unparseable filename', () => {
      expect(parseCsvFilenameDate('not-a-date.csv')).toBeNull();
      expect(parseCsvFilenameDate('Marchember_8_2026.csv')).toBeNull();
      expect(parseCsvFilenameDate('February_30_2026.csv')).toBeNull(); // invalid calendar date
    });

    it('throws on an invalid release date', () => {
      expect(() => standardCsvFilename('2026-02-30')).toThrow();
      expect(() => standardCsvFilename('not-a-date')).toThrow();
    });
  });

  describe('isReleaseDateFolderName', () => {
    it('accepts only well-formed, valid Y-m-d folder names', () => {
      expect(isReleaseDateFolderName('2026-03-08')).toBe(true);
      expect(isReleaseDateFolderName('2026-13-01')).toBe(false);
      expect(isReleaseDateFolderName('2026-02-30')).toBe(false);
      expect(isReleaseDateFolderName('not-a-folder')).toBe(false);
    });
  });

  describe('formatBytes', () => {
    it('scales to the largest sensible unit', () => {
      expect(formatBytes(500)).toBe('500 B');
      expect(formatBytes(2048)).toBe('2 KB');
      expect(formatBytes(5 * 1_048_576)).toBe('5 MB');
      expect(formatBytes(2 * 1_073_741_824)).toBe('2 GB');
    });
  });

  describe('yesterdayUtcYmd', () => {
    it('subtracts one UTC calendar day, unaffected by DST-adjacent dates', () => {
      jest.useFakeTimers({ now: new Date('2026-03-09T04:30:00Z') });
      try {
        expect(yesterdayUtcYmd()).toBe('2026-03-08');
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe('defaultNpiImportFilePath', () => {
    it('joins the import directory with the standardized filename for an explicit date', () => {
      expect(defaultNpiImportFilePath('import/NPI_Ordering_Referring', '2026-01-01')).toBe(
        path.join('import/NPI_Ordering_Referring', 'January_1_2026.csv'),
      );
    });

    it('defaults to yesterday (UTC) when no date is given', () => {
      jest.useFakeTimers({ now: new Date('2026-01-02T00:00:00Z') });
      try {
        expect(defaultNpiImportFilePath('import/dir')).toBe(path.join('import/dir', 'January_1_2026.csv'));
      } finally {
        jest.useRealTimers();
      }
    });
  });
});

describe('npi-ordering-referrings:import (SP-8 Task 20)', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let importService: NpiOrderingReferringImportService;
  let invalidateTable: jest.Mock;

  beforeAll(async () => {
    invalidateTable = jest.fn().mockResolvedValue(undefined);

    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, validate: envOverrides }),
        PrismaModule,
        ImportsModule,
      ],
    })
      .overrideProvider(LookupCacheService)
      .useValue({ invalidateTable })
      .compile();

    prisma = moduleRef.get(PrismaService);
    importService = moduleRef.get(NpiOrderingReferringImportService);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  const testNpis = ['9999000001', '9999000002', '9999000003'];

  afterEach(async () => {
    await prisma.npiOrderingReferring.deleteMany({ where: { npi: { in: testNpis } } });
  });

  it('upserts by NPI, deactivates rows not seen in this import, and invalidates the lookup cache', async () => {
    invalidateTable.mockClear();

    // Pre-existing active row NOT present in the new CSV — must be deactivated.
    await prisma.npiOrderingReferring.create({
      data: {
        npi: testNpis[2] as string,
        firstName: 'Old',
        lastName: 'Timer',
        active: true,
        lastSeenAt: new Date('2000-01-01T00:00:00Z'),
      },
    });

    const dir = tempDir();
    const csvPath = writeCsv(
      dir,
      'npi.csv',
      ['NPI,LAST_NAME,FIRST_NAME', `${testNpis[0]},Smith,Jane`, `${testNpis[1]},Doe,John`, ','].join('\n'),
    );

    const stats = await importService.importFromFile(csvPath, { chunk: 2 });

    expect(stats.processed).toBe(3); // 2 valid rows + 1 blank-NPI row
    expect(stats.upserted).toBe(2);
    expect(stats.skippedBlankNpi).toBe(1);
    expect(stats.deactivated).toBeGreaterThanOrEqual(1);

    const rows = await prisma.npiOrderingReferring.findMany({
      where: { npi: { in: testNpis } },
      orderBy: { npi: 'asc' },
    });
    expect(rows).toHaveLength(3);

    const [row1, row2, row3] = rows;
    expect(row1).toMatchObject({ npi: testNpis[0], firstName: 'Jane', lastName: 'Smith', active: true });
    expect(row2).toMatchObject({ npi: testNpis[1], firstName: 'John', lastName: 'Doe', active: true });
    expect(row3).toMatchObject({ npi: testNpis[2], active: false });

    expect(invalidateTable).toHaveBeenCalledWith('npi_ordering_referrings');
  });

  it('re-activates a previously-deactivated NPI that reappears in a later import', async () => {
    invalidateTable.mockClear();

    await prisma.npiOrderingReferring.create({
      data: {
        npi: testNpis[0] as string,
        firstName: 'Was',
        lastName: 'Inactive',
        active: false,
        lastSeenAt: new Date('2000-01-01T00:00:00Z'),
      },
    });

    const dir = tempDir();
    const csvPath = writeCsv(dir, 'npi.csv', ['NPI,LAST_NAME,FIRST_NAME', `${testNpis[0]},New,Name`].join('\n'));

    const stats = await importService.importFromFile(csvPath, { chunk: 10 });
    expect(stats.upserted).toBe(1);

    const row = await prisma.npiOrderingReferring.findUnique({ where: { npi: testNpis[0] as string } });
    expect(row).toMatchObject({ firstName: 'Name', lastName: 'New', active: true });
  });

  it('resolves NPI/LAST_NAME/FIRST_NAME columns regardless of header order', async () => {
    invalidateTable.mockClear();

    const dir = tempDir();
    // Header order deliberately scrambled vs. the Laravel-default NPI/LAST_NAME/FIRST_NAME.
    const csvPath = writeCsv(
      dir,
      'npi.csv',
      ['FIRST_NAME,NPI,LAST_NAME', `Jane,${testNpis[0]},Smith`].join('\n'),
    );

    await importService.importFromFile(csvPath, { chunk: 10 });

    const row = await prisma.npiOrderingReferring.findUnique({ where: { npi: testNpis[0] as string } });
    expect(row).toMatchObject({ firstName: 'Jane', lastName: 'Smith', active: true });
  });

  it('throws for a missing file', async () => {
    await expect(
      importService.importFromFile(path.join(tempDir(), 'does-not-exist.csv')),
    ).rejects.toThrow();
  });
});

describe('npi-ordering-referrings:sync (SP-8 Task 20, mocked downloader)', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let syncCommand: NpiOrderingReferringSyncCommand;
  let importService: NpiOrderingReferringImportService;
  let fetchMock: jest.Mock<Promise<NpiOrderingReferringFetchResult>, [boolean, ((m: string) => void)?]>;
  let invalidateTable: jest.Mock;

  const testNpis = ['9999100001', '9999100002'];

  beforeAll(async () => {
    invalidateTable = jest.fn().mockResolvedValue(undefined);
    fetchMock = jest.fn();

    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, validate: envOverrides }),
        PrismaModule,
        ImportsModule,
      ],
    })
      .overrideProvider(LookupCacheService)
      .useValue({ invalidateTable })
      .overrideProvider(NpiOrderingReferringDownloader)
      .useValue({ fetch: fetchMock })
      .compile();

    prisma = moduleRef.get(PrismaService);
    syncCommand = moduleRef.get(NpiOrderingReferringSyncCommand);
    importService = moduleRef.get(NpiOrderingReferringImportService);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  beforeEach(() => {
    process.exitCode = 0;
  });

  afterEach(async () => {
    process.exitCode = 0;
    fetchMock.mockReset();
    await prisma.npiOrderingReferring.deleteMany({ where: { npi: { in: testNpis } } });
    await prisma.npiOrderingReferringSync.deleteMany({
      where: { datasetReleaseDate: { in: [new Date('2026-04-01T00:00:00Z'), new Date('2026-04-02T00:00:00Z'), new Date('2026-04-03T00:00:00Z')] } },
    });
  });

  it('downloaded -> imported: runs the import and marks the sync row imported', async () => {
    const sync = await prisma.npiOrderingReferringSync.create({
      data: {
        datasetReleaseDate: new Date('2026-04-01T00:00:00Z'),
        storedCsvFilename: 'April_1_2026.csv',
        storedCsvPath: 'import/NPI_Ordering_Referring/April_1_2026.csv',
        status: NpiSyncStatus.DOWNLOADED,
        rowCount: 0,
      },
    });

    const dir = tempDir();
    const csvPath = writeCsv(
      dir,
      'April_1_2026.csv',
      ['NPI,LAST_NAME,FIRST_NAME', `${testNpis[0]},Smith,Jane`].join('\n'),
    );

    fetchMock.mockResolvedValue({
      skipped: false,
      sync,
      csvPath,
      datasetReleaseDate: '2026-04-01',
    });

    await syncCommand.run([], {});

    expect(process.exitCode).toBe(0);

    const updated = await prisma.npiOrderingReferringSync.findUnique({ where: { id: sync.id } });
    expect(updated).toMatchObject({ status: NpiSyncStatus.IMPORTED, errorMessage: null });
    expect(updated?.importedAt).not.toBeNull();

    const row = await prisma.npiOrderingReferring.findUnique({ where: { npi: testNpis[0] as string } });
    expect(row).toMatchObject({ firstName: 'Jane', lastName: 'Smith', active: true });
  });

  it('skipped (already synced): does not run the import', async () => {
    const importSpy = jest.spyOn(importService, 'importFromFile');

    fetchMock.mockResolvedValue({
      skipped: true,
      reason: 'Dataset release 2026-04-02 is already synced.',
      datasetReleaseDate: '2026-04-02',
    });

    await syncCommand.run([], {});

    expect(process.exitCode).toBe(0);
    expect(importSpy).not.toHaveBeenCalled();
    importSpy.mockRestore();
  });

  it('downloaded -> failed: marks the sync row failed when import throws', async () => {
    const sync = await prisma.npiOrderingReferringSync.create({
      data: {
        datasetReleaseDate: new Date('2026-04-03T00:00:00Z'),
        storedCsvFilename: 'April_3_2026.csv',
        storedCsvPath: 'import/NPI_Ordering_Referring/April_3_2026.csv',
        status: NpiSyncStatus.DOWNLOADED,
        rowCount: 0,
      },
    });

    fetchMock.mockResolvedValue({
      skipped: false,
      sync,
      csvPath: path.join(tempDir(), 'does-not-exist.csv'),
      datasetReleaseDate: '2026-04-03',
    });

    await syncCommand.run([], {});

    expect(process.exitCode).toBe(1);

    const updated = await prisma.npiOrderingReferringSync.findUnique({ where: { id: sync.id } });
    expect(updated).toMatchObject({ status: NpiSyncStatus.FAILED, errorMessage: 'Import command failed.' });
  });

  it('skip-import: downloads but does not import', async () => {
    const importSpy = jest.spyOn(importService, 'importFromFile');

    const sync = await prisma.npiOrderingReferringSync.create({
      data: {
        datasetReleaseDate: new Date('2026-04-01T00:00:00Z'),
        storedCsvFilename: 'April_1_2026.csv',
        storedCsvPath: 'import/NPI_Ordering_Referring/April_1_2026.csv',
        status: NpiSyncStatus.DOWNLOADED,
        rowCount: 0,
      },
    });

    fetchMock.mockResolvedValue({
      skipped: false,
      sync,
      csvPath: 'irrelevant.csv',
      datasetReleaseDate: '2026-04-01',
    });

    await syncCommand.run([], { skipImport: true });

    expect(process.exitCode).toBe(0);
    expect(importSpy).not.toHaveBeenCalled();
    importSpy.mockRestore();

    const updated = await prisma.npiOrderingReferringSync.findUnique({ where: { id: sync.id } });
    expect(updated?.status).toBe(NpiSyncStatus.DOWNLOADED);
  });
});
