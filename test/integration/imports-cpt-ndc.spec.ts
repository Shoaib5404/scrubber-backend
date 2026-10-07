import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { mkdtempSync, writeFileSync } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { PrismaModule } from '../../src/common/prisma/prisma.module';
import { loadEnvFrom } from '../../src/config';
import { LookupCacheService } from '../../src/modules/cache/lookup-cache.service';
import { ImportsModule } from '../../src/modules/imports/imports.module';
import { CptCodesImportService } from '../../src/modules/imports/cpt-codes.import.service';
import { NdcCodesImportService } from '../../src/modules/imports/ndc-codes.import.service';
import { TaxonomyCodesImportService } from '../../src/modules/imports/taxonomy-codes.import.service';

describe('imports CPT / NDC / taxonomy (SP-8 Task 19 group 6)', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let cptImport: CptCodesImportService;
  let ndcImport: NdcCodesImportService;
  let taxonomyImport: TaxonomyCodesImportService;
  let invalidateTable: jest.Mock;

  beforeAll(async () => {
    invalidateTable = jest.fn().mockResolvedValue(undefined);

    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          validate: (config) =>
            loadEnvFrom({
              ...config,
              DATABASE_URL:
                process.env.DATABASE_URL ??
                'postgresql://scrubber:scrubber@localhost:5433/scrubber?schema=public',
              JWT_SECRET: process.env.JWT_SECRET ?? 'change-me-in-production-min-32-chars',
              JWT_REFRESH_SECRET:
                process.env.JWT_REFRESH_SECRET ?? 'change-me-refresh-in-production-min-32',
              REDIS_URL: process.env.REDIS_URL ?? 'redis://localhost:6381',
            }),
        }),
        PrismaModule,
        ImportsModule,
      ],
    })
      .overrideProvider(LookupCacheService)
      .useValue({ invalidateTable })
      .compile();

    prisma = moduleRef.get(PrismaService);
    cptImport = moduleRef.get(CptCodesImportService);
    ndcImport = moduleRef.get(NdcCodesImportService);
    taxonomyImport = moduleRef.get(TaxonomyCodesImportService);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  function tempFile(name: string, body: string): string {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'scrubber-import-g6-'));
    const filePath = path.join(dir, name);
    writeFileSync(filePath, body, 'utf8');
    return filePath;
  }

  it('cpt: CSV text import with merge upserts and syncs lookup cache', async () => {
    invalidateTable.mockClear();
    const filePath = tempFile('cpt.csv', '99213,Office visit\nXY\n');

    const result = await cptImport.importFromFile(filePath, {
      truncate: true,
      merge: true,
      chunk: 10,
      delimiter: ',',
    });

    expect(result.imported).toBe(0);
    expect(result.updated).toBeGreaterThanOrEqual(1);
    expect(result.skipped).toBeGreaterThanOrEqual(1);

    const row = await prisma.cptCode.findUnique({ where: { name: '99213' } });
    expect(row?.description).toBe('Office visit');
    expect(invalidateTable).toHaveBeenCalledWith('cpt_codes');

    await prisma.cptCode.deleteMany({ where: { name: '99213' } });
  });

  it('ndc: JSON import normalizes hyphenated NDC and invalidates cache', async () => {
    invalidateTable.mockClear();
    const filePath = tempFile(
      'ndc.json',
      JSON.stringify({
        codes: [{ ndc: '1234-5678-90', package_description: 'Test pkg' }],
      }),
    );

    const result = await ndcImport.importFromFile(filePath, { truncate: true, chunk: 100 });

    expect(result.upserted).toBe(1);
    expect(result.invalidNdc).toBe(0);

    const row = await prisma.ndcCode.findUnique({ where: { ndcDigits: '01234567890' } });
    expect(row?.ndc).toBe('01234-5678-90');
    expect(invalidateTable).toHaveBeenCalledWith('ndc_codes');

    await prisma.ndcCode.deleteMany({ where: { ndcDigits: '01234567890' } });
  });

  it('taxonomy: JSON import upserts valid NUCC code', async () => {
    invalidateTable.mockClear();
    const filePath = tempFile(
      'taxonomy.json',
      JSON.stringify({
        codes: [{ taxonomy_code: '207Q00000X', specialty_name: 'Family Medicine' }],
      }),
    );

    const result = await taxonomyImport.importFromFile(filePath, { truncate: true, chunk: 100 });

    expect(result.upserted).toBe(1);
    expect(result.invalid).toBe(0);

    const row = await prisma.taxonomyCode.findUnique({ where: { taxonomyCode: '207Q00000X' } });
    expect(row?.specialtyName).toBe('Family Medicine');
    expect(invalidateTable).toHaveBeenCalledWith('taxonomy_codes');

    await prisma.taxonomyCode.deleteMany({ where: { taxonomyCode: '207Q00000X' } });
  });
});
