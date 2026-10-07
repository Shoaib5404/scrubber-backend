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
import { BcbsClaimRoutingsImportService } from '../../src/modules/imports/bcbs-claim-routings.import.service';
import { Mue87726Uhc06111OxfordImportService } from '../../src/modules/imports/mue-87726-uhc-06111-oxford.import.service';
import { ZeroAmountProceduresImportService } from '../../src/modules/imports/zero-amount-procedures.import.service';

describe('imports payer CSV / Excel (SP-8 Task 19 group 3)', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let bcbsImport: BcbsClaimRoutingsImportService;
  let mueImport: Mue87726Uhc06111OxfordImportService;
  let zeroAmountImport: ZeroAmountProceduresImportService;
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
    bcbsImport = moduleRef.get(BcbsClaimRoutingsImportService);
    mueImport = moduleRef.get(Mue87726Uhc06111OxfordImportService);
    zeroAmountImport = moduleRef.get(ZeroAmountProceduresImportService);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  function tempCsv(name: string, body: string): string {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'scrubber-import-payer-'));
    const filePath = path.join(dir, name);
    writeFileSync(filePath, body, 'utf8');
    return filePath;
  }

  async function tempXlsx(
    name: string,
    headers: string[],
    rows: string[][],
  ): Promise<string> {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'scrubber-import-xlsx-'));
    const filePath = path.join(dir, name);
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Sheet1');
    sheet.addRow(headers);
    for (const row of rows) {
      sheet.addRow(row);
    }
    await workbook.xlsx.writeFile(filePath);
    return filePath;
  }

  it('bcbs: truncate+import upserts prefix/payer rows and syncs lookup cache', async () => {
    invalidateTable.mockClear();
    const filePath = tempCsv(
      'bcbs.csv',
      'Plan A,Plan B\nPAYER1,PAYER2\nabc,def\nABC,PAYER1\n',
    );

    const result = await bcbsImport.importFromFile(filePath, { truncate: true, chunk: 10 });

    expect(result.upserted).toBe(3);
    expect(result.duplicates).toBe(1);

    const row = await prisma.bcbsClaimRouting.findUnique({
      where: { prefix_payerId: { prefix: 'ABC', payerId: 'PAYER1' } },
    });
    expect(row?.description).toBe('Plan A');
    expect(row?.isActive).toBe(true);
    expect(invalidateTable).toHaveBeenCalledWith('bcbs_claim_routings');

    await prisma.bcbsClaimRouting.deleteMany({
      where: { prefix: { in: ['ABC', 'DEF'] } },
    });
  });

  it('mue-87726: imports Code/MINIMUN/MAXIMUN and syncs lookup cache', async () => {
    invalidateTable.mockClear();
    const filePath = tempCsv(
      'mue.csv',
      'Code,MINIMUN,MAXIMUN\n99213,1,3\n,bad,\nJ1234,2,2\n',
    );

    const result = await mueImport.importFromFile(filePath, { truncate: true });

    expect(result.upserted).toBe(2);
    expect(result.skipped).toBe(1);

    const row = await prisma.mue87726Uhc06111Oxford.findUnique({ where: { cptCode: '99213' } });
    expect(row?.min).toBe(1);
    expect(row?.max).toBe(3);
    expect(invalidateTable).toHaveBeenCalledWith('mue_87726_uhc_06111_oxford');

    await prisma.mue87726Uhc06111Oxford.deleteMany({
      where: { cptCode: { in: ['99213', 'J1234'] } },
    });
  });

  it('zero-amount: imports ProcedureCode from Excel and syncs lookup cache', async () => {
    invalidateTable.mockClear();
    const filePath = await tempXlsx(
      'zero.xlsx',
      ['ID', 'ProcedureCode'],
      [['1', '3274'], ['2', 'invalid!'], ['3', '99213']],
    );

    const result = await zeroAmountImport.importFromFile(filePath, { truncate: true });

    expect(result.upserted).toBe(2);
    expect(result.skipped).toBe(1);

    const padded = await prisma.zeroAmountProcedure.findUnique({
      where: { procedureCode: '03274' },
    });
    expect(padded?.isActive).toBe(true);
    expect(invalidateTable).toHaveBeenCalledWith('zero_amount_procedures');

    await prisma.zeroAmountProcedure.deleteMany({
      where: { procedureCode: { in: ['03274', '99213'] } },
    });
  });
});
