/**
 * SP-9 Task 21 — disposable batch validation wall-clock smoke.
 *
 * Seeds synthetic batches with N claims × 1 service line each, runs
 * ClaimValidationService.validateBatch(force=true) with USE_QUEUE=false
 * (in-process sequential), prints CSV-ish timing, then deletes the batches.
 *
 * Usage (from scrubber-backend, Compose DB up):
 *   npx ts-node scripts/perf-batch-smoke.ts
 *   npx ts-node scripts/perf-batch-smoke.ts --sizes=10,50,200
 */
import { NestFactory } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { Module } from '@nestjs/common';
import { PrismaModule } from '../src/common/prisma/prisma.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { loadEnvFrom } from '../src/config';
import { ClaimValidationModule } from '../src/modules/claim-validation/claim-validation.module';
import { ClaimValidationService } from '../src/modules/claim-validation/claim-validation.service';
import { LookupCacheModule } from '../src/modules/cache/lookup-cache.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      validate: (config) =>
        loadEnvFrom({
          ...config,
          USE_QUEUE: 'false',
          PARALLEL_VALIDATE: 'false',
        }),
    }),
    PrismaModule,
    LookupCacheModule,
    ClaimValidationModule,
  ],
})
class PerfSmokeModule {}

function parseSizes(argv: string[]): number[] {
  const flag = argv.find((a) => a.startsWith('--sizes='));
  const raw = flag?.slice('--sizes='.length) ?? '10,50,200';
  return raw
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
}

async function seedBatch(prisma: PrismaService, claimCount: number): Promise<number> {
  const batch = await prisma.batchFile.create({
    data: {
      filename: `perf-smoke-${claimCount}.edi`,
      originalFilename: `perf-smoke-${claimCount}.edi`,
      filePath: `edi_files/perf-smoke-${claimCount}.edi`,
      status: 'parsed',
      totalClaims: claimCount,
    },
  });

  for (let i = 0; i < claimCount; i++) {
    const claim = await prisma.claim.create({
      data: {
        batchFileId: batch.id,
        claimId: `PERF-${claimCount}-${i + 1}`,
        status: 'pending',
        totalCharge: 10,
        billingProviderName: 'Perf Clinic',
        payerName: 'Perf Payer',
        subscriberMemberId: `MEM-${i}`,
        payerId: 'PERF1',
        claimFilingIndicator: 'CI',
        placeOfService: '11',
      },
    });
    await prisma.serviceLine.create({
      data: {
        claimId: claim.id,
        lineNumber: 1,
        procedureCode: '99213',
        chargeAmount: 10,
        units: 1,
        status: 'pending',
      },
    });
  }

  return batch.id;
}

async function cleanupBatch(prisma: PrismaService, batchId: number): Promise<void> {
  const claims = await prisma.claim.findMany({
    where: { batchFileId: batchId },
    select: { id: true },
  });
  const claimIds = claims.map((c) => c.id);
  if (claimIds.length) {
    await prisma.serviceLine.deleteMany({ where: { claimId: { in: claimIds } } });
    await prisma.claimDiagnosis.deleteMany({ where: { claimId: { in: claimIds } } });
    await prisma.claim.deleteMany({ where: { id: { in: claimIds } } });
  }
  await prisma.batchFile.delete({ where: { id: batchId } });
}

async function main(): Promise<void> {
  const sizes = parseSizes(process.argv.slice(2));
  const app = await NestFactory.createApplicationContext(PerfSmokeModule, {
    logger: ['error', 'warn'],
  });
  const prisma = app.get(PrismaService);
  const validation = app.get(ClaimValidationService);

  console.log('perf-batch-smoke: USE_QUEUE=false PARALLEL_VALIDATE=false (in-process sequential)');
  console.log('claims,wall_ms,ms_per_claim,error,warning,valid');

  for (const n of sizes) {
    const batchId = await seedBatch(prisma, n);
    const t0 = performance.now();
    let results;
    try {
      results = await validation.validateBatch(batchId, true);
    } finally {
      const wallMs = Math.round(performance.now() - t0);
      const error = results?.filter((r) => r.status === 'error').length ?? -1;
      const warning = results?.filter((r) => r.status === 'warning').length ?? -1;
      const valid = results?.filter((r) => r.status === 'valid').length ?? -1;
      const per = (wallMs / n).toFixed(1);
      console.log(`${n},${wallMs},${per},${error},${warning},${valid}`);
      await cleanupBatch(prisma, batchId);
    }
  }

  await app.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
