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
import { AgeSpecificCptRulesImportService } from '../../src/modules/imports/age-specific-cpt-rules.import.service';
import { GenderSpecificCptRulesImportService } from '../../src/modules/imports/gender-specific-cpt-rules.import.service';
import { ModifierSequencesImportService } from '../../src/modules/imports/modifier-sequences.import.service';

describe('imports age/gender CPT and modifier sequence (SP-8 Task 19 group 5)', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let ageCptImport: AgeSpecificCptRulesImportService;
  let genderCptImport: GenderSpecificCptRulesImportService;
  let modifierSequenceImport: ModifierSequencesImportService;
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
    ageCptImport = moduleRef.get(AgeSpecificCptRulesImportService);
    genderCptImport = moduleRef.get(GenderSpecificCptRulesImportService);
    modifierSequenceImport = moduleRef.get(ModifierSequencesImportService);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  async function tempXlsx(
    name: string,
    sheetName: string,
    rows: (string | number)[][],
  ): Promise<string> {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'scrubber-import-age-gender-'));
    const filePath = path.join(dir, name);
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(sheetName);
    for (const row of rows) {
      sheet.addRow(row);
    }
    await workbook.xlsx.writeFile(filePath);
    return filePath;
  }

  function tempJson(name: string, payload: unknown): string {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'scrubber-import-age-gender-json-'));
    const filePath = path.join(dir, name);
    writeFileSync(filePath, JSON.stringify(payload), 'utf8');
    return filePath;
  }

  it('age CPT: upserts limits + gender from Excel and syncs lookup cache', async () => {
    invalidateTable.mockClear();
    const filePath = await tempXlsx('age-cpt.xlsx', 'Sheet1', [
      ['CPT', 'Description', 'Min Age', 'Max Age', 'Unit', 'Gender'],
      ['92507', 'Speech therapy', '0', '21', 'years', 'B'],
      ['', 'Missing code'],
    ]);

    const result = await ageCptImport.importFromFile(filePath, { chunk: 1 });

    expect(result.upserted).toBe(1);
    expect(result.skipped).toBe(1);

    const row = await prisma.ageSpecificCptRule.findUnique({ where: { cptCode: '92507' } });
    expect(row?.description).toBe('Speech therapy');
    expect(row?.lowLimit).toBe(0);
    expect(row?.highLimit).toBe(21);
    expect(row?.unit).toBe('years');
    expect(row?.gender).toBe('B');
    expect(invalidateTable).toHaveBeenCalledWith('age_specific_cpt_rules');

    await prisma.ageSpecificCptRule.deleteMany({ where: { cptCode: '92507' } });
  });

  it('gender CPT: upserts from Excel with default male gender', async () => {
    invalidateTable.mockClear();
    const filePath = await tempXlsx('gender-cpt.xlsx', 'Sheet1', [
      ['CPT', 'Description', 'Gender'],
      ['77065', 'Mammography', 'F'],
      ['77066', 'Mammography bilateral'],
    ]);

    const result = await genderCptImport.importFromFile(filePath);

    expect(result.upserted).toBe(2);
    expect(result.skipped).toBe(0);

    const female = await prisma.genderSpecificCptRule.findUnique({ where: { cptCode: '77065' } });
    expect(female?.gender).toBe('F');
    const maleDefault = await prisma.genderSpecificCptRule.findUnique({
      where: { cptCode: '77066' },
    });
    expect(maleDefault?.gender).toBe('M');
    expect(invalidateTable).toHaveBeenCalledWith('gender_specific_cpt_rules');

    await prisma.genderSpecificCptRule.deleteMany({
      where: { cptCode: { in: ['77065', '77066'] } },
    });
  });

  it('modifier-sequence: upserts from JSON and syncs lookup cache', async () => {
    invalidateTable.mockClear();
    const filePath = tempJson('modifiers.json', {
      sequences: [
        { sequence_order: 1, modifier: '26', modifier_group: 'Professional' },
        { sequence_order: 2, modifier: 'TC', modifier_group: 'Technical' },
        { modifier: 'TC' },
      ],
    });

    const result = await modifierSequenceImport.importFromFile(filePath, { truncate: true });

    expect(result.upserted).toBe(2);
    expect(result.skipped).toBe(1);

    const tc = await prisma.modifierSequence.findUnique({ where: { modifier: 'TC' } });
    expect(tc?.sequenceOrder).toBe(2);
    expect(tc?.modifierGroup).toBe('Technical');
    expect(invalidateTable).toHaveBeenCalledWith('modifier_sequences');

    await prisma.modifierSequence.deleteMany({ where: { modifier: { in: ['26', 'TC'] } } });
  });
});
