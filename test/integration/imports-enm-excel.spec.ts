import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import ExcelJS from 'exceljs';
import { mkdtempSync } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { PrismaModule } from '../../src/common/prisma/prisma.module';
import { loadEnvFrom } from '../../src/config';
import { LookupCacheService } from '../../src/modules/cache/lookup-cache.service';
import { ImportsModule } from '../../src/modules/imports/imports.module';
import { EnmProceduresImportService } from '../../src/modules/imports/enm-procedures.import.service';
import { EnmSurgeryCodesImportService } from '../../src/modules/imports/enm-surgery-codes.import.service';
import { LabCodesImportService } from '../../src/modules/imports/lab-codes.import.service';

describe('imports E&M / lab Excel (SP-8 Task 19 group 4)', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let enmProceduresImport: EnmProceduresImportService;
  let enmSurgeryImport: EnmSurgeryCodesImportService;
  let labCodesImport: LabCodesImportService;
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
    enmProceduresImport = moduleRef.get(EnmProceduresImportService);
    enmSurgeryImport = moduleRef.get(EnmSurgeryCodesImportService);
    labCodesImport = moduleRef.get(LabCodesImportService);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  async function tempXlsx(
    name: string,
    sheetName: string,
    rows: (string | number)[][],
  ): Promise<string> {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'scrubber-import-enm-'));
    const filePath = path.join(dir, name);
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(sheetName);
    for (const row of rows) {
      sheet.addRow(row);
    }
    await workbook.xlsx.writeFile(filePath);
    return filePath;
  }

  it('enm-procedures: upserts CPT + description, skips blank, syncs lookup cache', async () => {
    invalidateTable.mockClear();
    const filePath = await tempXlsx('enm-procedures.xlsx', 'Sheet1', [
      ['CPT Code', 'Description'],
      ['99213', 'Office visit'],
      ['', 'Missing code'],
      ['99213', 'Duplicate row'],
    ]);

    const result = await enmProceduresImport.importFromFile(filePath, { truncate: true, chunk: 2 });

    expect(result.upserted).toBe(1);
    expect(result.skipped).toBe(1);

    const row = await prisma.enmProcedure.findUnique({ where: { cptCode: '99213' } });
    expect(row?.description).toBe('Duplicate row');
    expect(row?.isActive).toBe(true);
    expect(invalidateTable).toHaveBeenCalledWith('enm_procedures');

    await prisma.enmProcedure.deleteMany({ where: { cptCode: '99213' } });
  });

  it('enm-surgery: upserts valid CPT and skips invalid', async () => {
    invalidateTable.mockClear();
    const filePath = await tempXlsx('enm-surgery.xlsx', 'Sheet1', [
      ['E&MCodes'],
      ['99214'],
      ['bad-code'],
    ]);

    const result = await enmSurgeryImport.importFromFile(filePath, { truncate: true });

    expect(result.upserted).toBe(1);
    expect(result.skipped).toBe(1);

    const row = await prisma.enmSurgeryCode.findUnique({ where: { cptCode: '99214' } });
    expect(row?.isActive).toBe(true);
    expect(invalidateTable).toHaveBeenCalledWith('enm_surgery_codes');

    await prisma.enmSurgeryCode.deleteMany({ where: { cptCode: '99214' } });
  });

  it('lab-codes: upserts hcpcs+modifier composite and syncs lookup cache', async () => {
    invalidateTable.mockClear();
    const filePath = await tempXlsx('lab-codes.xlsx', 'Sheet1', [
      ['HCPCS', 'Mod', 'Rate', 'ShortDesc'],
      ['80050', 'QW', '12.5', 'General health panel'],
      ['80050', 'QW', '99', 'Updated rate'],
      ['INVALID!', '', '', ''],
    ]);

    const result = await labCodesImport.importFromFile(filePath, { truncate: true, chunk: 500 });

    expect(result.upserted).toBe(1);
    expect(result.skipped).toBe(1);

    const row = await prisma.labCode.findUnique({
      where: { hcpcs_modifier: { hcpcs: '80050', modifier: 'QW' } },
    });
    expect(row?.shortDescription).toBe('Updated rate');
    expect(row?.rate?.toFixed(2)).toBe('99.00');
    expect(row?.isActive).toBe(true);
    expect(invalidateTable).toHaveBeenCalledWith('lab_codes');

    await prisma.labCode.deleteMany({ where: { hcpcs: '80050' } });
  });
});
