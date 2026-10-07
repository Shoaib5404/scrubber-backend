import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import ExcelJS from 'exceljs';
import { mkdtempSync, writeFileSync } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { PrismaModule } from '../../src/common/prisma/prisma.module';
import { loadEnvFrom } from '../../src/config';
import { LookupCacheService } from '../../src/modules/cache/lookup-cache.service';
import { ImportsModule } from '../../src/modules/imports/imports.module';
import { CptPosRulesImportService } from '../../src/modules/imports/cpt-pos-rules.import.service';
import { CptModifierRulesImportService } from '../../src/modules/imports/cpt-modifier-rules.import.service';
import { MuePractitionersImportService } from '../../src/modules/imports/mue-practitioners.import.service';
import { ZipCodesImportService } from '../../src/modules/imports/zip-codes.import.service';
import { AetnaB12LcdImportService } from '../../src/modules/imports/aetna-b12-lcd.import.service';
import { AetnaFetalLcdImportService } from '../../src/modules/imports/aetna-fetal-lcd.import.service';
import { CignaCptIcdCrosswalkImportService } from '../../src/modules/imports/cigna-cpt-icd-crosswalk.import.service';

describe('imports CPT-POS / CPT-modifier / MUE / ZIP / Aetna / Cigna (SP-8 Task 19 group 7)', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let cptPosImport: CptPosRulesImportService;
  let cptModifierImport: CptModifierRulesImportService;
  let muePractitionersImport: MuePractitionersImportService;
  let zipCodesImport: ZipCodesImportService;
  let aetnaB12Import: AetnaB12LcdImportService;
  let aetnaFetalImport: AetnaFetalLcdImportService;
  let cignaImport: CignaCptIcdCrosswalkImportService;
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
    cptPosImport = moduleRef.get(CptPosRulesImportService);
    cptModifierImport = moduleRef.get(CptModifierRulesImportService);
    muePractitionersImport = moduleRef.get(MuePractitionersImportService);
    zipCodesImport = moduleRef.get(ZipCodesImportService);
    aetnaB12Import = moduleRef.get(AetnaB12LcdImportService);
    aetnaFetalImport = moduleRef.get(AetnaFetalLcdImportService);
    cignaImport = moduleRef.get(CignaCptIcdCrosswalkImportService);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  function tempFile(name: string, body: string): string {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'scrubber-import-g7-'));
    const filePath = path.join(dir, name);
    writeFileSync(filePath, body, 'utf8');
    return filePath;
  }

  async function tempXlsx(name: string, sheetName: string, rows: (string | number)[][]): Promise<string> {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'scrubber-import-g7-'));
    const filePath = path.join(dir, name);
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(sheetName);
    for (const row of rows) {
      sheet.addRow(row);
    }
    await workbook.xlsx.writeFile(filePath);
    return filePath;
  }

  async function tempXlsxMultiSheet(
    name: string,
    sheets: { name: string; rows: (string | number)[][] }[],
  ): Promise<string> {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'scrubber-import-g7-'));
    const filePath = path.join(dir, name);
    const workbook = new ExcelJS.Workbook();
    for (const sheetDef of sheets) {
      const sheet = workbook.addWorksheet(sheetDef.name);
      for (const row of sheetDef.rows) {
        sheet.addRow(row);
      }
    }
    await workbook.xlsx.writeFile(filePath);
    return filePath;
  }

  it('cpt-pos: merge upserts rows (including null payerId via findFirst+update) and syncs both cache groups', async () => {
    invalidateTable.mockClear();
    const filePath = await tempXlsx('cpt-pos.xlsx', 'Sheet1', [
      ['CPT', 'POS', 'PayerID', 'IsDeleted'],
      ['99213', '11', '', '0'],
      ['99214', '2', '123', '1'],
    ]);

    const result = await cptPosImport.importFromFile(filePath, {
      truncate: true,
      merge: true,
      chunk: 10,
    });

    expect(result.updated).toBe(2);
    expect(result.imported).toBe(0);
    expect(result.errors).toBe(0);

    const nullPayerRow = await prisma.cptPosRule.findFirst({
      where: { cptCode: '99213', posCode: '11', payerId: null },
    });
    expect(nullPayerRow?.isDeleted).toBe(false);

    const payerRow = await prisma.cptPosRule.findUnique({
      where: { cptCode_posCode_payerId: { cptCode: '99214', posCode: '02', payerId: '00123' } },
    });
    expect(payerRow?.isDeleted).toBe(true);

    expect(invalidateTable).toHaveBeenCalledWith('cpt_pos_rules');
    expect(invalidateTable).toHaveBeenCalledWith('cpt_pos_rules_by_cpt');

    // Re-running the merge must update the existing null-payerId row, not duplicate it.
    const secondRun = await cptPosImport.importFromFile(filePath, { merge: true, chunk: 10 });
    expect(secondRun.updated).toBe(2);
    const nullPayerCount = await prisma.cptPosRule.count({
      where: { cptCode: '99213', posCode: '11', payerId: null },
    });
    expect(nullPayerCount).toBe(1);

    await prisma.cptPosRule.deleteMany({ where: { cptCode: { in: ['99213', '99214'] } } });
  });

  it('cpt-modifier: createMany (no merge) imports rows and syncs both cache groups', async () => {
    invalidateTable.mockClear();
    const filePath = await tempXlsx('cpt-modifier.xlsx', 'Sheet1', [
      ['CPT', 'Modifier', 'IsAllowed', 'PayerID'],
      ['99213', '25', '1', ''],
      ['99213', '59', '0', '777'],
    ]);

    const result = await cptModifierImport.importFromFile(filePath, { truncate: true, chunk: 10 });

    expect(result.imported).toBe(2);
    expect(result.updated).toBe(0);
    expect(result.errors).toBe(0);

    const nullPayerRow = await prisma.cptModifierRule.findFirst({
      where: { cptCode: '99213', modifierCode: '25', payerId: null },
    });
    expect(nullPayerRow?.isAllowed).toBe(true);

    const payerRow = await prisma.cptModifierRule.findUnique({
      where: {
        cptCode_modifierCode_payerId: { cptCode: '99213', modifierCode: '59', payerId: '777' },
      },
    });
    expect(payerRow?.isAllowed).toBe(false);

    expect(invalidateTable).toHaveBeenCalledWith('cpt_modifier_rules');
    expect(invalidateTable).toHaveBeenCalledWith('cpt_modifier_rules_by_cpt');

    await prisma.cptModifierRule.deleteMany({ where: { cptCode: '99213' } });
  });

  it('mue-practitioners: upserts valid rows, skips header-like CPT cells, parses 8-digit effective date', async () => {
    invalidateTable.mockClear();
    const filePath = await tempXlsx('mue-practitioners.xlsx', 'Sheet1', [
      ['HCPCS', 'MinUnits', 'MaxUnits', 'Indicator', 'EffectiveDate'],
      ['82607', '1', '1', '3', '20260101'],
      ['CPT 99999', '1', '1', '3', '20260101'],
    ]);

    const result = await muePractitionersImport.importFromFile(filePath, { truncate: true, chunk: 500 });

    expect(result.upserted).toBe(1);
    expect(result.skipped).toBe(1);

    const row = await prisma.muePractitioner.findUnique({ where: { cptCode: '82607' } });
    expect(row?.lowerLimit).toBe('1');
    expect(row?.upperLimit).toBe('1');
    expect(row?.indicator).toBe('3');
    expect(row?.effectiveDate?.toISOString().slice(0, 10)).toBe('2026-01-01');

    expect(invalidateTable).toHaveBeenCalledWith('mue_practitioners');

    await prisma.muePractitioner.deleteMany({ where: { cptCode: '82607' } });
  });

  it('zip-codes: CSV import maps vZIPCode/vCity/vState, dedupes, and syncs lookup cache', async () => {
    invalidateTable.mockClear();
    const csvBody = [
      'vZIPCode,ZIPCodeType,vCity,vStateName,vState',
      '30301,P,Atlanta,Georgia,GA',
      '30301,P,Atlanta,Georgia,GA',
      '99999,P,Nowhere,Nowhere,USA',
    ].join('\n');
    const filePath = tempFile('zip-codes.csv', csvBody);

    const result = await zipCodesImport.importFromFile(filePath, { truncate: true, chunk: 1000 });

    expect(result.imported).toBe(1);
    expect(result.skipped).toBeGreaterThanOrEqual(2);

    const row = await prisma.zipCode.findUnique({
      where: { zipCode_city_state: { zipCode: '30301', city: 'Atlanta', state: 'GA' } },
    });
    expect(row?.zipCodeType).toBe('P');
    expect(row?.stateName).toBe('Georgia');
    expect(row?.isActive).toBe(true);

    expect(invalidateTable).toHaveBeenCalledWith('zip_codes');

    await prisma.zipCode.deleteMany({ where: { zipCode: '30301' } });
  });

  it('aetna-b12-lcd: expands CPT x ICD sheet pair into a crosswalk and syncs lookup cache', async () => {
    invalidateTable.mockClear();
    const filePath = await tempXlsxMultiSheet('aetna-b12.xlsx', [
      { name: 'CPT', rows: [['CPT'], ['99213']] },
      { name: 'ICDs', rows: [['Code', 'Description'], ['E11.9', 'Type 2 diabetes mellitus']] },
    ]);

    const result = await aetnaB12Import.importFromFile(filePath, { truncate: true, chunk: 100 });

    expect(result.cptCodeCount).toBe(1);
    expect(result.sourceIcdRowCount).toBe(1);
    expect(result.expandedIcdCount).toBe(1);
    expect(result.crosswalkRowCount).toBe(1);
    expect(result.imported).toBe(1);
    expect(result.dryRun).toBe(false);

    const row = await prisma.aetnaB12Lcd.findUnique({ where: { cpt_icd: { cpt: '99213', icd: 'E119' } } });
    expect(row?.description).toBe('Type 2 diabetes mellitus');
    expect(row?.isActive).toBe(true);

    expect(invalidateTable).toHaveBeenCalledWith('aetna_b12_lcd');

    await prisma.aetnaB12Lcd.deleteMany({ where: { cpt: '99213' } });
  });

  it('aetna-fetal-lcd: expands CPT x ICD sheet pair into a crosswalk (mirrors B12 flow)', async () => {
    invalidateTable.mockClear();
    const filePath = await tempXlsxMultiSheet('aetna-fetal.xlsx', [
      { name: 'CPT', rows: [['CPT'], ['99214']] },
      { name: 'ICD', rows: [['Code', 'Description'], ['O36.80', 'Maternal care for fetal issue']] },
    ]);

    const result = await aetnaFetalImport.importFromFile(filePath, { truncate: true, chunk: 100 });

    expect(result.imported).toBe(1);

    const row = await prisma.aetnaFetalLcd.findUnique({
      where: { cpt_icd: { cpt: '99214', icd: 'O3680' } },
    });
    expect(row?.description).toBe('Maternal care for fetal issue');

    expect(invalidateTable).toHaveBeenCalledWith('aetna_fetal_lcd');

    await prisma.aetnaFetalLcd.deleteMany({ where: { cpt: '99214' } });
  });

  it('cigna: JSON import upserts CPT/ICD pair and syncs lookup cache (no dedicated cache service)', async () => {
    invalidateTable.mockClear();
    const filePath = tempFile(
      'cigna.json',
      JSON.stringify({ crosswalk: [{ cpt_code: '99213', icd_code: 'E11.9', is_active: true }] }),
    );

    const result = await cignaImport.importFromFile(filePath, { truncate: true, chunk: 100 });

    expect(result.updated).toBe(1);
    expect(result.imported).toBe(0);
    expect(result.errors).toBe(0);

    const row = await prisma.cignaCptIcdCrosswalk.findUnique({
      where: { cptCode_icdCode: { cptCode: '99213', icdCode: 'E11.9' } },
    });
    expect(row?.isActive).toBe(true);

    expect(invalidateTable).toHaveBeenCalledWith('cigna_cpt_icd_crosswalk');

    await prisma.cignaCptIcdCrosswalk.deleteMany({ where: { cptCode: '99213' } });
  });
});
