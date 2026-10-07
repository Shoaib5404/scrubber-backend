import { Injectable, Logger } from '@nestjs/common';
import { existsSync } from 'fs';
import * as path from 'path';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ARTICLE_IMPORT_ORDER, ArticleImportEntry } from './article-import.order';
import { cleanValue, isEmptyRow, normalizeArticleHeader } from './article-import.helpers';
import { loadExcelRows, parseCsvFile } from './import.utils';

export type ArticleImportFormat = 'csv' | 'xlsx';

export interface ArticleImportOptions {
  /** Import only this table (must be a table name present in ARTICLE_IMPORT_ORDER). */
  table?: string;
  /** Rows per INSERT batch. Laravel default: 1000. */
  chunk?: number;
  /** Truncate the selected tables (child-first) before importing. Laravel `--fresh`. */
  truncate?: boolean;
  /** Data directory. Laravel default: `import/article_csv`. */
  path?: string;
  format?: ArticleImportFormat;
}

export interface ArticleTableImportResult {
  table: string;
  csv: string;
  phase: string;
  found: boolean;
  rowsRead: number;
  imported: number;
  skipped: number;
  errors: number;
}

export interface ArticleImportStats {
  dataPath: string;
  format: ArticleImportFormat;
  tables: ArticleTableImportResult[];
  totals: {
    tablesProcessed: number;
    imported: number;
    skipped: number;
    errors: number;
  };
}

const DEFAULT_CHUNK = 1000;
const DEFAULT_RELATIVE_PATH = 'import/article_csv';

/**
 * Laravel App\Console\Commands\ImportArticleData (`article:import`).
 *
 * Rather than hand-mapping 35+ Prisma models (`Prisma.ArticleCreateManyInput`, etc. per table),
 * this mirrors Laravel's `DB::table($table)->insert($batch)` approach directly: headers are
 * intersected against `information_schema.columns` for the target table and inserted via
 * parameterized `INSERT INTO "table" (...) VALUES (...), ...` through `$executeRawUnsafe`.
 * See SP-8 Task 19 group 12 notes for the full rationale.
 */
@Injectable()
export class ArticleImportService {
  private readonly logger = new Logger(ArticleImportService.name);

  /**
   * `information_schema.columns` lookups are cached per table for the life of the process:
   * column name -> Postgres internal type name (`udt_name`, e.g. `int4`, `varchar`,
   * `timestamp`). The type is needed to emit an explicit `::type` cast per placeholder —
   * `$executeRawUnsafe` sends every JS string parameter as a `text`-typed bind value, and
   * Postgres rejects `text -> integer` assignment into a target column without a cast
   * (`column "x" is of type integer but expression is of type text`), unlike Laravel's PDO
   * driver which lets MySQL/Postgres coerce untyped positional binds implicitly.
   */
  private readonly columnCache = new Map<string, Map<string, string>>();

  constructor(private readonly prisma: PrismaService) {}

  getImportOrder(): readonly ArticleImportEntry[] {
    return ARTICLE_IMPORT_ORDER;
  }

  resolveImports(table?: string): ArticleImportEntry[] {
    if (!table) {
      return [...ARTICLE_IMPORT_ORDER];
    }
    const matches = ARTICLE_IMPORT_ORDER.filter((entry) => entry.table === table);
    if (matches.length === 0) {
      throw new Error(`Unknown table: ${table}. Run with --list to see available tables.`);
    }
    return matches;
  }

  /** Column name -> Postgres type (`udt_name`) for `public."table"`, cached. Empty => no such table. */
  async getTableColumnTypes(table: string): Promise<Map<string, string>> {
    const cached = this.columnCache.get(table);
    if (cached) {
      return cached;
    }

    const rows = await this.prisma.$queryRawUnsafe<{ column_name: string; udt_name: string }[]>(
      'SELECT column_name, udt_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2',
      'public',
      table,
    );
    const types = new Map(rows.map((row) => [row.column_name, row.udt_name] as const));
    this.columnCache.set(table, types);
    return types;
  }

  /** `information_schema.columns` for `public."table"`, cached. Empty set => table doesn't exist. */
  async getTableColumns(table: string): Promise<Set<string>> {
    const types = await this.getTableColumnTypes(table);
    return new Set(types.keys());
  }

  /**
   * Laravel ImportArticleData::truncateTables — reverse dependency order (children before
   * parents), `Schema::disableForeignKeyConstraints()` around the loop. Postgres equivalent:
   * `RESTART IDENTITY CASCADE` truncates dependent rows automatically without a global FK
   * toggle, so tables can be truncated in any order; reverse order is kept to match Laravel.
   */
  async truncateTables(imports: readonly ArticleImportEntry[]): Promise<void> {
    const reversed = [...imports].reverse();
    for (const entry of reversed) {
      const columns = await this.getTableColumns(entry.table);
      if (columns.size === 0) {
        this.logger.warn(`  Skip truncate (table not found): ${entry.table}`);
        continue;
      }
      await this.prisma.$executeRawUnsafe(`TRUNCATE TABLE "${entry.table}" RESTART IDENTITY CASCADE`);
      this.logger.log(`  Truncated: ${entry.table}`);
    }
  }

  async importAll(options: ArticleImportOptions = {}): Promise<ArticleImportStats> {
    const format: ArticleImportFormat = options.format === 'xlsx' ? 'xlsx' : 'csv';
    const chunkSize = Math.max(1, options.chunk ?? DEFAULT_CHUNK);
    const dataPath = options.path
      ? path.isAbsolute(options.path)
        ? options.path
        : path.resolve(process.cwd(), options.path)
      : path.resolve(process.cwd(), DEFAULT_RELATIVE_PATH);

    const imports = this.resolveImports(options.table);

    if (options.truncate) {
      await this.truncateTables(imports);
    }

    const tables: ArticleTableImportResult[] = [];
    const totals = { tablesProcessed: 0, imported: 0, skipped: 0, errors: 0 };

    for (const entry of imports) {
      const fileName = format === 'xlsx' ? entry.csv.replace(/\.csv$/, '.xlsx') : entry.csv;
      const filePath = path.join(dataPath, fileName);

      if (!existsSync(filePath)) {
        this.logger.warn(`  SKIP ${entry.table} — file not found: ${fileName}`);
        tables.push({
          table: entry.table,
          csv: entry.csv,
          phase: entry.phase,
          found: false,
          rowsRead: 0,
          imported: 0,
          skipped: 0,
          errors: 0,
        });
        continue;
      }

      const result = await this.importFileToTable(filePath, entry.table, chunkSize, format);
      tables.push({ table: entry.table, csv: entry.csv, phase: entry.phase, found: true, ...result });

      totals.tablesProcessed += 1;
      totals.imported += result.imported;
      totals.skipped += result.skipped;
      totals.errors += result.errors;
    }

    return { dataPath, format, tables, totals };
  }

  /**
   * Laravel ImportArticleData::importCsvToTable / importExcelToTable, unified: both readers
   * return `string[][]` (header row + data rows), so the header-matching / cleanValue / batching
   * logic is shared regardless of source format.
   */
  async importFileToTable(
    filePath: string,
    table: string,
    chunkSize: number,
    format: ArticleImportFormat,
  ): Promise<{ rowsRead: number; imported: number; skipped: number; errors: number }> {
    const rawRows = format === 'xlsx' ? await loadExcelRows(filePath) : parseCsvFile(filePath);

    if (rawRows.length === 0) {
      this.logger.error(`    Empty or unreadable file: ${filePath}`);
      return { rowsRead: 0, imported: 0, skipped: 0, errors: 1 };
    }

    const headers = rawRows[0]!.map((h) => normalizeArticleHeader(h ?? ''));
    const dataRows = rawRows.slice(1);
    const columnTypes = await this.getTableColumnTypes(table);

    if (columnTypes.size === 0) {
      this.logger.error(`    Table not found: ${table}`);
      return { rowsRead: dataRows.length, imported: 0, skipped: 0, errors: 1 };
    }

    // Last matching header wins per column — mirrors PHP's forward `foreach` overwrite.
    const headerIndexByColumn = new Map<string, number>();
    headers.forEach((header, index) => {
      if (columnTypes.has(header)) {
        headerIndexByColumn.set(header, index);
      }
    });

    const hasTimestamps = columnTypes.has('created_at');
    // created_at/updated_at are always set to now() below (Laravel overwrites any CSV value
    // for these columns after building $record), so exclude them from the CSV-sourced columns.
    const dataColumns = [...headerIndexByColumn.keys()].filter(
      (column) => !hasTimestamps || (column !== 'created_at' && column !== 'updated_at'),
    );
    const finalColumns = hasTimestamps ? [...dataColumns, 'created_at', 'updated_at'] : dataColumns;

    let imported = 0;
    let skipped = 0;
    let errors = 0;
    let batch: unknown[][] = [];

    const flush = async (): Promise<void> => {
      if (batch.length === 0) {
        return;
      }
      const result = await this.persistBatch(table, finalColumns, columnTypes, batch);
      imported += result.ok;
      errors += result.fail;
      batch = [];
    };

    for (const row of dataRows) {
      if (dataColumns.length === 0 || isEmptyRow(row)) {
        skipped += 1;
        continue;
      }

      const values: unknown[] = dataColumns.map((column) => cleanValue(row[headerIndexByColumn.get(column)!]));
      if (hasTimestamps) {
        const now = new Date();
        values.push(now, now);
      }

      batch.push(values);
      if (batch.length >= chunkSize) {
        await flush();
      }
    }
    await flush();

    const parts = [`    Done: ${imported} rows`];
    if (skipped) parts.push(`${skipped} skipped`);
    if (errors) parts.push(`${errors} errors`);
    this.logger.log(parts.join(', '));

    return { rowsRead: dataRows.length, imported, skipped, errors };
  }

  /**
   * Laravel ImportArticleData::persistBatch — try a multi-row insert, fall back to row-by-row
   * on failure so a single bad row doesn't sink the whole batch; the first 5 row errors are
   * logged, the rest are counted silently.
   */
  private async persistBatch(
    table: string,
    columns: string[],
    columnTypes: Map<string, string>,
    rows: unknown[][],
  ): Promise<{ ok: number; fail: number }> {
    if (columns.length === 0 || rows.length === 0) {
      return { ok: 0, fail: 0 };
    }

    try {
      const { sql, params } = this.buildInsertSql(table, columns, columnTypes, rows);
      await this.prisma.$executeRawUnsafe(sql, ...params);
      return { ok: rows.length, fail: 0 };
    } catch {
      let ok = 0;
      let fail = 0;

      for (const row of rows) {
        try {
          const { sql, params } = this.buildInsertSql(table, columns, columnTypes, [row]);
          await this.prisma.$executeRawUnsafe(sql, ...params);
          ok += 1;
        } catch (rowError) {
          fail += 1;
          if (fail <= 5) {
            const message = rowError instanceof Error ? rowError.message : String(rowError);
            this.logger.warn(`    Row error in ${table}: ${message.slice(0, 200)}`);
          }
        }
      }

      if (fail > 5) {
        this.logger.warn(`    ... and ${fail - 5} more row errors suppressed`);
      }

      return { ok, fail };
    }
  }

  /**
   * Every placeholder is cast to its column's Postgres type (`$1::"udt_name"`) — see the
   * `columnCache` doc comment on why this is required for `$executeRawUnsafe` multi-row inserts
   * against non-text columns.
   */
  private buildInsertSql(
    table: string,
    columns: string[],
    columnTypes: Map<string, string>,
    rows: unknown[][],
  ): { sql: string; params: unknown[] } {
    const columnSql = columns.map((column) => `"${column}"`).join(', ');
    const params: unknown[] = [];

    const valueGroups = rows.map((row) => {
      const placeholders = row.map((value, index) => {
        params.push(value);
        const columnType = columnTypes.get(columns[index]!);
        return columnType ? `$${params.length}::"${columnType}"` : `$${params.length}`;
      });
      return `(${placeholders.join(', ')})`;
    });

    return {
      sql: `INSERT INTO "${table}" (${columnSql}) VALUES ${valueGroups.join(', ')}`,
      params,
    };
  }
}
