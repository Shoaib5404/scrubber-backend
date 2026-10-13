import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../../src/app.module';
import { PasswordService } from '../../../src/modules/auth/password.service';

/**
 * SP-3 Task 8 — auth + ownership negatives (customer cannot read another tenant's batch).
 */
describe('auth ownership (integration)', () => {
  let app: INestApplication<App>;
  const prisma = new PrismaClient();
  const passwords = new PasswordService();

  const ids: {
    customerA?: number;
    customerB?: number;
    admin?: number;
    customerRevoked?: number;
    customerNoScope?: number;
    batchA?: number;
    batchB?: number;
    apiClientA?: number;
    apiClientRevoked?: number;
    apiClientNoScope?: number;
  } = {};

  const secrets = {
    clientA: 'client-a-secret-value',
    clientRevoked: 'revoked-secret-value',
    clientNoScope: 'noscope-secret-value',
  };

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

    const tenantA = await prisma.tenant.create({
      data: {
        name: 'Tenant A',
        slug: `tenant-a-${stamp}`,
        status: 'active',
        subscriptionStatus: 'active',
      },
    });
    const tenantB = await prisma.tenant.create({
      data: {
        name: 'Tenant B',
        slug: `tenant-b-${stamp}`,
        status: 'active',
        subscriptionStatus: 'active',
      },
    });
    const allFeatures = ['web.upload', 'api.access', 'api.batches', 'api.reference'];
    await prisma.tenantFeature.createMany({
      data: [tenantA.id, tenantB.id].flatMap((tenantId) =>
        allFeatures.map((feature) => ({ tenantId, feature, enabled: true })),
      ),
    });

    const customerA = await prisma.user.create({
      data: {
        name: 'Customer A',
        email: `auth-a-${stamp}@example.com`,
        password: passwordHash,
        role: 'customer',
        isActive: true,
        subscriptionStatus: 'active',
        tenantId: tenantA.id,
      },
    });
    const customerB = await prisma.user.create({
      data: {
        name: 'Customer B',
        email: `auth-b-${stamp}@example.com`,
        password: passwordHash,
        role: 'customer',
        isActive: true,
        subscriptionStatus: 'active',
        tenantId: tenantB.id,
      },
    });
    const admin = await prisma.user.create({
      data: {
        name: 'Admin',
        email: `auth-admin-${stamp}@example.com`,
        password: passwordHash,
        role: 'admin',
        isActive: true,
      },
    });
    ids.customerA = customerA.id;
    ids.customerB = customerB.id;
    ids.admin = admin.id;

    const batchA = await prisma.batchFile.create({
      data: {
        filename: `a-${stamp}.edi`,
        originalFilename: 'a.edi',
        filePath: `storage/edi/a-${stamp}.edi`,
        status: 'pending',
        uploadedById: customerA.id,
        tenantId: tenantA.id,
      },
    });
    const batchB = await prisma.batchFile.create({
      data: {
        filename: `b-${stamp}.edi`,
        originalFilename: 'b.edi',
        filePath: `storage/edi/b-${stamp}.edi`,
        status: 'pending',
        uploadedById: customerB.id,
        tenantId: tenantB.id,
      },
    });
    ids.batchA = batchA.id;
    ids.batchB = batchB.id;

    const customerRevoked = await prisma.user.create({
      data: {
        name: 'Customer Revoked Client',
        email: `auth-revoked-${stamp}@example.com`,
        password: passwordHash,
        role: 'customer',
        isActive: true,
        subscriptionStatus: 'active',
        tenantId: tenantA.id,
      },
    });
    const customerNoScope = await prisma.user.create({
      data: {
        name: 'Customer NoScope',
        email: `auth-noscope-${stamp}@example.com`,
        password: passwordHash,
        role: 'customer',
        isActive: true,
        subscriptionStatus: 'active',
        tenantId: tenantA.id,
      },
    });

    const clientA = await prisma.apiClient.create({
      data: {
        name: 'Client A',
        clientId: `client-a-${stamp}`,
        clientSecret: await passwords.hashSecret(secrets.clientA),
        userId: customerA.id,
        tenantId: tenantA.id,
        isActive: true,
        scopes: ['batches:read', 'batches:write', 'validate'],
      },
    });
    const clientRevoked = await prisma.apiClient.create({
      data: {
        name: 'Client Revoked',
        clientId: `client-revoked-${stamp}`,
        clientSecret: await passwords.hashSecret(secrets.clientRevoked),
        userId: customerRevoked.id,
        tenantId: tenantA.id,
        isActive: false,
        scopes: ['batches:read'],
      },
    });
    const clientNoScope = await prisma.apiClient.create({
      data: {
        name: 'Client No Scope',
        clientId: `client-noscope-${stamp}`,
        clientSecret: await passwords.hashSecret(secrets.clientNoScope),
        userId: customerNoScope.id,
        tenantId: tenantA.id,
        isActive: true,
        scopes: ['reference:read'],
      },
    });
    ids.apiClientA = clientA.id;
    ids.apiClientRevoked = clientRevoked.id;
    ids.apiClientNoScope = clientNoScope.id;
    ids.customerRevoked = customerRevoked.id;
    ids.customerNoScope = customerNoScope.id;
  });

  afterAll(async () => {
    if (ids.batchA) await prisma.batchFile.deleteMany({ where: { id: { in: [ids.batchA, ids.batchB!] } } });
    if (ids.apiClientA) {
      await prisma.apiClient.deleteMany({
        where: { id: { in: [ids.apiClientA, ids.apiClientRevoked!, ids.apiClientNoScope!] } },
      });
    }
    await prisma.refreshToken.deleteMany({
      where: {
        userId: {
          in: [
            ids.customerA!,
            ids.customerB!,
            ids.admin!,
            ids.customerRevoked!,
            ids.customerNoScope!,
          ].filter(Boolean),
        },
      },
    });
    const userIds = [
      ids.customerA,
      ids.customerB,
      ids.admin,
      ids.customerRevoked,
      ids.customerNoScope,
    ].filter((x): x is number => typeof x === 'number');
    if (userIds.length) await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
    await prisma.$disconnect();
  });

  async function login(email: string, password = 'Password123!') {
    const res = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email, password });
    expect(res.status).toBe(200);
    return res.body as { accessToken: string; refreshToken: string };
  }

  it('customer cannot GET another customer batch (ownership negative)', async () => {
    const customerA = await prisma.user.findUniqueOrThrow({ where: { id: ids.customerA } });
    const session = await login(customerA.email);

    const res = await request(app.getHttpServer())
      .get(`/api/v1/batches/${ids.batchB}`)
      .set('Authorization', `Bearer ${session.accessToken}`);

    expect(res.status).toBe(404);
  });

  it('customer can GET own batch', async () => {
    const customerA = await prisma.user.findUniqueOrThrow({ where: { id: ids.customerA } });
    const session = await login(customerA.email);

    const res = await request(app.getHttpServer())
      .get(`/api/v1/batches/${ids.batchA}`)
      .set('Authorization', `Bearer ${session.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.batch.id).toBe(ids.batchA);
  });

  it('admin can GET any customer batch', async () => {
    const admin = await prisma.user.findUniqueOrThrow({ where: { id: ids.admin } });
    const session = await login(admin.email);

    const res = await request(app.getHttpServer())
      .get(`/api/v1/batches/${ids.batchB}`)
      .set('Authorization', `Bearer ${session.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.batch.id).toBe(ids.batchB);
  });

  it('login rejects bad password', async () => {
    const customerA = await prisma.user.findUniqueOrThrow({ where: { id: ids.customerA } });
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: customerA.email, password: 'wrong-password' });
    expect(res.status).toBe(401);
  });

  it('refresh rotates and logout revokes', async () => {
    const customerA = await prisma.user.findUniqueOrThrow({ where: { id: ids.customerA } });
    const session = await login(customerA.email);

    const refreshed = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: session.refreshToken });
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.refreshToken).toBeTruthy();

    const reuse = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: session.refreshToken });
    expect(reuse.status).toBe(401);

    const logout = await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .send({ refreshToken: refreshed.body.refreshToken });
    expect(logout.status).toBe(204);

    const afterLogout = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: refreshed.body.refreshToken });
    expect(afterLogout.status).toBe(401);
  });

  it('API client token issues with Laravel-shaped body', async () => {
    const client = await prisma.apiClient.findUniqueOrThrow({ where: { id: ids.apiClientA } });
    const res = await request(app.getHttpServer()).post('/api/v1/auth/token').send({
      client_id: client.clientId,
      client_secret: secrets.clientA,
    });
    expect(res.status).toBe(200);
    expect(res.body.token_type).toBe('Bearer');
    expect(res.body.access_token).toBeTruthy();
    expect(res.body.scopes).toEqual(expect.arrayContaining(['batches:read']));

    const batch = await request(app.getHttpServer())
      .get(`/api/v1/batches/${ids.batchA}`)
      .set('Authorization', `Bearer ${res.body.access_token}`);
    expect(batch.status).toBe(200);
  });

  it('API client cannot read another tenant batch', async () => {
    const client = await prisma.apiClient.findUniqueOrThrow({ where: { id: ids.apiClientA } });
    const tokenRes = await request(app.getHttpServer()).post('/api/v1/auth/token').send({
      client_id: client.clientId,
      client_secret: secrets.clientA,
    });
    const res = await request(app.getHttpServer())
      .get(`/api/v1/batches/${ids.batchB}`)
      .set('Authorization', `Bearer ${tokenRes.body.access_token}`);
    expect(res.status).toBe(404);
  });

  it('revoked API client is rejected', async () => {
    const client = await prisma.apiClient.findUniqueOrThrow({ where: { id: ids.apiClientRevoked } });
    const res = await request(app.getHttpServer()).post('/api/v1/auth/token').send({
      client_id: client.clientId,
      client_secret: secrets.clientRevoked,
    });
    expect(res.status).toBe(422);
  });

  it('bad API client secret is rejected', async () => {
    const client = await prisma.apiClient.findUniqueOrThrow({ where: { id: ids.apiClientA } });
    const res = await request(app.getHttpServer()).post('/api/v1/auth/token').send({
      client_id: client.clientId,
      client_secret: 'definitely-wrong',
    });
    expect(res.status).toBe(422);
  });

  it('insufficient scope is rejected on batch GET', async () => {
    const client = await prisma.apiClient.findUniqueOrThrow({ where: { id: ids.apiClientNoScope } });
    const tokenRes = await request(app.getHttpServer()).post('/api/v1/auth/token').send({
      client_id: client.clientId,
      client_secret: secrets.clientNoScope,
    });
    expect(tokenRes.status).toBe(200);

    const res = await request(app.getHttpServer())
      .get(`/api/v1/batches/${ids.batchA}`)
      .set('Authorization', `Bearer ${tokenRes.body.access_token}`);
    expect(res.status).toBe(403);
  });

  it('inactive user cannot login', async () => {
    const stamp = Date.now();
    const inactive = await prisma.user.create({
      data: {
        name: 'Inactive',
        email: `auth-inactive-${stamp}@example.com`,
        password: await passwords.hashPassword('Password123!'),
        role: 'customer',
        isActive: false,
        subscriptionStatus: 'active',
      },
    });
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: inactive.email, password: 'Password123!' });
    expect(res.status).toBe(401);
    await prisma.user.delete({ where: { id: inactive.id } });
  });

  it('API client with inactive subscription is rejected', async () => {
    const stamp = Date.now();
    const user = await prisma.user.create({
      data: {
        name: 'Unsubscribed',
        email: `auth-unsub-${stamp}@example.com`,
        password: await passwords.hashPassword('Password123!'),
        role: 'customer',
        isActive: true,
        subscriptionStatus: 'inactive',
      },
    });
    const secret = 'unsub-secret';
    const client = await prisma.apiClient.create({
      data: {
        name: 'Unsub Client',
        clientId: `client-unsub-${stamp}`,
        clientSecret: await passwords.hashSecret(secret),
        userId: user.id,
        isActive: true,
        scopes: ['batches:read'],
      },
    });
    const res = await request(app.getHttpServer()).post('/api/v1/auth/token').send({
      client_id: client.clientId,
      client_secret: secret,
    });
    expect(res.status).toBe(422);
    await prisma.apiClient.delete({ where: { id: client.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });
});
