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
import { Icd10NcdImportService } from '../../src/modules/imports/icd10-ncd.import.service';
import {
  expandIcdRange,
  isIcdRowMarkerToSkip,
  normalizeCode,
  parseCptListFromCell,
  parseIcd10NcdDate,
  parseResolution,
  splitIcdPrefixAndNumericSuffix,
  stripChangeMarker,
} from '../../src/modules/imports/icd10-ncd.import.helpers';

/**
 * SP-8 Task 19 group 11 — ICD10-NCD import (icd10-ncd:import).
 * Requires Compose Postgres (5433). Port of Laravel App\Console\Commands\ImportIcd10Ncd's
 * carry-forward / section-break / buffer-replay state machine — see
 * Icd10NcdImportService for the full behavioral mapping.
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

async function tempXlsx(name: string, rows: (string | number)[][]): Promise<string> {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'scrubber-icd10-ncd-'));
  const filePath = path.join(dir, name);
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Sheet1');
  for (const row of rows) {
    sheet.addRow(row);
  }
  await workbook.xlsx.writeFile(filePath);
  return filePath;
}

describe('icd10-ncd:import helpers (pure, no DB)', () => {
  describe('stripChangeMarker / normalizeCode', () => {
    it('strips a leading change-marker star but keeps dots and case', () => {
      expect(stripChangeMarker('*A4150')).toBe('A4150');
      expect(stripChangeMarker('**A4150')).toBe('A4150');
      expect(normalizeCode('*a4150.1')).toBe('a4150.1');
      expect(normalizeCode('  A001  ')).toBe('A001');
      expect(normalizeCode('')).toBeNull();
      expect(normalizeCode(null)).toBeNull();
    });
  });

  describe('isIcdRowMarkerToSkip', () => {
    it('matches only all-@ strings of length >= 6', () => {
      expect(isIcdRowMarkerToSkip('@@@@@@')).toBe(true);
      expect(isIcdRowMarkerToSkip('@@@@@@@')).toBe(true);
      expect(isIcdRowMarkerToSkip('@@@@@')).toBe(false);
      expect(isIcdRowMarkerToSkip('A4150')).toBe(false);
      expect(isIcdRowMarkerToSkip('@@@@@A')).toBe(false);
    });
  });

  describe('parseCptListFromCell', () => {
    it('splits on whitespace/comma/semicolon, dedupes, preserves first-seen order', () => {
      expect(parseCptListFromCell('87086, 87088')).toEqual(['87086', '87088']);
      expect(parseCptListFromCell('87086;87088 87086')).toEqual(['87086', '87088']);
      expect(parseCptListFromCell('')).toEqual([]);
      expect(parseCptListFromCell(null)).toEqual([]);
    });
  });

  describe('parseResolution', () => {
    it('parses numeric strings and digit-extracts otherwise, defaulting to 0', () => {
      expect(parseResolution('2')).toBe(2);
      expect(parseResolution('*2')).toBe(2);
      expect(parseResolution('code 2')).toBe(2);
      expect(parseResolution('')).toBe(0);
      expect(parseResolution(null)).toBe(0);
      expect(parseResolution('abc')).toBe(0);
    });
  });

  describe('parseIcd10NcdDate', () => {
    it('parses YYYYMMDD, strips a leading marker, and rejects invalid/empty input', () => {
      expect(parseIcd10NcdDate('20260101')?.toISOString().slice(0, 10)).toBe('2026-01-01');
      expect(parseIcd10NcdDate('*20260101')?.toISOString().slice(0, 10)).toBe('2026-01-01');
      expect(parseIcd10NcdDate('')).toBeNull();
      expect(parseIcd10NcdDate(null)).toBeNull();
      expect(parseIcd10NcdDate('*')).toBeNull();
    });
  });

  describe('splitIcdPrefixAndNumericSuffix', () => {
    it('splits a trailing digit run from its prefix', () => {
      expect(splitIcdPrefixAndNumericSuffix('A4150')).toEqual(['A', '4150', 4150]);
      expect(splitIcdPrefixAndNumericSuffix('A')).toBeNull();
    });
  });

  describe('expandIcdRange', () => {
    it('returns the literal code unchanged when there is no hyphen', () => {
      expect(expandIcdRange('A4150', 2000)).toEqual({ codes: ['A4150'] });
    });

    it('expands an inclusive numeric-suffix range with matching prefix and width', () => {
      expect(expandIcdRange('A4150-A4152', 2000)).toEqual({ codes: ['A4150', 'A4151', 'A4152'] });
    });

    it('falls back to the literal code when prefixes differ', () => {
      expect(expandIcdRange('A4150-B4152', 2000)).toEqual({ codes: ['A4150-B4152'] });
    });

    it('falls back to the literal code when digit widths differ', () => {
      expect(expandIcdRange('A415-A4152', 2000)).toEqual({ codes: ['A415-A4152'] });
    });

    it('falls back to the literal code when the left bound exceeds the right bound', () => {
      expect(expandIcdRange('A4152-A4150', 2000)).toEqual({ codes: ['A4152-A4150'] });
    });

    it('falls back to a literal code and reports rangeExceeded when the span exceeds maxSpan', () => {
      const result = expandIcdRange('A0000-A9999', 10);
      expect(result.codes).toEqual(['A0000-A9999']);
      expect(result.rangeExceeded).toEqual({ code: 'A0000-A9999', span: 9999, maxSpan: 10 });
    });

    it('splits only on the first hyphen (Laravel explode(..., 2))', () => {
      // "A4150-A4152-X" -> left "A4150", right "A4152-X" (no trailing digit run on the right
      // after re-including the second hyphen) -> prefix split fails -> literal fallback.
      expect(expandIcdRange('A4150-A4152-X', 2000)).toEqual({ codes: ['A4150-A4152-X'] });
    });
  });
});

describe('icd10-ncd:import (SP-8 Task 19 group 11)', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let importService: Icd10NcdImportService;
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
    importService = moduleRef.get(Icd10NcdImportService);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  it(
    'carries NCD/CPT forward, replays buffered ICDs onto a late CPT, starts a new section on ' +
      '@@@@@@, re-keys the same CPT into a second ncd_cpt row, expands a numeric ICD range, and ' +
      'strips a leading change-marker star',
    async () => {
      invalidateTable.mockClear();

      // 7 dummy header rows (1-7); data starts at row 8 (--header-row default 7).
      const headerRows: (string | number)[][] = [
        ['ICD10-NCD Workbook'],
        ['Generated 2026-01-01'],
        [''],
        ['NCD', 'Description', 'CPT/HCPCS', 'Eff', 'Term', 'ICD-10', 'ICD Eff', 'ICD Term', 'Resolution'],
        [''],
        [''],
        [''],
      ];

      const filePath = await tempXlsx('icd10-ncd.xlsx', [
        ...headerRows,
        // Row 8 — scenario 1: baseline NCD + CPT + ICD, resolution 1.
        ['123.4', 'Test NCD Description', '99213', '20200101', '', 'A001', '', '', '1'],
        // Row 9 — scenario 2: carried NCD/CPT, second ICD with resolution 2 (denied pair).
        ['', '', '', '', '', 'A002', '', '', '2'],
        // Row 10 — scenario 3: a new CPT joins the section; buffered ICDs (A001 res1, A002
        // res2) replay onto 99214 only. This row's own ICD cell is blank (skippedNoIcd).
        ['', '', '99214', '', '', '', '', '', ''],
        // Row 11 — scenario 4: @@@@@@ section break (no CPT on this row -> section resets).
        ['', '', '', '', '', '@@@@@@', '', '', ''],
        // Row 12 — scenario 5: same CPT "99213" reintroduced in the new section -> a second,
        // distinct ncd_cpt row (sectionId differs even though ncdNumber/desc/cptCode match).
        ['', '', '99213', '', '', 'A010', '', '', '1'],
        // Row 13 — scenario 6: numeric ICD range expands to 3 codes under the same new-section
        // CPT (99213).
        ['', '', '', '', '', 'A4150-A4152', '', '', '1'],
        // Row 14 — scenario 7: leading '*' change-marker stripped from the ICD code.
        ['', '', '', '', '', '*A999', '', '', '1'],
      ]);

      const stats = await importService.importFromFile(filePath, { truncate: true, chunk: 50 });

      // --- stats ---
      expect(stats.rowsRead).toBe(7);
      expect(stats.cptInserted).toBe(3); // 99213 (section 0), 99214 (section 0), 99213 (section 1)
      expect(stats.icdInserted).toBe(9); // 1 + 1 + 2 (replay) + 1 + 3 (range) + 1
      expect(stats.skippedNoIcd).toBe(1); // row 10's own blank ICD cell
      expect(stats.skippedNoCpt).toBe(0);
      expect(stats.skippedIcdMarkers).toBe(1); // row 11
      expect(stats.icdCodesFromRanges).toBe(2); // A4150-A4152 -> 3 codes, +2 over baseline
      expect(stats.descTruncated).toBe(0);

      // --- parent (ncd_cpt) counts ---
      const allCpts = await prisma.ncdCpt.findMany({
        where: { ncdNumber: '123.4' },
        orderBy: { id: 'asc' },
      });
      expect(allCpts).toHaveLength(3);

      const section0Cpt99213 = allCpts[0];
      expect(section0Cpt99213?.cptCode).toBe('99213');
      expect(section0Cpt99213?.ncdDescription).toBe('Test NCD Description');
      expect(section0Cpt99213?.effectiveDate?.toISOString().slice(0, 10)).toBe('2020-01-01');

      const cpt99214 = allCpts.find((row) => row.cptCode === '99214');
      expect(cpt99214).toBeDefined();

      // Same cptCode "99213" appears twice (section 0 and section 1) as two distinct parents.
      const cpt99213Rows = allCpts.filter((row) => row.cptCode === '99213');
      expect(cpt99213Rows).toHaveLength(2);
      expect(cpt99213Rows[0]?.id).not.toBe(cpt99213Rows[1]?.id);

      // --- resolution 2 (denied) rows — the original (99213) plus its buffer replay (99214) ---
      const resolution2Rows = await prisma.ncdIcd.findMany({
        where: { resolutionCode: 2, ncdCpt: { ncdNumber: '123.4' } },
      });
      expect(resolution2Rows).toHaveLength(2);
      expect(resolution2Rows.every((row) => row.icdCode === 'A002')).toBe(true);

      // --- buffer replay onto the late CPT (99214) ---
      const icdsFor99214 = await prisma.ncdIcd.findMany({
        where: { ncdCpt: { id: cpt99214?.id } },
        orderBy: { icdCode: 'asc' },
      });
      expect(icdsFor99214.map((row) => row.icdCode)).toEqual(['A001', 'A002']);

      // --- numeric range expansion + leading-star stripping under the second 99213 parent ---
      const secondSectionCptId = cpt99213Rows[1]?.id;
      const icdsForSecondSection = await prisma.ncdIcd.findMany({
        where: { ncdCptId: secondSectionCptId },
        orderBy: { icdCode: 'asc' },
      });
      expect(icdsForSecondSection.map((row) => row.icdCode)).toEqual([
        'A010',
        'A4150',
        'A4151',
        'A4152',
        'A999',
      ]);

      // --- cache invalidation: the three lookup tables LookupSyncHelper.syncTables targets ---
      expect(invalidateTable).toHaveBeenCalledWith('ncd_cpt');
      expect(invalidateTable).toHaveBeenCalledWith('ncd_icd');
      expect(invalidateTable).toHaveBeenCalledWith('ncd_denied_icd_pairs');
      expect(invalidateTable).toHaveBeenCalledTimes(3);

      await prisma.ncdIcd.deleteMany({ where: { ncdCpt: { ncdNumber: '123.4' } } });
      await prisma.ncdCpt.deleteMany({ where: { ncdNumber: '123.4' } });
    },
  );

  it('truncates ncd_icd then ncd_cpt (child first) before a fresh import', async () => {
    invalidateTable.mockClear();

    const seedCpt = await prisma.ncdCpt.create({
      data: { ncdNumber: 'SEED', ncdDescription: 'seed', cptCode: '00000' },
    });
    await prisma.ncdIcd.create({
      data: { icdCode: 'SEED0', ncdCptId: seedCpt.id, resolutionCode: 1 },
    });

    const filePath = await tempXlsx('icd10-ncd-truncate.xlsx', [
      ['h1'],
      ['h2'],
      ['h3'],
      ['h4'],
      ['h5'],
      ['h6'],
      ['h7'],
      ['999.9', 'Fresh after truncate', '11111', '', '', 'B001', '', '', '1'],
    ]);

    const stats = await importService.importFromFile(filePath, { truncate: true, chunk: 50 });
    expect(stats.cptInserted).toBe(1);
    expect(stats.icdInserted).toBe(1);

    const seedStillThere = await prisma.ncdCpt.findUnique({ where: { id: seedCpt.id } });
    expect(seedStillThere).toBeNull();

    const freshRow = await prisma.ncdCpt.findFirst({ where: { ncdNumber: '999.9' } });
    expect(freshRow?.cptCode).toBe('11111');

    await prisma.ncdIcd.deleteMany({ where: { ncdCpt: { ncdNumber: '999.9' } } });
    await prisma.ncdCpt.deleteMany({ where: { ncdNumber: '999.9' } });
  });

  it('truncates desc longer than 255 chars and counts descTruncated', async () => {
    invalidateTable.mockClear();
    const longDesc = 'D'.repeat(300);

    const filePath = await tempXlsx('icd10-ncd-longdesc.xlsx', [
      ['h1'],
      ['h2'],
      ['h3'],
      ['h4'],
      ['h5'],
      ['h6'],
      ['h7'],
      ['777.7', longDesc, '22222', '', '', 'C001', '', '', '1'],
    ]);

    const stats = await importService.importFromFile(filePath, { truncate: true, chunk: 50 });
    expect(stats.descTruncated).toBe(1);

    const row = await prisma.ncdCpt.findFirst({ where: { ncdNumber: '777.7' } });
    expect(row?.ncdDescription).toHaveLength(255);

    await prisma.ncdIcd.deleteMany({ where: { ncdCpt: { ncdNumber: '777.7' } } });
    await prisma.ncdCpt.deleteMany({ where: { ncdNumber: '777.7' } });
  });
});
