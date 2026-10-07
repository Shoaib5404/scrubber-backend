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
import { AnesthesiaCodesImportCommand } from '../../src/modules/imports/anesthesia-codes.command';
import { AnesthesiaCodesImportService } from '../../src/modules/imports/anesthesia-codes.import.service';
import { AnesthesiaCodesWithBillableModifiersImportCommand } from '../../src/modules/imports/anesthesia-codes-with-billable-modifiers.command';
import { AnesthesiaCodesWithBillableModifiersImportService } from '../../src/modules/imports/anesthesia-codes-with-billable-modifiers.import.service';
import { AnesthesiaModifiersImportCommand } from '../../src/modules/imports/anesthesia-modifiers.command';
import { AnesthesiaModifiersImportService } from '../../src/modules/imports/anesthesia-modifiers.import.service';
import { GlobalDaysSurgeriesImportCommand } from '../../src/modules/imports/global-days-surgeries.command';
import { GlobalDaysSurgeriesImportService } from '../../src/modules/imports/global-days-surgeries.import.service';
import { ICodesImportCommand } from '../../src/modules/imports/i-codes.command';
import { ICodesImportService } from '../../src/modules/imports/i-codes.import.service';
import { ImportsModule } from '../../src/modules/imports/imports.module';

describe('imports anesthesia / i-codes / global-days CSV (SP-8 Task 19 group 2)', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let anesthesiaCodes: AnesthesiaCodesImportService;
  let anesthesiaModifiers: AnesthesiaModifiersImportService;
  let billableModifiers: AnesthesiaCodesWithBillableModifiersImportService;
  let iCodes: ICodesImportService;
  let globalDays: GlobalDaysSurgeriesImportService;
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
    anesthesiaCodes = moduleRef.get(AnesthesiaCodesImportService);
    anesthesiaModifiers = moduleRef.get(AnesthesiaModifiersImportService);
    billableModifiers = moduleRef.get(AnesthesiaCodesWithBillableModifiersImportService);
    iCodes = moduleRef.get(ICodesImportService);
    globalDays = moduleRef.get(GlobalDaysSurgeriesImportService);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  function tempCsv(name: string, body: string): string {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'scrubber-import-g2-'));
    const filePath = path.join(dir, name);
    writeFileSync(filePath, body, 'utf8');
    return filePath;
  }

  it('anesthesia-codes: upserts unit/active, skips blank cpt or invalid unit', async () => {
    invalidateTable.mockClear();
    const filePath = tempCsv(
      'anesthesia.csv',
      'cpt_code,2018_base_unit,active\n00100,5,inactive\n,3\n00100,5,yes\n00101,abc\n',
    );

    const result = await anesthesiaCodes.importFromFile(filePath, { truncate: true });

    expect(result.upserted).toBe(1);
    expect(result.skipped).toBe(2);

    const row = await prisma.anesthesiaCode.findUnique({ where: { cptCode: '00100' } });
    expect(row?.unit).toBe(5);
    expect(row?.active).toBe(true);
    expect(invalidateTable).toHaveBeenCalledWith('anesthesia_codes');

    await prisma.anesthesiaCode.deleteMany({ where: { cptCode: { in: ['00100', '00101'] } } });
  });

  it('anesthesia-modifiers: upserts description and active flag', async () => {
    invalidateTable.mockClear();
    const filePath = tempCsv(
      'modifiers.csv',
      'modifier,description,active\nAA,Anesthesia,no\n\n',
    );

    const result = await anesthesiaModifiers.importFromFile(filePath, { truncate: true });

    expect(result.upserted).toBe(1);
    expect(result.skipped).toBe(1);

    const row = await prisma.anesthesiaModifier.findUnique({ where: { modifier: 'AA' } });
    expect(row?.description).toBe('Anesthesia');
    expect(row?.active).toBe(false);
    expect(invalidateTable).toHaveBeenCalledWith('anesthesia_modifiers');

    await prisma.anesthesiaModifier.deleteMany({ where: { modifier: 'AA' } });
  });

  it('anesthesia billable modifiers: composite upsert', async () => {
    invalidateTable.mockClear();
    const filePath = tempCsv(
      'billable.csv',
      'code,modifier,active\n00100,AA,0\n00100,,yes\n',
    );

    const result = await billableModifiers.importFromFile(filePath, { truncate: true });

    expect(result.upserted).toBe(1);
    expect(result.skipped).toBe(1);

    const row = await prisma.anesthesiaCodeWithBillableModifier.findFirst({
      where: { code: '00100', modifier: 'AA' },
    });
    expect(row?.active).toBe(false);
    expect(invalidateTable).toHaveBeenCalledWith('anesthesia_codes_with_billable_modifiers');

    await prisma.anesthesiaCodeWithBillableModifier.deleteMany({
      where: { code: '00100', modifier: 'AA' },
    });
  });

  it('i-codes: upserts hcpcs and respects inactive active column', async () => {
    invalidateTable.mockClear();
    const filePath = tempCsv(
      'icodes.csv',
      'hcpcs,description,active\nJ1234,Test I code,false\n\n',
    );

    const result = await iCodes.importFromFile(filePath, { truncate: true });

    expect(result.upserted).toBe(1);
    expect(result.skipped).toBe(1);

    const row = await prisma.iCode.findUnique({ where: { hcpcs: 'J1234' } });
    expect(row?.description).toBe('Test I code');
    expect(row?.active).toBe(false);
    expect(invalidateTable).toHaveBeenCalledWith('i_codes');

    await prisma.iCode.deleteMany({ where: { hcpcs: 'J1234' } });
  });

  it('global-days-surgeries: maps Global Days column and uppercases codes', async () => {
    invalidateTable.mockClear();
    const filePath = tempCsv(
      'global.csv',
      'HCPCS,Description,Global Days\n27447,Knee,90\n27447,Other,90\nbad!,10\n27448,10.5\n',
    );

    const result = await globalDays.importFromFile(filePath, { truncate: true });

    expect(result.upserted).toBe(1);
    expect(result.skipped).toBe(2);

    const row = await prisma.globalDaysSurgery.findUnique({ where: { cptCode: '27447' } });
    expect(row?.days).toBe(90);
    expect(row?.description).toBe('Other');
    expect(row?.isActive).toBe(true);
    expect(invalidateTable).toHaveBeenCalledWith('global_days_surgeries');

    await prisma.globalDaysSurgery.deleteMany({ where: { cptCode: '27447' } });
  });
});

describe('CliModule (SP-8 Task 19 group 2)', () => {
  it('loads and registers the second CSV import command group', async () => {
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

    expect(moduleRef.get(AnesthesiaCodesImportCommand)).toBeDefined();
    expect(moduleRef.get(AnesthesiaModifiersImportCommand)).toBeDefined();
    expect(moduleRef.get(AnesthesiaCodesWithBillableModifiersImportCommand)).toBeDefined();
    expect(moduleRef.get(ICodesImportCommand)).toBeDefined();
    expect(moduleRef.get(GlobalDaysSurgeriesImportCommand)).toBeDefined();

    await moduleRef.close();
  });
});
