import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import ExcelJS from 'exceljs';
import { mkdtempSync, readFileSync, writeFileSync } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { PrismaModule } from '../../src/common/prisma/prisma.module';
import { loadEnvFrom } from '../../src/config';
import { LookupCacheService } from '../../src/modules/cache/lookup-cache.service';
import { ImportsModule } from '../../src/modules/imports/imports.module';
import { AddOnCodesImportService } from '../../src/modules/imports/add-on-codes.import.service';
import { McrVaccineCodesImportService } from '../../src/modules/imports/mcr-vaccine-codes.import.service';
import { MedicaidMemberIdFormatsImportService } from '../../src/modules/imports/medicaid-member-id-formats.import.service';
import { Icd10BodySidewiseImportService } from '../../src/modules/imports/icd10-body-sidewise.import.service';
import { Icd10UnacceptablePrincipalDxCodesImportService } from '../../src/modules/imports/icd10-unacceptable-principal-dx-codes.import.service';
import { NcdOtherLabImportService } from '../../src/modules/imports/ncd-other-lab.import.service';
import { NcdOtherLabCodesImportService } from '../../src/modules/imports/ncd-other-lab-codes.import.service';

// Must be set before the testing module compiles — MedicaidMemberIdFormatRepository reads this
// env var once, in its constructor.
const medicaidJsonDir = mkdtempSync(path.join(os.tmpdir(), 'scrubber-import-g8-medicaid-'));
const medicaidJsonPath = path.join(medicaidJsonDir, 'medicaid-member-id-formats.json');
process.env.MEDICAID_MEMBER_ID_FORMATS_PATH = medicaidJsonPath;

describe('imports add-on / mcr-vaccine / medicaid / icd10 / ncd-other-lab (SP-8 Task 19 group 8)', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let addOnCodesImport: AddOnCodesImportService;
  let mcrVaccineImport: McrVaccineCodesImportService;
  let medicaidImport: MedicaidMemberIdFormatsImportService;
  let icd10BodySidewiseImport: Icd10BodySidewiseImportService;
  let icd10UnacceptableImport: Icd10UnacceptablePrincipalDxCodesImportService;
  let ncdOtherLabImport: NcdOtherLabImportService;
  let ncdOtherLabCodesImport: NcdOtherLabCodesImportService;
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
    addOnCodesImport = moduleRef.get(AddOnCodesImportService);
    mcrVaccineImport = moduleRef.get(McrVaccineCodesImportService);
    medicaidImport = moduleRef.get(MedicaidMemberIdFormatsImportService);
    icd10BodySidewiseImport = moduleRef.get(Icd10BodySidewiseImportService);
    icd10UnacceptableImport = moduleRef.get(Icd10UnacceptablePrincipalDxCodesImportService);
    ncdOtherLabImport = moduleRef.get(NcdOtherLabImportService);
    ncdOtherLabCodesImport = moduleRef.get(NcdOtherLabCodesImportService);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  function tempFile(name: string, body: string): string {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'scrubber-import-g8-'));
    const filePath = path.join(dir, name);
    writeFileSync(filePath, body, 'utf8');
    return filePath;
  }

  async function tempXlsx(name: string, sheetName: string, rows: (string | number)[][]): Promise<string> {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'scrubber-import-g8-'));
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
    const dir = mkdtempSync(path.join(os.tmpdir(), 'scrubber-import-g8-'));
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

  it('add-on-codes: plain-inserts rows (Julian YYYYDDD dates), supports fallback positional mapping, syncs lookup cache', async () => {
    invalidateTable.mockClear();
    const filePath = await tempXlsx('add-on-codes.xlsx', 'Sheet1', [
      [
        'Primary_Code',
        'AOC_Edit_Type',
        'Add-On_Code',
        'AOC_DelDT',
        'Primary_Code_DelDT',
        'AOC_Edit_EffDT',
        'AOC_Edit_DelDT',
        'Special_Instruction_Notes',
      ],
      ['0001T', '1', '0002T', '2026001', '2026002', '2026003', '2026004', 'Test note'],
    ]);

    const result = await addOnCodesImport.importFromFile(filePath, { truncate: true, chunk: 10 });
    expect(result.imported).toBe(1);
    expect(result.skipped).toBe(0);

    const row = await prisma.addOnCode.findFirst({ where: { primaryCode: '0001T' } });
    expect(row?.addOnCode).toBe('0002T');
    expect(row?.aocEditType).toBe(1);
    expect(row?.aocDeldt?.toISOString().slice(0, 10)).toBe('2026-01-01');
    expect(row?.aocEditEffdt?.toISOString().slice(0, 10)).toBe('2026-01-03');
    expect(row?.specialInstructionNotes).toBe('Test note');

    expect(invalidateTable).toHaveBeenCalledWith('add_on_codes');

    // Plain insert (not upsert) — importing again duplicates the row, matching Laravel's
    // AddOnCode::insert() semantics.
    await addOnCodesImport.importFromFile(filePath, { chunk: 10 });
    const count = await prisma.addOnCode.count({ where: { primaryCode: '0001T' } });
    expect(count).toBe(2);

    await prisma.addOnCode.deleteMany({ where: { primaryCode: '0001T' } });
  });

  it('mcr-vaccine-codes: imports a named sheet (Flu) as type and upserts on type+vaccineCode', async () => {
    invalidateTable.mockClear();
    const filePath = await tempXlsxMultiSheet('mcr-vaccine.xlsx', [
      {
        name: 'Flu',
        rows: [
          ['Vaccine Code', 'ICD10 Code', 'Administration'],
          ['90672', 'J09X2', 'G0008'],
        ],
      },
    ]);

    const result = await mcrVaccineImport.importFromFile(filePath, { truncate: true, chunk: 10 });
    expect(result.imported).toBe(0);
    expect(result.updated).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.errors).toBe(0);

    const row = await prisma.mcrVaccineCode.findUnique({
      where: { type_vaccineCode: { type: 'Flu', vaccineCode: '90672' } },
    });
    expect(row?.icd10Code).toBe('J09X2');

    expect(row?.administrationCode).toBe('G0008');
    expect(row?.isActive).toBe(true);

    expect(invalidateTable).toHaveBeenCalledWith('mcr_vaccine_codes');

    await prisma.mcrVaccineCode.deleteMany({ where: { type: 'Flu', vaccineCode: '90672' } });
  });

  it('medicaid:import-member-id-formats: parses Excel and rebuilds the by_payer_id JSON store', async () => {
    const filePath = await tempXlsx('medicaid.xlsx', 'Sheet1', [
      ['Payer Name', 'Direct/Indirect', 'RT Payer ID', 'Success Example', 'Length', 'Format Type', 'Pattern'],
      ['Acme Medicaid', 'Direct', '12345', 'SAMPLE123456789', '9', 'Numeric', '123456789'],
    ]);

    const result = await medicaidImport.importFromFile(filePath, { truncate: true });
    expect(result.parsed).toBe(1);
    expect(result.uniquePayers).toBe(1);
    expect(result.stored).toBe(1);
    expect(result.dryRun).toBe(false);

    const written = JSON.parse(readFileSync(medicaidJsonPath, 'utf8')) as {
      by_payer_id: Record<string, { payer_name: string; formats: Array<Record<string, unknown>> }>;
    };
    expect(written.by_payer_id['12345']?.payer_name).toBe('ACME MEDICAID');
    expect(written.by_payer_id['12345']?.formats).toHaveLength(1);
    expect(written.by_payer_id['12345']?.formats[0]?.member_id_format).toBe('123456789');
    expect(written.by_payer_id['12345']?.formats[0]?.length).toBe(9);

    // Re-running without --truncate when records already exist must fail (mirrors Laravel's guard).
    await expect(medicaidImport.importFromFile(filePath, {})).rejects.toThrow(
      'JSON store already has records. Use --truncate to replace them.',
    );
  });

  it('icd10-body-sidewise: plain-inserts rows from Excel (no upsert, duplicates allowed on rerun)', async () => {
    invalidateTable.mockClear();
    const filePath = await tempXlsx('icd10-body-sidewise.xlsx', 'Sheet1', [
      ['ID', 'Code', 'Long Discription', 'Side'],
      ['1', 'S72.001A', 'Fracture of unspecified part of neck of right femur', 'Right'],
    ]);

    const result = await icd10BodySidewiseImport.importFromFile(filePath, { truncate: true, chunk: 10 });
    expect(result.imported).toBe(1);
    expect(result.skipped).toBe(0);

    const row = await prisma.icd10BodySidewise.findFirst({ where: { code: 'S72.001A' } });
    expect(row?.longDescription).toBe('Fracture of unspecified part of neck of right femur');
    expect(row?.side).toBe('Right');

    expect(invalidateTable).toHaveBeenCalledWith('icd10_body_sidewise');

    await icd10BodySidewiseImport.importFromFile(filePath, { chunk: 10 });
    const count = await prisma.icd10BodySidewise.count({ where: { code: 'S72.001A' } });
    expect(count).toBe(2);

    await prisma.icd10BodySidewise.deleteMany({ where: { code: 'S72.001A' } });
  });

  it('icd10-unacceptable-principal-dx-codes: CSV upsert on code+claimType, maps claim-type aliases', async () => {
    invalidateTable.mockClear();
    const csvBody = [
      'Code,Description,Claim Type',
      'R69,Illness unspecified,professional',
    ].join('\n');
    const filePath = tempFile('icd10-unacceptable.csv', csvBody);

    const result = await icd10UnacceptableImport.importFromFile(filePath, { truncate: true, chunk: 10 });
    expect(result.upserted).toBe(1);
    expect(result.skipped).toBe(0);

    const row = await prisma.icd10UnacceptablePrincipalDiagnoseCode.findUnique({
      where: { code_claimType: { code: 'R69', claimType: 1 } },
    });
    expect(row?.description).toBe('Illness unspecified');
    expect(row?.active).toBe(true);

    expect(invalidateTable).toHaveBeenCalledWith('icd10_unacceptable_principal_diagnose_codes');

    await prisma.icd10UnacceptablePrincipalDiagnoseCode.deleteMany({ where: { code: 'R69' } });
  });

  it('ncd-other-lab: imports two independent CPT/ICD lists by sheet index and syncs only the CPT cache group', async () => {
    invalidateTable.mockClear();
    const filePath = await tempXlsxMultiSheet('ncd-other-lab.xlsx', [
      { name: 'ICD List', rows: [['ICD-10 CM'], ['E11.9'], ['O36.80']] },
      { name: 'CPT List', rows: [['CPT'], ['82607'], ['99213']] },
    ]);

    const result = await ncdOtherLabImport.importFromFile(filePath, { truncate: true, chunk: 100 });
    expect(result.icdCodeCount).toBe(2);
    expect(result.cptCodeCount).toBe(2);
    expect(result.cptRowsUpserted).toBe(2);
    expect(result.icdRowsUpserted).toBe(2);

    const cptRow = await prisma.ncdOtherLabCpt.findUnique({ where: { cptCode: '82607' } });
    expect(cptRow?.isActive).toBe(true);
    const icdRow = await prisma.ncdOtherLabIcd.findUnique({ where: { icdCode: 'E11.9' } });
    expect(icdRow?.isActive).toBe(true);

    expect(invalidateTable).toHaveBeenCalledWith('ncd_other_lab_cpt');
    expect(invalidateTable).not.toHaveBeenCalledWith('ncd_other_lab_icd');

    await prisma.ncdOtherLabCpt.deleteMany({ where: { cptCode: { in: ['82607', '99213'] } } });
    await prisma.ncdOtherLabIcd.deleteMany({ where: { icdCode: { in: ['E11.9', 'O36.80'] } } });
  });

  it('ncd-other-lab:import-codes: builds the CPT x ICD cartesian crosswalk from named sheets', async () => {
    invalidateTable.mockClear();
    const filePath = await tempXlsxMultiSheet('ncd-other-lab-codes.xlsx', [
      { name: 'ICD', rows: [['ICD-10 CM'], ['E11.9'], ['O36.80']] },
      { name: 'CPT', rows: [['CPT'], ['82607'], ['99213']] },
    ]);

    const result = await ncdOtherLabCodesImport.importFromFile(filePath, { truncate: true, chunk: 100 });
    expect(result.cptCodeCount).toBe(2);
    expect(result.icdCodeCount).toBe(2);
    expect(result.expectedTotal).toBe(4);
    expect(result.imported).toBe(4);
    expect(result.tableTotal).toBe(4);

    const row = await prisma.ncdOtherLabCode.findUnique({
      where: { cpt_icd: { cpt: '82607', icd: 'E11.9' } },
    });
    expect(row?.isActive).toBe(true);

    expect(invalidateTable).toHaveBeenCalledWith('ncd_other_lab_codes');

    await prisma.ncdOtherLabCode.deleteMany({ where: { cpt: { in: ['82607', '99213'] } } });
  });
});
