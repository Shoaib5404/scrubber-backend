import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { mkdtempSync, writeFileSync } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { PrismaModule } from '../../src/common/prisma/prisma.module';
import { loadEnvFrom } from '../../src/config';
import { LookupCacheService } from '../../src/modules/cache/lookup-cache.service';
import { CliModule } from '../../src/modules/cli/cli.module';
import { ImportsModule } from '../../src/modules/imports/imports.module';
import { MajorSurgeryCodesImportService } from '../../src/modules/imports/major-surgery-codes.import.service';
import { RadiologyCptCodesImportService } from '../../src/modules/imports/radiology-cpt-codes.import.service';
import { InitialTreatmentCodesImportCommand } from '../../src/modules/imports/initial-treatment-codes.command';
import { MajorSurgeryCodesImportCommand } from '../../src/modules/imports/major-surgery-codes.command';
import { NoOfUnitsCptsImportCommand } from '../../src/modules/imports/no-of-units-cpts.command';
import { RadiologyCptCodesImportCommand } from '../../src/modules/imports/radiology-cpt-codes.command';
import { NoOfUnitsCptsImportService } from '../../src/modules/imports/no-of-units-cpts.import.service';

describe('imports code-list CSV (SP-8 Task 19)', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let radiologyImport: RadiologyCptCodesImportService;
  let majorImport: MajorSurgeryCodesImportService;
  let noOfUnitsImport: NoOfUnitsCptsImportService;
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
    radiologyImport = moduleRef.get(RadiologyCptCodesImportService);
    majorImport = moduleRef.get(MajorSurgeryCodesImportService);
    noOfUnitsImport = moduleRef.get(NoOfUnitsCptsImportService);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  function tempCsv(name: string, body: string): string {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'scrubber-import-'));
    const filePath = path.join(dir, name);
    writeFileSync(filePath, body, 'utf8');
    return filePath;
  }

  it('radiology: truncate+import upserts valid CPT, skips invalid rows, syncs lookup cache', async () => {
    const filePath = tempCsv(
      'radiology.csv',
      'PROCEDURE\n99213\nbad!\n\n99213\n',
    );

    const result = await radiologyImport.importFromFile(filePath, { truncate: true, chunk: 1000 });

    expect(result.upserted).toBe(1);
    expect(result.skipped).toBe(3);

    const row = await prisma.radiologyCptCode.findUnique({ where: { cpt: '99213' } });
    expect(row?.isActive).toBe(true);
    expect(invalidateTable).toHaveBeenCalledWith('radiology_cpt_codes');

    await prisma.radiologyCptCode.deleteMany({ where: { cpt: '99213' } });
  });

  it('major-surgery: upserts codes and skips invalid rows', async () => {
    invalidateTable.mockClear();
    const filePath = tempCsv('major.csv', '27447\n\n27447\nX-Y\n');

    const result = await majorImport.importFromFile(filePath, { truncate: true, chunk: 2 });

    expect(result.upserted).toBe(1);
    expect(result.skipped).toBe(2);

    const row = await prisma.majorSurgeryCode.findUnique({ where: { code: '27447' } });
    expect(row?.active).toBe(true);
    expect(invalidateTable).toHaveBeenCalledWith('major_surgery_codes');

    await prisma.majorSurgeryCode.deleteMany({ where: { code: '27447' } });
  });

  it('no-of-units: reads HCPCS Code header and pads short numeric CPT', async () => {
    invalidateTable.mockClear();
    const filePath = tempCsv('units.csv', 'HCPCS Code\n123\nJ1234\n');

    const result = await noOfUnitsImport.importFromFile(filePath, { truncate: true });

    expect(result.upserted).toBe(2);
    expect(result.skipped).toBe(0);

    const padded = await prisma.noOfUnitsCpt.findUnique({ where: { cpt: '00123' } });
    expect(padded?.isActive).toBe(true);
    expect(invalidateTable).toHaveBeenCalledWith('no_of_units_cpts');

    await prisma.noOfUnitsCpt.deleteMany({ where: { cpt: { in: ['00123', 'J1234'] } } });
  });
});

describe('CliModule (SP-8 Task 19)', () => {
  it('loads and registers the first CSV import command group', async () => {
    const moduleRef = await Test.createTestingModule({
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
        CliModule,
      ],
    }).compile();

    expect(moduleRef.get(RadiologyCptCodesImportCommand)).toBeDefined();
    expect(moduleRef.get(MajorSurgeryCodesImportCommand)).toBeDefined();
    expect(moduleRef.get(InitialTreatmentCodesImportCommand)).toBeDefined();
    expect(moduleRef.get(NoOfUnitsCptsImportCommand)).toBeDefined();

    await moduleRef.close();
  });
});
