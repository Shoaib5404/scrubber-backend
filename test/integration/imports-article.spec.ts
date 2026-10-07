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
import { ArticleImportService } from '../../src/modules/imports/article.import.service';
import { ArticleImportCommand } from '../../src/modules/imports/article.command';
import { ARTICLE_IMPORT_ORDER } from '../../src/modules/imports/article-import.order';
import { cleanValue, isEmptyRow, normalizeArticleHeader } from '../../src/modules/imports/article-import.helpers';

/**
 * SP-8 Task 19 group 12 — article data import (`article:import`). Port of Laravel
 * App\Console\Commands\ImportArticleData's raw `DB::table($table)->insert()` approach — see
 * ArticleImportService for the full behavioral mapping (information_schema column
 * intersection instead of hand-mapped Prisma models for 37 tables).
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

function tempDir(): string {
  return mkdtempSync(path.join(os.tmpdir(), 'scrubber-article-import-'));
}

function writeCsv(dir: string, name: string, body: string): void {
  writeFileSync(path.join(dir, name), body, 'utf8');
}

describe('article-import.helpers (pure, no DB)', () => {
  describe('cleanValue', () => {
    it('trims and blanks-to-null', () => {
      expect(cleanValue('  foo  ')).toBe('foo');
      expect(cleanValue('')).toBeNull();
      expect(cleanValue('   ')).toBeNull();
      expect(cleanValue(null)).toBeNull();
      expect(cleanValue(undefined)).toBeNull();
    });

    it('treats Excel epoch dates (1900-01-01 / 1899-12-30) as null', () => {
      expect(cleanValue('1900-01-01')).toBeNull();
      expect(cleanValue('1900-01-01 00:00:00')).toBeNull();
      expect(cleanValue('1899-12-30')).toBeNull();
      expect(cleanValue('1899-12-30 00:00:00')).toBeNull();
      expect(cleanValue('1900-01-02')).toBe('1900-01-02');
    });

    it('truncates fractional-second timestamps to 19 chars', () => {
      expect(cleanValue('2023-11-20 13:54:16.540000000')).toBe('2023-11-20 13:54:16');
      expect(cleanValue('2023-11-20 13:54:16')).toBe('2023-11-20 13:54:16');
    });
  });

  describe('isEmptyRow', () => {
    it('is true only when every cell is null/blank', () => {
      expect(isEmptyRow(['', null, '  ', undefined])).toBe(true);
      expect(isEmptyRow([])).toBe(true);
      expect(isEmptyRow(['', 'x'])).toBe(false);
    });
  });

  describe('normalizeArticleHeader', () => {
    it('strips a leading BOM, trims, and lowercases WITHOUT collapsing punctuation/spaces', () => {
      expect(normalizeArticleHeader('\uFEFFArticle_ID')).toBe('article_id');
      expect(normalizeArticleHeader('  ARTICLE_TYPE_ID  ')).toBe('article_type_id');
      // Unlike import.utils.normalizeHeader, spaces are preserved (not punctuation-collapsed) —
      // matches Laravel's strtolower(trim($h)) exactly.
      expect(normalizeArticleHeader('Article Type ID')).toBe('article type id');
    });
  });
});

describe('article:import (SP-8 Task 19 group 12)', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let importService: ArticleImportService;
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
    importService = moduleRef.get(ArticleImportService);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  afterEach(async () => {
    await prisma.articleXIcd10Covered.deleteMany({ where: { articleId: 424242 } });
    await prisma.article.deleteMany({ where: { articleId: 424242 } });
    await prisma.articleTypeLookup.deleteMany({ where: { articleTypeId: { in: [77, 78] } } });
  });

  it('getImportOrder returns the full 37-table Laravel IMPORT_ORDER (lookups -> main -> relations)', () => {
    const order = importService.getImportOrder();
    expect(order).toHaveLength(37);
    expect(order[0]?.table).toBe('article_type_lookup');
    expect(order.at(-1)?.table).toBe('article_x_urls');

    const articleIndex = order.findIndex((entry) => entry.table === 'article');
    const lookupIndex = order.findIndex((entry) => entry.table === 'article_type_lookup');
    const icd10CoveredIndex = order.findIndex((entry) => entry.table === 'article_x_icd10_covered');
    expect(lookupIndex).toBeLessThan(articleIndex);
    expect(articleIndex).toBeLessThan(icd10CoveredIndex);
  });

  it(
    'imports article_type_lookup, article (minimal required columns), and ' +
      'article_x_icd10_covered from CSV; skips blank rows; reports missing files for the ' +
      'other 34 tables',
    async () => {
      const dir = tempDir();

      // article_type_lookup: articleTypeId is the PK (required, no default); description optional.
      writeCsv(
        dir,
        'article_type_lookup.csv',
        'article_type_id,description\n77,"Local Coverage Determination"\n78,"National Coverage Determination"\n\n',
      );

      // article: Prisma `Article` model requires only articleId + articleVersion (everything
      // else, including id/created_at/updated_at, is auto or nullable) — see schema.prisma.
      writeCsv(
        dir,
        'article.csv',
        'article_id,article_version,article_type,title,status\n' +
          '424242,1,77,"Test Article Title",A\n' +
          ',,,,\n', // blank row -> skipped
      );

      // article_x_icd10_covered: articleId/articleVersion/icd10CodeId are required.
      writeCsv(
        dir,
        'article_x_icd10_covered.csv',
        'article_id,article_version,icd10_code_id\n424242,1,A001\n424242,1,A002\n',
      );

      const stats = await importService.importAll({ truncate: true, path: dir, format: 'csv' });

      expect(stats.format).toBe('csv');
      expect(stats.totals.tablesProcessed).toBe(3);
      expect(stats.totals.imported).toBe(2 + 1 + 2); // lookup(2) + article(1) + icd10(2)
      // lookup's trailing blank CSV line + article's explicit all-blank row are each one
      // skipped row (csv-parse with skip_empty_lines:false yields a row for a trailing newline).
      expect(stats.totals.skipped).toBe(2);
      expect(stats.totals.errors).toBe(0);

      const foundTables = stats.tables.filter((t) => t.found).map((t) => t.table);
      expect(foundTables.sort()).toEqual(
        ['article', 'article_type_lookup', 'article_x_icd10_covered'].sort(),
      );
      const missingTables = stats.tables.filter((t) => !t.found);
      expect(missingTables).toHaveLength(34);

      const lookupResult = stats.tables.find((t) => t.table === 'article_type_lookup');
      expect(lookupResult).toMatchObject({ imported: 2, skipped: 1, errors: 0 });

      const articleResult = stats.tables.find((t) => t.table === 'article');
      expect(articleResult).toMatchObject({ imported: 1, skipped: 1, errors: 0 });

      // --- DB verification ---
      const lookupRows = await prisma.articleTypeLookup.findMany({
        where: { articleTypeId: { in: [77, 78] } },
        orderBy: { articleTypeId: 'asc' },
      });
      expect(lookupRows.map((r) => r.description)).toEqual([
        'Local Coverage Determination',
        'National Coverage Determination',
      ]);
      expect(lookupRows[0]?.createdAt).toBeInstanceOf(Date);
      expect(lookupRows[0]?.updatedAt).toBeInstanceOf(Date);

      const article = await prisma.article.findFirst({ where: { articleId: 424242 } });
      expect(article).toMatchObject({
        articleId: 424242,
        articleVersion: 1,
        articleType: 77,
        title: 'Test Article Title',
        status: 'A',
      });

      const icd10Rows = await prisma.articleXIcd10Covered.findMany({
        where: { articleId: 424242 },
        orderBy: { icd10CodeId: 'asc' },
      });
      expect(icd10Rows.map((r) => r.icd10CodeId)).toEqual(['A001', 'A002']);

      // Laravel never calls RedisHelper/cache sync for article:import (unlike icd10-ncd:import).
      expect(invalidateTable).not.toHaveBeenCalled();
    },
  );

  it('--table=article_type_lookup imports only that one table', async () => {
    const dir = tempDir();
    writeCsv(dir, 'article_type_lookup.csv', 'article_type_id,description\n77,"Solo Table Run"\n');
    // Present but should be ignored since --table restricts to article_type_lookup only.
    writeCsv(dir, 'article.csv', 'article_id,article_version\n424242,1\n');

    const stats = await importService.importAll({
      table: 'article_type_lookup',
      truncate: true,
      path: dir,
      format: 'csv',
    });

    expect(stats.tables).toHaveLength(1);
    expect(stats.tables[0]).toMatchObject({ table: 'article_type_lookup', found: true, imported: 1 });
    expect(stats.totals.tablesProcessed).toBe(1);

    const article = await prisma.article.findFirst({ where: { articleId: 424242 } });
    expect(article).toBeNull();

    const row = await prisma.articleTypeLookup.findUnique({ where: { articleTypeId: 77 } });
    expect(row?.description).toBe('Solo Table Run');
  });

  it('skips an entry whose CSV file is missing without throwing', async () => {
    const dir = tempDir();
    // No files written at all.
    const stats = await importService.importAll({
      table: 'article_type_lookup',
      path: dir,
      format: 'csv',
    });

    expect(stats.tables).toHaveLength(1);
    expect(stats.tables[0]).toMatchObject({ table: 'article_type_lookup', found: false, imported: 0 });
    expect(stats.totals.tablesProcessed).toBe(0);
  });

  it('--list prints the table catalog and exits cleanly without touching the DB', async () => {
    const command = moduleRef.get(ArticleImportCommand);
    const exitCodeBefore = process.exitCode;

    await expect(command.run([], { list: true })).resolves.toBeUndefined();

    process.exitCode = exitCodeBefore;
  });

  it('rejects an unknown --table name', async () => {
    await expect(importService.importAll({ table: 'not_a_real_table' })).rejects.toThrow(
      /Unknown table: not_a_real_table/,
    );
  });
});

describe('CliModule (SP-8 Task 19 group 12)', () => {
  it('registers ArticleImportCommand', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, validate: envOverrides }),
        PrismaModule,
        ImportsModule,
      ],
    })
      .overrideProvider(LookupCacheService)
      .useValue({ invalidateTable: jest.fn().mockResolvedValue(undefined) })
      .compile();

    expect(moduleRef.get(ArticleImportCommand)).toBeDefined();

    await moduleRef.close();
  });
});
