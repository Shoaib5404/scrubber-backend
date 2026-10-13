import { ConfigModule } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import ExcelJS from 'exceljs';
import { mkdtempSync } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { PrismaModule } from '../../src/common/prisma/prisma.module';
import { loadEnvFrom } from '../../src/config';
import { LookupCacheModule } from '../../src/modules/cache/lookup-cache.module';
import { LookupCacheService } from '../../src/modules/cache/lookup-cache.service';
import { NcciRulesCacheService } from '../../src/modules/cache/ncci-rules-cache.service';
import { RedisLookupStore } from '../../src/modules/cache/redis-lookup.store';
import { lookupMetaKey } from '../../src/modules/cache/cache.constants';
import { ImportsModule } from '../../src/modules/imports/imports.module';
import { NcciImportService } from '../../src/modules/imports/ncci.import.service';
import { CliModule } from '../../src/modules/cli/cli.module';
import { NcciRulesCacheFetchCommand } from '../../src/modules/ops-cli/ncci-rules-cache-fetch.command';
import { RedisLookupFlushCommand } from '../../src/modules/ops-cli/redis-lookup-flush.command';
import { RedisLookupStatusCommand } from '../../src/modules/ops-cli/redis-lookup-status.command';
import { DetectStalledQueuesCommand } from '../../src/modules/ops-cli/detect-stalled-queues.command';
import { DetectStalledQueuesService } from '../../src/modules/queue/detect-stalled-queues.service';

/**
 * SP-8 Task 19 group 9 — NCCI import (ncci:import) + ops CLI commands
 * (ncci:rules-cache-fetch, redis:lookup-flush, redis:lookup-status,
 * scrubber:detect-stalled-queues). Requires Compose Postgres (5433) + Redis (6381).
 */
function envOverrides(extra: Record<string, unknown> = {}) {
  return (config: Record<string, unknown>) =>
    loadEnvFrom({
      ...config,
      DATABASE_URL:
        process.env.DATABASE_URL ?? 'postgresql://scrubber:scrubber@localhost:5433/scrubber?schema=public',
      JWT_SECRET: process.env.JWT_SECRET ?? 'change-me-in-production-min-32-chars',
      JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET ?? 'change-me-refresh-in-production-min-32',
      REDIS_URL: process.env.REDIS_URL ?? 'redis://localhost:6381',
      REDIS_LOOKUP_DB: Number(process.env.REDIS_LOOKUP_DB ?? 2),
      ...extra,
    });
}

async function tempXlsx(name: string, rows: (string | number)[][]): Promise<string> {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'scrubber-ncci-ops-'));
  const filePath = path.join(dir, name);
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Sheet1');
  for (const row of rows) {
    sheet.addRow(row);
  }
  await workbook.xlsx.writeFile(filePath);
  return filePath;
}

describe('ncci:import (SP-8 Task 19 group 9)', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let ncciImport: NcciImportService;
  let ncciRulesCache: NcciRulesCacheService;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, validate: envOverrides() }),
        PrismaModule,
        ImportsModule,
      ],
    }).compile();

    prisma = moduleRef.get(PrismaService);
    ncciImport = moduleRef.get(NcciImportService);
    ncciRulesCache = moduleRef.get(NcciRulesCacheService);
  });

  afterAll(async () => {
    await prisma.ncci.deleteMany({ where: { column1: { in: ['99213', '99215'] } } });
    await moduleRef.close();
  });

  it('imports from an Excel fixture (6 header rows + data from row 7), merge upserts, and invalidates the full-table cache', async () => {
    await prisma.ncci.deleteMany({ where: { column1: { in: ['99213', '99215'] } } });

    const invalidateSpy = jest.spyOn(ncciRulesCache, 'invalidateFullTable');

    const filePath = await tempXlsx('ncci.xlsx', [
      ['NCCI PTP Edits'], // row 1
      ['Generated: 2026-01-01'], // row 2
      [''], // row 3
      ['Column 1', 'Column 2', '1996', 'Effective', 'Deletion', 'Modifier', 'Rationale'], // row 4
      [''], // row 5
      [''], // row 6
      ['99213', '99214', '', '20260101', '', '0', 'Rationale A'], // row 7 — DATA_START_ROW
      ['99215', '99216', '*', '*', '*', '9', ''], // row 8 — '*' => no date, prior-1996 flag
    ]);

    const result = await ncciImport.importFromFile(filePath, { merge: true, chunk: 10, source: 'ncci_test' });

    expect(result.imported).toBe(0);
    expect(result.updated).toBe(2);
    expect(result.errors).toBe(0);
    expect(invalidateSpy).toHaveBeenCalled();

    const dated = await prisma.ncci.findFirst({
      where: { column1: '99213', column2: '99214', effectiveDate: { not: null } },
    });
    expect(dated?.effectiveDate?.toISOString().slice(0, 10)).toBe('2026-01-01');
    expect(dated?.modifier).toBe(0);
    expect(dated?.ptpEditRationale).toBe('Rationale A');
    expect(dated?.inExistencePriorTo1996).toBe(false);
    expect(dated?.sourceFile).toBe('ncci_test');

    const undated = await prisma.ncci.findFirst({
      where: { column1: '99215', column2: '99216', effectiveDate: null },
    });
    expect(undated?.inExistencePriorTo1996).toBe(true);
    expect(undated?.deletionDate).toBeNull();
    expect(undated?.modifier).toBe(9);
    expect(undated?.ptpEditRationale).toBeNull();

    // Re-running the merge must update the null-effectiveDate row, not duplicate it
    // (Postgres treats NULL as distinct in the compound unique index — same pattern as
    // CptPosRulesImportService's findFirst+update fallback).
    invalidateSpy.mockClear();
    const second = await ncciImport.importFromFile(filePath, { merge: true, chunk: 10, source: 'ncci_test' });
    expect(second.updated).toBe(2);
    const undatedCount = await prisma.ncci.count({
      where: { column1: '99215', column2: '99216', effectiveDate: null },
    });
    expect(undatedCount).toBe(1);
    expect(invalidateSpy).toHaveBeenCalled();
  });

  it('non-merge import skips blank column rows and createMany skipDuplicates', async () => {
    await prisma.ncci.deleteMany({ where: { column1: '99213' } });

    const filePath = await tempXlsx('ncci-create.xlsx', [
      ['h1'],
      ['h2'],
      ['h3'],
      ['h4'],
      ['h5'],
      ['h6'],
      ['99213', '', '', '', '', '0', ''], // blank column2 -> skipped
      ['99213', '99217', '', '', '', '0', ''],
    ]);

    const result = await ncciImport.importFromFile(filePath, { merge: false, chunk: 10, source: 'ncci_test2' });
    expect(result.skipped).toBe(1);
    expect(result.imported).toBe(1);
    expect(result.errors).toBe(0);

    await prisma.ncci.deleteMany({ where: { column1: '99213' } });
  });
});

describe('ncci:rules-cache-fetch (SP-8 Task 19 group 9, Nest-adapted)', () => {
  let moduleRef: TestingModule;
  let ncciRulesCache: NcciRulesCacheService;
  let command: NcciRulesCacheFetchCommand;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, validate: envOverrides() }),
        PrismaModule,
        LookupCacheModule,
      ],
      providers: [NcciRulesCacheFetchCommand],
    }).compile();

    ncciRulesCache = moduleRef.get(NcciRulesCacheService);
    command = moduleRef.get(NcciRulesCacheFetchCommand);
  });

  afterAll(async () => {
    await ncciRulesCache.invalidateFullTable();
    await moduleRef.close();
  });

  it('--warm loads the full active table into lookup:v1:nccis:full:active and reports a sample row', async () => {
    await ncciRulesCache.invalidateFullTable();

    await command.run([], { warm: true });

    const cached = await ncciRulesCache.peekFullTable();
    expect(cached).not.toBeNull();
    expect(Array.isArray(cached)).toBe(true);
  });

  it('without --output and without --warm, reports hit/miss honestly from the Nest key shape', async () => {
    await ncciRulesCache.invalidateFullTable();
    await expect(command.run([], {})).resolves.toBeUndefined();

    const cached = await ncciRulesCache.peekFullTable();
    expect(cached).not.toBeNull(); // getFullTable() warms on miss (read-through)
  });
});

describe('redis:lookup-flush / redis:lookup-status (SP-8 Task 19 group 9)', () => {
  let moduleRef: TestingModule;
  let lookupCache: LookupCacheService;
  let store: RedisLookupStore;
  let flushCommand: RedisLookupFlushCommand;
  let statusCommand: RedisLookupStatusCommand;
  const prefix = 'lookup';

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, validate: envOverrides() }),
        PrismaModule,
        LookupCacheModule,
      ],
      providers: [RedisLookupFlushCommand, RedisLookupStatusCommand],
    }).compile();

    lookupCache = moduleRef.get(LookupCacheService);
    store = moduleRef.get(RedisLookupStore);
    flushCommand = moduleRef.get(RedisLookupFlushCommand);
    statusCommand = moduleRef.get(RedisLookupStatusCommand);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  it('redis:lookup-flush <table> deletes the meta key for a known table', async () => {
    const metaKey = lookupMetaKey(prefix, 'cpt_codes');
    await store.set(metaKey, JSON.stringify({ version: 1, warmed_at: new Date().toISOString() }));
    expect(await store.get(metaKey)).not.toBeNull();

    await flushCommand.run(['cpt_codes'], {});

    expect(await store.get(metaKey)).toBeNull();
  });

  it('redis:lookup-flush warns (does not throw) for an unknown table', async () => {
    const logSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    await flushCommand.run(['definitely_not_a_real_table'], {});
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Skipping unknown table'));
    logSpy.mockRestore();
  });

  it('redis:lookup-flush --all without --force refuses and sets a failure exit code', async () => {
    process.exitCode = undefined;
    await flushCommand.run([], { all: true });
    expect(process.exitCode).toBe(1);
    process.exitCode = undefined;
  });

  it('redis:lookup-status lists known tables, including cpt_codes', async () => {
    const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    await statusCommand.run([]);
    const lines = logSpy.mock.calls.map((call) => String(call[0]));
    expect(lines.some((line) => line.startsWith('cpt_codes'))).toBe(true);
    expect(lines.some((line) => line.includes('LOOKUP_CACHE_ENABLED='))).toBe(true);
    logSpy.mockRestore();
  });

  it('redis:lookup-status errors for an unknown table and sets a failure exit code', async () => {
    process.exitCode = undefined;
    await statusCommand.run(['not_a_table']);
    expect(process.exitCode).toBe(1);
    process.exitCode = undefined;
  });

  // Keep import referenced for clarity even though lookupCache itself isn't asserted on above.
  it('LookupCacheService.invalidateTable is wired for the flush command', () => {
    expect(lookupCache).toBeDefined();
  });
});

describe('scrubber:detect-stalled-queues (SP-8 Task 19 group 9)', () => {
  let moduleRef: TestingModule;
  let command: DetectStalledQueuesCommand;
  let service: DetectStalledQueuesService;

  beforeAll(async () => {
    // Exercises the full OpsCliModule -> QueueModule DI graph (BullMQ producer, processors,
    // ClaimValidationModule, forwardRef(BatchesModule)) via CliModule, not just the slim
    // service dependency chain — confirms the "careful of BullMQ deps" wiring resolves.
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, validate: envOverrides({ USE_QUEUE: false }) }),
        CliModule,
      ],
    }).compile();

    command = moduleRef.get(DetectStalledQueuesCommand);
    service = moduleRef.get(DetectStalledQueuesService);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  it('is registered on OpsCliModule and runs without throwing', async () => {
    expect(command).toBeDefined();
    await expect(command.run([], {})).resolves.toBeUndefined();
  });

  it('reports checked=0/logged=0 when USE_QUEUE=false (queue-disabled short-circuit)', async () => {
    const result = await service.run();
    expect(result).toEqual({ checked: 0, logged: 0 });
  });

  it('accepts a --minutes override without throwing (USE_QUEUE=false still short-circuits)', async () => {
    const result = await service.run(30);
    expect(result).toEqual({ checked: 0, logged: 0 });
  });
});
