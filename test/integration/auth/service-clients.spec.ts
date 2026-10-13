import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../../src/app.module';
import { PasswordService } from '../../../src/modules/auth/password.service';
import { Permission } from '../../../src/modules/auth/permissions.constants';

describe('platform service clients (integration)', () => {
  let app: INestApplication<App>;
  const prisma = new PrismaClient();
  const passwords = new PasswordService();
  const stamp = Date.now();

  let adminToken = '';
  let serviceClientId = 0;
  let serviceClientKey = '';
  let serviceSecret = '';

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

    const passwordHash = await passwords.hashPassword('Password123!');
    const admin = await prisma.user.create({
      data: {
        name: 'Svc Staff',
        email: `svc-staff-${stamp}@example.com`,
        password: passwordHash,
        role: 'admin',
        isActive: true,
      },
    });
    await prisma.rolePermission.upsert({
      where: {
        role_permission: { role: 'admin', permission: Permission.UsersManage },
      },
      create: { role: 'admin', permission: Permission.UsersManage },
      update: {},
    });

    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: admin.email, password: 'Password123!' })
      .expect(200);
    adminToken = login.body.accessToken;
  });

  afterAll(async () => {
    if (serviceClientId) {
      await prisma.apiClient.deleteMany({ where: { id: serviceClientId } }).catch(() => undefined);
    }
    await app.close();
    await prisma.$disconnect();
  });

  it('GET scope-catalog returns known scopes', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/admin/service-clients/scope-catalog')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(res.body.data.map((s: { value: string }) => s.value)).toEqual(
      expect.arrayContaining(['reference:read', 'batches:read']),
    );
  });

  it('creates a platform service client and issues a token without tenant', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/admin/service-clients')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: `TeleWound Test ${stamp}`,
        scopes: ['reference:read'],
      })
      .expect(201);

    expect(created.body.data.user_id).toBeNull();
    expect(created.body.data.tenant_id).toBeNull();
    expect(created.body.data.kind).toBe('platform_service');
    expect(created.body.data.scopes).toEqual(['reference:read']);
    expect(created.body.data.plain_client_secret).toBeTruthy();

    serviceClientId = created.body.data.id;
    serviceClientKey = created.body.data.client_id;
    serviceSecret = created.body.data.plain_client_secret;

    const tokenRes = await request(app.getHttpServer())
      .post('/api/v1/auth/token')
      .send({ client_id: serviceClientKey, client_secret: serviceSecret })
      .expect(200);
    expect(tokenRes.body.scopes).toEqual(['reference:read']);

    const batches = await request(app.getHttpServer())
      .get('/api/v1/batches')
      .set('Authorization', `Bearer ${tokenRes.body.access_token}`);
    expect(batches.status).toBe(403);

    const ref = await request(app.getHttpServer())
      .get('/api/v1/reference/icd10/search')
      .query({ q: 'E11' })
      .set('Authorization', `Bearer ${tokenRes.body.access_token}`);
    expect([200, 400]).toContain(ref.status);
    expect(ref.status).not.toBe(403);
  });

  it('rejects empty or unknown scopes', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/admin/service-clients')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Bad', scopes: [] })
      .expect(400);

    await request(app.getHttpServer())
      .post('/api/v1/admin/service-clients')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Bad', scopes: ['not:a:scope'] })
      .expect(400);
  });

  it('rotates secret and revokes the client', async () => {
    expect(serviceClientId).toBeGreaterThan(0);

    const rotated = await request(app.getHttpServer())
      .post(`/api/v1/admin/service-clients/${serviceClientId}/rotate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);

    const newSecret = rotated.body.data.plain_client_secret as string;
    expect(newSecret).toBeTruthy();
    expect(newSecret).not.toBe(serviceSecret);

    await request(app.getHttpServer())
      .post('/api/v1/auth/token')
      .send({ client_id: serviceClientKey, client_secret: serviceSecret })
      .expect(422);

    await request(app.getHttpServer())
      .post('/api/v1/auth/token')
      .send({ client_id: serviceClientKey, client_secret: newSecret })
      .expect(200);

    serviceSecret = newSecret;

    await request(app.getHttpServer())
      .post(`/api/v1/admin/service-clients/${serviceClientId}/revoke`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/v1/auth/token')
      .send({ client_id: serviceClientKey, client_secret: serviceSecret })
      .expect(422);
  });

  it('lists only platform clients (null user and tenant)', async () => {
    const listed = await request(app.getHttpServer())
      .get('/api/v1/admin/service-clients')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(listed.body.data.data.every((c: { user_id: unknown; tenant_id: unknown }) =>
      c.user_id == null && c.tenant_id == null,
    )).toBe(true);
  });
});
