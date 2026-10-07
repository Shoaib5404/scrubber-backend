import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { PasswordService } from '../../src/modules/auth/password.service';

/**
 * SP-6 Task 14 — Laravel API v1 batches/claims contract (status, pagination, ownership).
 */
describe('api-v1 batches/claims contract', () => {
  let app: INestApplication<App>;
  const prisma = new PrismaClient();
  const passwords = new PasswordService();

  const ids: {
    customerA?: number;
    customerB?: number;
    batchA?: number;
    batchB?: number;
    claimA?: number;
    lineA?: number;
  } = {};

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1', { exclude: ['health'] });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    const stamp = Date.now();
    const passwordHash = await passwords.hashPassword('Password123!');

    const customerA = await prisma.user.create({
      data: {
        name: 'Contract A',
        email: `contract-a-${stamp}@example.com`,
        password: passwordHash,
        role: 'customer',
        isActive: true,
        subscriptionStatus: 'active',
      },
    });
    const customerB = await prisma.user.create({
      data: {
        name: 'Contract B',
        email: `contract-b-${stamp}@example.com`,
        password: passwordHash,
        role: 'customer',
        isActive: true,
        subscriptionStatus: 'active',
      },
    });
    ids.customerA = customerA.id;
    ids.customerB = customerB.id;

    const batchA = await prisma.batchFile.create({
      data: {
        filename: `ca-${stamp}.edi`,
        originalFilename: 'ca.edi',
        filePath: `storage/edi/ca-${stamp}.edi`,
        status: 'parsed',
        uploadedById: customerA.id,
        totalClaims: 1,
      },
    });
    const batchB = await prisma.batchFile.create({
      data: {
        filename: `cb-${stamp}.edi`,
        originalFilename: 'cb.edi',
        filePath: `storage/edi/cb-${stamp}.edi`,
        status: 'parsed',
        uploadedById: customerB.id,
        totalClaims: 0,
      },
    });
    ids.batchA = batchA.id;
    ids.batchB = batchB.id;

    const claimA = await prisma.claim.create({
      data: {
        batchFileId: batchA.id,
        claimId: `C-${stamp}`,
        status: 'pending',
        totalCharge: 25,
        billingProviderNpi: '1234567893',
        subscriberMemberId: 'MEM1',
        payerId: 'P1',
        claimFilingIndicator: 'CI',
      },
    });
    ids.claimA = claimA.id;

    const lineA = await prisma.serviceLine.create({
      data: {
        claimId: claimA.id,
        lineNumber: 1,
        procedureCode: '99213',
        chargeAmount: 25,
        units: 1,
        serviceDateFrom: new Date('2024-01-15'),
        serviceDateTo: new Date('2024-01-15'),
        diagnosisPointers: [1],
      },
    });
    ids.lineA = lineA.id;
  });

  afterAll(async () => {
    if (ids.claimA) {
      await prisma.serviceLine.deleteMany({ where: { claimId: ids.claimA } });
      await prisma.claim.deleteMany({ where: { id: ids.claimA } });
    }
    if (ids.batchA) {
      await prisma.batchFile.deleteMany({
        where: { id: { in: [ids.batchA, ids.batchB!] } },
      });
    }
    await prisma.refreshToken.deleteMany({
      where: { userId: { in: [ids.customerA!, ids.customerB!] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [ids.customerA!, ids.customerB!] } },
    });
    await app.close();
    await prisma.$disconnect();
  });

  async function login(email: string) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: 'Password123!' });
    expect(res.status).toBe(200);
    return res.body.accessToken as string;
  }

  it('GET /batches returns only owned rows with Laravel pagination envelope', async () => {
    const customerA = await prisma.user.findUniqueOrThrow({ where: { id: ids.customerA } });
    const token = await login(customerA.email);

    const res = await request(app.getHttpServer())
      .get('/api/v1/batches')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject({
      current_page: 1,
      per_page: 15,
    });
    const idsOnPage = (res.body.data.data as Array<{ id: number }>).map((b) => b.id);
    expect(idsOnPage).toContain(ids.batchA);
    expect(idsOnPage).not.toContain(ids.batchB);
  });

  it('GET /batches/:id returns 404 for other tenant', async () => {
    const customerA = await prisma.user.findUniqueOrThrow({ where: { id: ids.customerA } });
    const token = await login(customerA.email);

    const res = await request(app.getHttpServer())
      .get(`/api/v1/batches/${ids.batchB}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(res.body.message).toBe('Batch not found.');
  });

  it('GET /batches/:id and /statistics return success envelopes', async () => {
    const customerA = await prisma.user.findUniqueOrThrow({ where: { id: ids.customerA } });
    const token = await login(customerA.email);

    const show = await request(app.getHttpServer())
      .get(`/api/v1/batches/${ids.batchA}`)
      .set('Authorization', `Bearer ${token}`);
    expect(show.status).toBe(200);
    expect(show.body.success).toBe(true);
    expect(show.body.data.batch.id).toBe(ids.batchA);
    expect(show.body.data.statistics.total_claims).toBe(1);

    const stats = await request(app.getHttpServer())
      .get(`/api/v1/batches/${ids.batchA}/statistics`)
      .set('Authorization', `Bearer ${token}`);
    expect(stats.status).toBe(200);
    expect(stats.body.data.total_claims).toBe(1);
  });

  it('GET /batches/:id/claims paginates and hides other tenant claims', async () => {
    const customerA = await prisma.user.findUniqueOrThrow({ where: { id: ids.customerA } });
    const token = await login(customerA.email);

    const ok = await request(app.getHttpServer())
      .get(`/api/v1/batches/${ids.batchA}/claims`)
      .set('Authorization', `Bearer ${token}`);
    expect(ok.status).toBe(200);
    expect(ok.body.data.data[0].id).toBe(ids.claimA);

    const denied = await request(app.getHttpServer())
      .get(`/api/v1/batches/${ids.batchB}/claims`)
      .set('Authorization', `Bearer ${token}`);
    expect(denied.status).toBe(404);
  });

  it('GET/PUT claim + line update + validate claim', async () => {
    const customerA = await prisma.user.findUniqueOrThrow({ where: { id: ids.customerA } });
    const token = await login(customerA.email);

    const show = await request(app.getHttpServer())
      .get(`/api/v1/claims/${ids.claimA}`)
      .set('Authorization', `Bearer ${token}`);
    expect(show.status).toBe(200);
    expect(show.body.data.claim_id).toBeTruthy();

    const updated = await request(app.getHttpServer())
      .put(`/api/v1/claims/${ids.claimA}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ billing_provider_name: 'Contract Clinic' });
    expect(updated.status).toBe(200);
    expect(updated.body.message).toBe('Claim updated successfully.');
    expect(updated.body.data.billing_provider_name).toBe('Contract Clinic');

    const line = await request(app.getHttpServer())
      .put(`/api/v1/claims/${ids.claimA}/lines/${ids.lineA}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ units: 2 });
    expect(line.status).toBe(200);
    expect(line.body.data.units).toBe(2);

    const validate = await request(app.getHttpServer())
      .post(`/api/v1/claims/${ids.claimA}/validate`)
      .set('Authorization', `Bearer ${token}`);
    expect(validate.status).toBe(200);
    expect(validate.body.success).toBe(true);
    expect(validate.body.data.status).toBeTruthy();
  });

  it('POST /batches/:id/validate returns completed when sync', async () => {
    const customerA = await prisma.user.findUniqueOrThrow({ where: { id: ids.customerA } });
    const token = await login(customerA.email);

    const res = await request(app.getHttpServer())
      .post(`/api/v1/batches/${ids.batchA}/validate`)
      .set('Authorization', `Bearer ${token}`)
      .send({ force: true });

    expect([200, 202]).toContain(res.status);
    expect(res.body.success).toBe(true);
    if (res.status === 200) {
      expect(res.body.data.status).toBe('completed');
      expect(Array.isArray(res.body.data.claims)).toBe(true);
    } else {
      expect(res.body.data.status).toBe('under_processing');
    }
  });

  it('DELETE /batches/:id removes owned batch', async () => {
    const customerA = await prisma.user.findUniqueOrThrow({ where: { id: ids.customerA } });
    const token = await login(customerA.email);

    const doomed = await prisma.batchFile.create({
      data: {
        filename: `doom-${Date.now()}.edi`,
        originalFilename: 'doom.edi',
        filePath: `storage/edi/doom-${Date.now()}.edi`,
        status: 'pending',
        uploadedById: customerA.id,
      },
    });

    const res = await request(app.getHttpServer())
      .delete(`/api/v1/batches/${doomed.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Batch deleted successfully.');

    const gone = await prisma.batchFile.findUnique({ where: { id: doomed.id } });
    expect(gone).toBeNull();
  });
});
