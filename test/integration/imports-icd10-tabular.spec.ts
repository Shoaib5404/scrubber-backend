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
import { Icd10TabularImportService } from '../../src/modules/imports/icd10-tabular/icd10-tabular.import.service';
import {
  CHAPTER_CODE_RANGES,
  mapChapterCode,
} from '../../src/modules/imports/icd10-tabular/icd10-tabular-chapter-ranges';
import { DescriptionType } from '../../src/modules/imports/icd10-tabular/icd10-tabular.types';
import { appendRightChar, parseIcd10TabularXml } from '../../src/modules/imports/icd10-tabular/icd10-tabular.parser';

/**
 * SP-8 Task 19 group 13 — ICD-10-CM tabular XML import (`icd10:tabular-import`). Port of Laravel
 * App\Console\Commands\ImportIcd10Tabular + App\Services\ImportLibs\Icd10Parser\* — see
 * Icd10TabularImportService / icd10-tabular.parser.ts / icd10-tabular.writer.ts for the full
 * behavioral mapping (DOM parse, sevenChrDef phrase matching + synthetic 7th-char extension
 * codes, mapChapterCode at write time).
 *
 * Synthetic fixture (not real CMS data) covers, within just chapters `1` (ID) and `19` (INJ):
 *  - A00 tree: non-billable category A00 with a billable child A00.0 (InclusionTerm), a
 *    CodeAlsoNote on A00, and an AdditionalCodeNote wrapper with a non-`<note>` element child
 *    (exercises "ALL element children of note wrappers, not only `<note>`").
 *  - T79 7th-char *category* pattern (deferred phrase, propagated down through a non-dotted
 *    child T79.0) -> synthetic T79.0XXA / T79.0XXD.
 *  - E08.321 7th-char *subcategory* pattern (immediate phrase, resolved on the dotted leaf
 *    itself) -> synthetic E08.3211 / E08.3219.
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

function buildFixtureXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<ICD10CM.tabular>
  <version>2026</version>
  <introduction>
    <title>ICD-10-CM Introduction</title>
    <content>Ignored by the parser (only direct chapter children are parsed).</content>
  </introduction>
  <sectionIndex>
    <sectionRef id="A00-A09" first="A00" last="A09">Intestinal infectious diseases</sectionRef>
  </sectionIndex>
  <chapter>
    <name>1</name>
    <desc>Certain infectious and parasitic diseases</desc>
    <section id="A00-A09">
      <desc>Intestinal infectious diseases</desc>
      <diag>
        <name>A00</name>
        <desc>Cholera</desc>
        <codeAlso>
          <note>code also associated manifestation, if applicable</note>
        </codeAlso>
        <useAdditionalCode>
          <note>Use additional code to identify any retained foreign body, if applicable</note>
          <otherNote>Code first underlying condition</otherNote>
        </useAdditionalCode>
        <diag>
          <name>A00.0</name>
          <desc>Cholera due to Vibrio cholerae 01, biovar cholerae</desc>
          <inclusionTerm>
            <note>Classical cholera</note>
          </inclusionTerm>
        </diag>
      </diag>
    </section>
  </chapter>
  <chapter>
    <name>19</name>
    <desc>Injury, poisoning and certain other consequences of external causes</desc>
    <section id="S00-T88">
      <desc>Injury, poisoning and certain other consequences of external causes classified by body region</desc>
      <diag>
        <name>T79</name>
        <desc>Certain early complications of trauma, not elsewhere classified</desc>
        <sevenChrNote>
          <note>The 7th character is to be added to each code from category T79</note>
        </sevenChrNote>
        <sevenChrDef>
          <extension char="A">initial encounter</extension>
          <extension char="D">subsequent encounter</extension>
        </sevenChrDef>
        <diag>
          <name>T79.0</name>
          <desc>Air embolism (traumatic)</desc>
        </diag>
      </diag>
    </section>
    <section id="E08-E13">
      <desc>Diabetes mellitus due to underlying condition</desc>
      <diag>
        <name>E08</name>
        <desc>Diabetes mellitus due to underlying condition</desc>
        <diag>
          <name>E08.3</name>
          <desc>Diabetes mellitus due to underlying condition with ophthalmic complications</desc>
          <diag>
            <name>E08.321</name>
            <desc>Diabetes mellitus due to underlying condition with mild nonproliferative diabetic retinopathy with macular edema</desc>
            <sevenChrNote>
              <note>A 7th character is to be added to code E08.321 to identify laterality</note>
            </sevenChrNote>
            <sevenChrDef>
              <extension char="1">right eye</extension>
              <extension char="9">unspecified eye</extension>
            </sevenChrDef>
          </diag>
        </diag>
      </diag>
    </section>
  </chapter>
</ICD10CM.tabular>`;
}

function tempXmlFile(name: string, xml: string): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'scrubber-icd10-tabular-'));
  const filePath = path.join(dir, name);
  writeFileSync(filePath, xml, 'utf8');
  return filePath;
}

describe('icd10:tabular-import helpers + parser (pure, no DB)', () => {
  describe('mapChapterCode', () => {
    it('maps known chapter ids (trimmed, case-insensitive) and defaults unknown ids to empty string', () => {
      expect(mapChapterCode('1')).toBe('ID');
      expect(mapChapterCode(' 19 ')).toBe('INJ');
      expect(mapChapterCode('21')).toBe('Z');
      expect(mapChapterCode('22')).toBe('U');
      expect(mapChapterCode('99')).toBe('');
      expect(mapChapterCode('')).toBe('');
    });
  });

  describe('CHAPTER_CODE_RANGES', () => {
    it('maps every abbreviation to its ICD-10-CM chapter code range', () => {
      expect(CHAPTER_CODE_RANGES.ID).toBe('A00-B99');
      expect(CHAPTER_CODE_RANGES.INJ).toBe('S00-T88');
      expect(CHAPTER_CODE_RANGES.Z).toBe('Z00-Z99');
      expect(Object.keys(CHAPTER_CODE_RANGES)).toHaveLength(22);
    });
  });

  describe('DescriptionType', () => {
    it('matches the Laravel int-backed enum values 1-10', () => {
      expect(DescriptionType.Default).toBe(1);
      expect(DescriptionType.IncludeNote).toBe(2);
      expect(DescriptionType.AdditionalCodeNote).toBe(3);
      expect(DescriptionType.Exclude1Note).toBe(4);
      expect(DescriptionType.Exclude2Note).toBe(5);
      expect(DescriptionType.InclusionTerm).toBe(6);
      expect(DescriptionType.ShortDescription).toBe(7);
      expect(DescriptionType.CodeAlsoNote).toBe(8);
      expect(DescriptionType.Notes).toBe(9);
      expect(DescriptionType.CodeFirstNote).toBe(10);
    });
  });

  describe('appendRightChar', () => {
    it('pads on the right to totalSize and is a no-op once input already meets totalSize', () => {
      expect(appendRightChar('T79.0', 'X', 7)).toBe('T79.0XX');
      expect(appendRightChar('E08.321', 'X', 7)).toBe('E08.321');
      expect(appendRightChar('A00', 'X', 6)).toBe('A00XXX');
    });
  });

  describe('parseIcd10TabularXml', () => {
    it('parses 2 chapters, ignores version/introduction/sectionIndex, and builds the A00/T79/E08.321 trees', () => {
      const chapters = parseIcd10TabularXml(buildFixtureXml());
      expect(chapters).toHaveLength(2);

      const chapter1 = chapters[0];
      expect(chapter1?.code).toBe('1');
      expect(chapter1?.isChapter).toBe(true);
      expect(chapter1?.diagnosis).toHaveLength(1);

      const sectionA = chapter1?.diagnosis[0];
      expect(sectionA?.isSection).toBe(true);
      expect(sectionA?.code).toBe('A00-A09');

      const a00 = sectionA?.diagnosis[0];
      expect(a00?.code).toBe('A00');
      expect(a00?.diagnosis).toHaveLength(1);
      expect(a00?.descriptions).toEqual(
        expect.arrayContaining([
          { description: 'code also associated manifestation, if applicable', descriptionType: DescriptionType.CodeAlsoNote },
          {
            description: 'Use additional code to identify any retained foreign body, if applicable',
            descriptionType: DescriptionType.AdditionalCodeNote,
          },
          { description: 'Code first underlying condition', descriptionType: DescriptionType.AdditionalCodeNote },
        ]),
      );

      const a000 = a00?.diagnosis[0];
      expect(a000?.code).toBe('A00.0');
      expect(a000?.diagnosis).toHaveLength(0);
      expect(a000?.descriptions).toContainEqual({
        description: 'Classical cholera',
        descriptionType: DescriptionType.InclusionTerm,
      });

      const chapter19 = chapters[1];
      expect(chapter19?.code).toBe('19');
      expect(chapter19?.diagnosis).toHaveLength(2);

      const sectionT = chapter19?.diagnosis[0];
      expect(sectionT?.code).toBe('S00-T88');
      const t79 = sectionT?.diagnosis[0];
      expect(t79?.code).toBe('T79');
      const t790 = t79?.diagnosis[0];
      expect(t790?.code).toBe('T79.0');
      expect(t790?.diagnosis).toHaveLength(2);
      expect(t790?.diagnosis.map((d) => d.code)).toEqual(['T79.0XXA', 'T79.0XXD']);
      expect(t790?.diagnosis[0]?.descriptions[0]?.description).toBe('Air embolism (traumatic), initial encounter');
      expect(t790?.diagnosis[1]?.descriptions[0]?.description).toBe('Air embolism (traumatic), subsequent encounter');
      expect(t790?.diagnosis.every((d) => d.diagnosis.length === 0)).toBe(true);

      const sectionE = chapter19?.diagnosis[1];
      expect(sectionE?.code).toBe('E08-E13');
      const e08 = sectionE?.diagnosis[0];
      const e083 = e08?.diagnosis[0];
      expect(e083?.code).toBe('E08.3');
      const e08321 = e083?.diagnosis[0];
      expect(e08321?.code).toBe('E08.321');
      expect(e08321?.diagnosis.map((d) => d.code)).toEqual(['E08.3211', 'E08.3219']);
      expect(e08321?.diagnosis[0]?.descriptions[0]?.description).toContain(', right eye');
      expect(e08321?.diagnosis[1]?.descriptions[0]?.description).toContain(', unspecified eye');
    });

    it('warns and leaves sevenChrDef unresolved when the sevenChrNote phrase does not match the known list', () => {
      const warn = jest.fn();
      const xml = `<?xml version="1.0"?>
<ICD10CM.tabular>
  <chapter>
    <name>1</name>
    <section id="Z00-Z09">
      <diag>
        <name>Z00</name>
        <desc>Unmatched 7th char case</desc>
        <sevenChrNote>
          <note>Some unrecognized phrasing that mentions nothing from the known list</note>
        </sevenChrNote>
        <sevenChrDef>
          <extension char="A">initial encounter</extension>
        </sevenChrDef>
      </diag>
    </section>
  </chapter>
</ICD10CM.tabular>`;

      const chapters = parseIcd10TabularXml(xml, warn);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0]?.[0]).toContain('Z00');

      const z00 = chapters[0]?.diagnosis[0]?.diagnosis[0];
      expect(z00?.code).toBe('Z00');
      expect(z00?.diagnosis).toHaveLength(0);
    });

    it('throws for a non-ICD10CM.tabular root element', () => {
      expect(() => parseIcd10TabularXml('<not-the-right-root/>')).toThrow(/ICD10CM\.tabular/);
    });
  });
});

describe('icd10:tabular-import (SP-8 Task 19 group 13)', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let importService: Icd10TabularImportService;
  let invalidateTable: jest.Mock;

  beforeAll(async () => {
    invalidateTable = jest.fn().mockResolvedValue(undefined);

    moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, validate: envOverrides }), PrismaModule, ImportsModule],
    })
      .overrideProvider(LookupCacheService)
      .useValue({ invalidateTable })
      .compile();

    prisma = moduleRef.get(PrismaService);
    importService = moduleRef.get(Icd10TabularImportService);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  async function cleanupFixtureRows(): Promise<void> {
    // Deleting the top-level (chapter) rows cascades descriptions + the whole descendant
    // subtree (section/diag/synthetic-leaf) via the schema's onDelete: Cascade FKs.
    await prisma.icd10TabularCode.deleteMany({
      where: { isChapter: true, code: { in: ['ID', 'INJ', 'A00-B99', 'S00-T88'] } },
    });
  }

  afterEach(async () => {
    await cleanupFixtureRows();
  });

  it('dry-run parses without any database writes', async () => {
    invalidateTable.mockClear();
    const filePath = tempXmlFile('icd10-tabular-dry-run.xml', buildFixtureXml());

    const beforeCount = await prisma.icd10TabularCode.count();
    const stats = await importService.importFromFile(filePath, { dryRun: true, truncate: true });

    expect(stats.chapterCount).toBe(2);
    expect(stats.written).toBe(0);
    expect(await prisma.icd10TabularCode.count()).toBe(beforeCount);
    expect(invalidateTable).not.toHaveBeenCalled();
  });

  it(
    'truncate+import writes the mapped chapter codes, the A00 tree (non-billable parent / ' +
      'billable child / InclusionTerm / CodeAlsoNote), the T79 category-pattern synthetic 7th-char ' +
      'codes, and the E08.321 subcategory-pattern synthetic 7th-char codes, then syncs the lookup cache',
    async () => {
      invalidateTable.mockClear();
      const filePath = tempXmlFile('icd10-tabular-import.xml', buildFixtureXml());
      const effectiveDate = new Date('2026-01-01T00:00:00.000Z');

      const stats = await importService.importFromFile(filePath, {
        truncate: true,
        effectiveDate,
      });

      // Writer processes every node in the tree (same recursive shape as the dry-run count).
      expect(stats.written).toBe(stats.diagnosisNodeCount);

      const chapterId = await prisma.icd10TabularCode.findFirst({ where: { code: 'ID', isChapter: true } });
      const chapterInj = await prisma.icd10TabularCode.findFirst({ where: { code: 'INJ', isChapter: true } });
      expect(chapterId).not.toBeNull();
      expect(chapterInj).not.toBeNull();
      expect(chapterId?.parentId).toBeNull();
      expect(chapterId?.effectiveStartDate?.toISOString().slice(0, 10)).toBe('2026-01-01');

      const sectionA = await prisma.icd10TabularCode.findFirst({
        where: { code: 'A00-A09', isSection: true, parentId: chapterId?.id },
      });
      expect(sectionA).not.toBeNull();

      const a00 = await prisma.icd10TabularCode.findFirst({
        where: { code: 'A00', parentId: sectionA?.id },
        include: { descriptions: true },
      });
      expect(a00?.isBillable).toBe(false);
      expect(a00?.descriptions.map((d) => d.descriptionType)).toEqual(
        expect.arrayContaining([
          DescriptionType.CodeAlsoNote,
          DescriptionType.AdditionalCodeNote,
          DescriptionType.AdditionalCodeNote,
        ]),
      );
      expect(a00?.descriptions).toHaveLength(4); // Default desc + CodeAlso + 2x AdditionalCode

      const a000 = await prisma.icd10TabularCode.findFirst({
        where: { code: 'A00.0', parentId: a00?.id },
        include: { descriptions: true },
      });
      expect(a000?.isBillable).toBe(true);
      expect(a000?.descriptions).toContainEqual(
        expect.objectContaining({ description: 'Classical cholera', descriptionType: DescriptionType.InclusionTerm }),
      );

      const t790XXA = await prisma.icd10TabularCode.findFirst({
        where: { code: 'T79.0XXA' },
        include: { descriptions: true },
      });
      const t790XXD = await prisma.icd10TabularCode.findFirst({
        where: { code: 'T79.0XXD' },
        include: { descriptions: true },
      });
      expect(t790XXA?.isBillable).toBe(true);
      expect(t790XXD?.isBillable).toBe(true);
      expect(t790XXA?.descriptions[0]?.description).toBe('Air embolism (traumatic), initial encounter');
      expect(t790XXD?.descriptions[0]?.description).toBe('Air embolism (traumatic), subsequent encounter');

      const e083211 = await prisma.icd10TabularCode.findFirst({ where: { code: 'E08.3211' } });
      const e083219 = await prisma.icd10TabularCode.findFirst({ where: { code: 'E08.3219' } });
      expect(e083211?.isBillable).toBe(true);
      expect(e083219?.isBillable).toBe(true);

      expect(invalidateTable).toHaveBeenCalledTimes(1);
      expect(invalidateTable).toHaveBeenCalledWith('icd10_tabular_codes');
    },
  );

  it('defaults --effective-date to today (UTC) when not provided', async () => {
    invalidateTable.mockClear();
    const filePath = tempXmlFile('icd10-tabular-default-date.xml', buildFixtureXml());

    await importService.importFromFile(filePath, { truncate: true });

    const chapterId = await prisma.icd10TabularCode.findFirst({ where: { code: 'ID', isChapter: true } });
    const expectedToday = new Date().toISOString().slice(0, 10);
    expect(chapterId?.effectiveStartDate?.toISOString().slice(0, 10)).toBe(expectedToday);
  });

  it('--update-chapter-code-ranges rewrites ID -> A00-B99 (and INJ -> S00-T88), then is idempotent', async () => {
    invalidateTable.mockClear();
    const filePath = tempXmlFile('icd10-tabular-ranges.xml', buildFixtureXml());
    await importService.importFromFile(filePath, { truncate: true });

    invalidateTable.mockClear();
    const first = await importService.updateChapterCodeRanges();
    expect(first.updated).toBe(2); // ID -> A00-B99, INJ -> S00-T88
    expect(invalidateTable).toHaveBeenCalledWith('icd10_tabular_codes');

    const chapterRange = await prisma.icd10TabularCode.findFirst({ where: { code: 'A00-B99', isChapter: true } });
    expect(chapterRange).not.toBeNull();
    const injRange = await prisma.icd10TabularCode.findFirst({ where: { code: 'S00-T88', isChapter: true } });
    expect(injRange).not.toBeNull();

    const second = await importService.updateChapterCodeRanges();
    expect(second.updated).toBe(0); // already converted -> no rows still match the abbreviation codes
  });
});
