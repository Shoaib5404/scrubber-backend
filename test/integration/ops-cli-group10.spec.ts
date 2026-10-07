import { Logger } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import * as argon2 from 'argon2';
import { mkdtempSync, readFileSync, writeFileSync } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { loadEnvFrom } from '../../src/config';
import { lookupMetaKey } from '../../src/modules/cache/cache.constants';
import { LookupCacheService } from '../../src/modules/cache/lookup-cache.service';
import { RedisLookupStore } from '../../src/modules/cache/redis-lookup.store';
import { CliModule } from '../../src/modules/cli/cli.module';
import { ApiClientCreateCommand } from '../../src/modules/ops-cli/api-client-create.command';
import { BatchTestCommand } from '../../src/modules/ops-cli/batch-test.command';
import { BatchValidateCommand } from '../../src/modules/ops-cli/batch-validate.command';
import { EdiParseCommand } from '../../src/modules/ops-cli/edi-parse.command';
import { QueueTestCommand } from '../../src/modules/ops-cli/queue-test.command';
import { ReferenceApiIssueCommand } from '../../src/modules/ops-cli/reference-api-issue.command';
import { RedisFlushCommand } from '../../src/modules/ops-cli/redis-flush.command';
import { StatusCheckCommand } from '../../src/modules/ops-cli/status-check.command';

/**
 * SP-8 Task 19 group 10 — api-client:create, reference-api:issue, redis:flush,
 * status:check, batch:validate, edi:parse, queue:test, batch:test.
 * Requires Compose Postgres (5433) + Redis (6381), via the full `CliModule` DI graph (same
 * wiring `npm run cli` loads) to prove `OpsCliModule`'s new imports resolve without DI breaks.
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
      USE_QUEUE: false,
      EDI837_VALIDATION_STRICT: false,
      ...extra,
    });
}

function readEdiFixture(): string {
  return readFileSync(path.join(__dirname, '../golden/fixtures/minimal-837p.edi'), 'utf8').replace(
    /\r?\n/g,
    '',
  );
}

function writeTempEdiFile(dirPrefix: string): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), dirPrefix));
  const filePath = path.join(dir, 'minimal.edi');
  writeFileSync(filePath, readEdiFixture(), 'utf8');
  return filePath;
}

describe('SP-8 Task 19 group 10 — ops-cli', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let lookupStore: RedisLookupStore;

  let apiClientCreate: ApiClientCreateCommand;
  let referenceApiIssue: ReferenceApiIssueCommand;
  let redisFlush: RedisFlushCommand;
  let statusCheck: StatusCheckCommand;
  let batchValidate: BatchValidateCommand;
  let ediParse: EdiParseCommand;
  let queueTest: QueueTestCommand;
  let batchTest: BatchTestCommand;

  const createdUserIds: number[] = [];
  const createdClientIds: number[] = [];
  const createdBatchIds: number[] = [];

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, validate: envOverrides() }), CliModule],
    }).compile();

    prisma = moduleRef.get(PrismaService);
    lookupStore = moduleRef.get(RedisLookupStore);
    // Keep the import referenced for clarity (not asserted on directly below).
    void moduleRef.get(LookupCacheService);

    apiClientCreate = moduleRef.get(ApiClientCreateCommand);
    referenceApiIssue = moduleRef.get(ReferenceApiIssueCommand);
    redisFlush = moduleRef.get(RedisFlushCommand);
    statusCheck = moduleRef.get(StatusCheckCommand);
    batchValidate = moduleRef.get(BatchValidateCommand);
    ediParse = moduleRef.get(EdiParseCommand);
    queueTest = moduleRef.get(QueueTestCommand);
    batchTest = moduleRef.get(BatchTestCommand);
  });

  afterAll(async () => {
    await prisma.apiClient.deleteMany({ where: { id: { in: createdClientIds } } });
    await prisma.serviceLine.deleteMany({ where: { claim: { batchFileId: { in: createdBatchIds } } } });
    await prisma.claimDiagnosis.deleteMany({ where: { claim: { batchFileId: { in: createdBatchIds } } } });
    await prisma.claim.deleteMany({ where: { batchFileId: { in: createdBatchIds } } });
    await prisma.batchFile.deleteMany({ where: { id: { in: createdBatchIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await moduleRef.close();
  });

  describe('api-client:create', () => {
    it('creates a hashed secret for a seeded customer user and prints the fields once', async () => {
      const stamp = Date.now();
      const user = await prisma.user.create({
        data: {
          name: 'Group10 Customer',
          email: `group10-customer-${stamp}@example.com`,
          password: 'irrelevant-login-hash',
          role: 'customer',
        },
      });
      createdUserIds.push(user.id);

      const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
      await apiClientCreate.run([String(user.id)], { name: 'Test Client' });

      const client = await prisma.apiClient.findUnique({ where: { userId: user.id } });
      expect(client).not.toBeNull();
      createdClientIds.push(client!.id);
      expect(client!.clientId.startsWith('ns_live_')).toBe(true);
      expect(client!.name).toBe('Test Client');
      expect(client!.scopes).toEqual(['batches:read', 'batches:write', 'validate']);

      // Secret must be hashed at rest (Nest verifies hashed secrets) — never plaintext.
      expect(client!.clientSecret.startsWith('$argon2')).toBe(true);

      const printedLine = logSpy.mock.calls
        .map((call) => String(call[0]))
        .find((line) => line.startsWith('Client Secret: '));
      logSpy.mockRestore();
      expect(printedLine).toBeDefined();
      const plainSecret = printedLine!.slice('Client Secret: '.length);
      expect(plainSecret).toHaveLength(48);
      await expect(argon2.verify(client!.clientSecret, plainSecret)).resolves.toBe(true);
    });

    it('fails cleanly for a non-customer user', async () => {
      const stamp = Date.now();
      const user = await prisma.user.create({
        data: {
          name: 'Group10 Staff',
          email: `group10-staff-${stamp}@example.com`,
          password: 'irrelevant-login-hash',
          role: 'admin',
        },
      });
      createdUserIds.push(user.id);

      process.exitCode = undefined;
      await apiClientCreate.run([String(user.id)], {});
      expect(process.exitCode).toBe(1);
      process.exitCode = undefined;
    });

    it('fails cleanly for an unknown user', async () => {
      process.exitCode = undefined;
      await apiClientCreate.run(['not-a-real-user@example.com'], {});
      expect(process.exitCode).toBe(1);
      process.exitCode = undefined;
    });
  });

  describe('reference-api:issue', () => {
    it('issues a service client (userId null) with the default reference:read scope', async () => {
      const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
      await referenceApiIssue.run([], {});

      const lines = logSpy.mock.calls.map((call) => String(call[0]));
      logSpy.mockRestore();
      const clientIdLine = lines.find((line) => line.startsWith('client_id: '));
      expect(clientIdLine).toBeDefined();
      const clientId = clientIdLine!.slice('client_id: '.length);

      const client = await prisma.apiClient.findUnique({ where: { clientId } });
      expect(client).not.toBeNull();
      createdClientIds.push(client!.id);
      expect(client!.userId).toBeNull();
      expect(client!.scopes).toEqual(['reference:read']);
      expect(client!.name).toBe('Tele-Wound');
      expect(client!.clientSecret.startsWith('$argon2')).toBe(true);
    });

    it('honors repeated --scopes and a custom name', async () => {
      const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
      await referenceApiIssue.run(['Partner X'], { scopes: ['reference:read', 'batches:read'] });

      const lines = logSpy.mock.calls.map((call) => String(call[0]));
      logSpy.mockRestore();
      const clientIdLine = lines.find((line) => line.startsWith('client_id: '));
      const clientId = clientIdLine!.slice('client_id: '.length);

      const client = await prisma.apiClient.findUnique({ where: { clientId } });
      createdClientIds.push(client!.id);
      expect(client!.name).toBe('Partner X');
      expect(client!.scopes).toEqual(['reference:read', 'batches:read']);
    });
  });

  describe('redis:flush', () => {
    it('flushes a known lookup-backed group (cpt_codes) and invalidates its meta key', async () => {
      const prefix = lookupStore.keyPrefix();
      const metaKey = lookupMetaKey(prefix, 'cpt_codes');
      await lookupStore.set(metaKey, JSON.stringify({ warmed_at: new Date().toISOString() }));
      expect(await lookupStore.get(metaKey)).not.toBeNull();

      await redisFlush.run(['cpt_codes'], {});

      expect(await lookupStore.get(metaKey)).toBeNull();
    });

    it('refuses --all without --force', async () => {
      process.exitCode = undefined;
      await redisFlush.run([], { all: true });
      expect(process.exitCode).toBe(1);
      process.exitCode = undefined;
    });

    it('prints usage and exits 1 with no arguments', async () => {
      process.exitCode = undefined;
      await redisFlush.run([], {});
      expect(process.exitCode).toBe(1);
      process.exitCode = undefined;
    });

    it('--list prints the known groups without throwing', async () => {
      await expect(redisFlush.run([], { list: true })).resolves.toBeUndefined();
    });
  });

  describe('status:check', () => {
    it('runs without throwing, with and without --claims', async () => {
      await expect(statusCheck.run([], {})).resolves.toBeUndefined();
      await expect(statusCheck.run([], { claims: true })).resolves.toBeUndefined();
    });
  });

  describe('batch:validate', () => {
    it('fails cleanly when no batch id or "all" is given', async () => {
      process.exitCode = undefined;
      await batchValidate.run([]);
      expect(process.exitCode).toBe(1);
      process.exitCode = undefined;
    });

    it('fails cleanly for a nonexistent batch id', async () => {
      process.exitCode = undefined;
      await batchValidate.run(['999999999']);
      expect(process.exitCode).toBe(1);
      process.exitCode = undefined;
    });
  });

  describe('edi:parse', () => {
    it('parses a tiny ISA/837P fixture written to a temp file', async () => {
      const filePath = writeTempEdiFile('scrubber-edi-parse-');

      const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
      await ediParse.run([filePath], {});

      const lines = logSpy.mock.calls.map((call) => String(call[0]));
      logSpy.mockRestore();
      expect(lines.some((line) => line.includes('Total Claims: 1'))).toBe(true);
    });

    it('--json outputs the parsed batch as JSON', async () => {
      const filePath = writeTempEdiFile('scrubber-edi-parse-json-');

      const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
      await ediParse.run([filePath], { json: true });

      const jsonLine = logSpy.mock.calls.map((call) => String(call[0])).find((line) => line.startsWith('{'));
      logSpy.mockRestore();
      expect(jsonLine).toBeDefined();
      const parsed = JSON.parse(jsonLine!);
      expect(parsed.claims).toHaveLength(1);
    });

    it('fails cleanly for a missing file', async () => {
      process.exitCode = undefined;
      await ediParse.run(['/definitely/not/a/real/file.edi'], {});
      expect(process.exitCode).toBe(1);
      process.exitCode = undefined;
    });
  });

  describe('queue:test / batch:test (smoke)', () => {
    it('queue:test dispatches a job for an explicit pending batch id without throwing', async () => {
      const stamp = Date.now();
      const batch = await prisma.batchFile.create({
        data: {
          filename: `queue-test-${stamp}.edi`,
          originalFilename: 'queue-test.edi',
          filePath: `edi_files/queue-test-${stamp}.edi`,
          status: 'pending',
        },
      });
      createdBatchIds.push(batch.id);

      await expect(queueTest.run([String(batch.id)])).resolves.toBeUndefined();
    });

    it('batch:test ingests a tiny fixture and validates it end-to-end', async () => {
      const filePath = writeTempEdiFile('scrubber-batch-test-');

      await expect(batchTest.run([filePath])).resolves.toBeUndefined();

      const batch = await prisma.batchFile.findFirst({
        where: { originalFilename: 'minimal.edi' },
        orderBy: { id: 'desc' },
      });
      expect(batch).not.toBeNull();
      createdBatchIds.push(batch!.id);
      expect(batch!.totalClaims).toBeGreaterThanOrEqual(1);
    });
  });
});
