import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import IORedis from 'ioredis';
import { PrismaModule } from '../../../src/common/prisma/prisma.module';
import { PrismaService } from '../../../src/common/prisma/prisma.service';
import { ClaimValidationModule } from '../../../src/modules/claim-validation/claim-validation.module';
import { FinalizeBatchValidationProcessor } from '../../../src/modules/queue/processors/finalize-batch.processor';
import { ValidateClaimProcessor } from '../../../src/modules/queue/processors/validate-claim.processor';
import { SCHEDULER_LOCK_KEY } from '../../../src/modules/queue/queue.constants';
import { loadEnvFrom } from '../../../src/config';

/**
 * SP-5 Task 12 — queue idempotency + Redis scheduler lock.
 * Requires Compose Postgres (DATABASE_URL) and Redis (REDIS_URL).
 */
describe('queue integration (SP-5 Task 12)', () => {
  const prisma = new PrismaClient();
  let redis: IORedis;

  beforeAll(() => {
    redis = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6381', {
      maxRetriesPerRequest: null,
    });
  });

  afterAll(async () => {
    await redis.quit();
    redis.disconnect();
    await prisma.$disconnect();
  });

  it('ValidateClaimProcessor twice does not duplicate service lines', async () => {
    const user = await prisma.user.create({
      data: {
        name: 'Queue Tester',
        email: `queue-${Date.now()}@example.com`,
        password: 'x',
        role: 'customer',
      },
    });
    const batch = await prisma.batchFile.create({
      data: {
        filename: 'q.edi',
        originalFilename: 'q.edi',
        filePath: 'storage/edi/q.edi',
        status: 'parsed',
        uploadedById: user.id,
        totalClaims: 1,
      },
    });
    const claim = await prisma.claim.create({
      data: {
        batchFileId: batch.id,
        claimId: `Q-${Date.now()}`,
        status: 'pending',
        totalCharge: 10,
        billingProviderNpi: '1234567893',
        subscriberMemberId: 'MEM1',
        payerId: 'P1',
        claimFilingIndicator: 'CI',
      },
    });
    await prisma.claimDiagnosis.create({
      data: { claimId: claim.id, sequence: 1, code: 'E11.9', type: 'principal' },
    });
    await prisma.serviceLine.create({
      data: {
        claimId: claim.id,
        lineNumber: 1,
        procedureCode: '99213',
        chargeAmount: 10,
        units: 1,
        serviceDateFrom: new Date('2024-01-15'),
        serviceDateTo: new Date('2024-01-15'),
        diagnosisPointers: [1],
      },
    });

    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          validate: (c) => loadEnvFrom({ ...process.env, ...c }),
        }),
        PrismaModule,
        ClaimValidationModule,
      ],
      providers: [ValidateClaimProcessor],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();

    const processor = moduleRef.get(ValidateClaimProcessor);
    await processor.handle({ claimId: claim.id, force: true });
    await processor.handle({ claimId: claim.id, force: true });

    const lines = await prisma.serviceLine.count({ where: { claimId: claim.id } });
    const diagnoses = await prisma.claimDiagnosis.count({ where: { claimId: claim.id } });
    expect(lines).toBe(1);
    expect(diagnoses).toBe(1);

    const updated = await prisma.claim.findUniqueOrThrow({ where: { id: claim.id } });
    expect(['valid', 'warning', 'error']).toContain(updated.status);
  });

  it('FinalizeBatchValidationProcessor marks validated when no pending claims', async () => {
    const user = await prisma.user.create({
      data: {
        name: 'Finalize Tester',
        email: `fin-${Date.now()}@example.com`,
        password: 'x',
        role: 'customer',
      },
    });
    const batch = await prisma.batchFile.create({
      data: {
        filename: 'f.edi',
        originalFilename: 'f.edi',
        filePath: 'storage/edi/f.edi',
        status: 'validating',
        uploadedById: user.id,
        totalClaims: 1,
      },
    });
    await prisma.claim.create({
      data: {
        batchFileId: batch.id,
        claimId: `F-${Date.now()}`,
        status: 'valid',
        totalCharge: 1,
      },
    });

    const moduleRef = await Test.createTestingModule({
      providers: [PrismaService, FinalizeBatchValidationProcessor],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();

    await moduleRef.get(FinalizeBatchValidationProcessor).handle({ batchId: batch.id });
    const updated = await prisma.batchFile.findUniqueOrThrow({ where: { id: batch.id } });
    expect(updated.status).toBe('validated');
    expect(updated.validClaims).toBe(1);
  });

  it('Redis scheduler lock is exclusive (withoutOverlapping)', async () => {
    await redis.del(SCHEDULER_LOCK_KEY);
    const a = await redis.set(SCHEDULER_LOCK_KEY, 'a', 'PX', 5_000, 'NX');
    const b = await redis.set(SCHEDULER_LOCK_KEY, 'b', 'PX', 5_000, 'NX');
    expect(a).toBe('OK');
    expect(b).toBeNull();
    await redis.del(SCHEDULER_LOCK_KEY);
  });
});
