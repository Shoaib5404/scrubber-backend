import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../../src/app.module';
import { PasswordService } from '../../../src/modules/auth/password.service';
import { Permission } from '../../../src/modules/auth/permissions.constants';

describe('tenant subscription features (integration)', () => {
  let app: INestApplication<App>;
  const prisma = new PrismaClient();
  const passwords = new PasswordService();
  const stamp = Date.now();

  let adminToken = '';
  let tenantId = 0;
  let adminEmail = '';
  let tenantUserToken = '';

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
        name: 'Features Staff',
        email: `feat-staff-${stamp}@example.com`,
        password: passwordHash,
        role: 'admin',
        isActive: true,
      },
    });
    await prisma.rolePermission.upsert({
      where: {
        role_permission: { role: 'admin', permission: Permission.TenantsManage },
      },
      create: { role: 'admin', permission: Permission.TenantsManage },
      update: {},
    });

    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: admin.email, password: 'Password123!' })
      .expect(200);
    adminToken = login.body.accessToken;

    adminEmail = `feat-admin-${stamp}@example.com`;
    const created = await request(app.getHttpServer())
      .post('/api/v1/admin/tenants')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: `Features Org ${stamp}`,
        subscription_status: 'active',
        features: ['web.upload', 'api.access', 'api.batches', 'api.reference'],
        admin_email: adminEmail,
        admin_name: 'Feat Admin',
      })
      .expect(201);

    tenantId = created.body.data.tenant.id;
    expect(created.body.data.tenant.features).toEqual(
      expect.arrayContaining([
        'web.upload',
        'api.access',
        'api.batches',
        'api.reference',
      ]),
    );

    const inviteUrl = created.body.data.invite?.invite_url as string;
    const url = new URL(inviteUrl);
    await request(app.getHttpServer())
      .post('/api/v1/auth/accept-invite')
      .send({
        email: adminEmail,
        token: url.searchParams.get('token'),
        password: 'Password123!',
        password_confirmation: 'Password123!',
      })
      .expect(200);

    const userLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: adminEmail, password: 'Password123!' })
      .expect(200);
    tenantUserToken = userLogin.body.accessToken;
    expect(userLogin.body.user.features).toEqual(
      expect.arrayContaining(['web.upload', 'api.access']),
    );
    expect(userLogin.body.user.subscription_active).toBe(true);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('GET feature-catalog returns catalog entries', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/admin/tenants/feature-catalog')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(4);
    expect(res.body.data.map((f: { value: string }) => f.value)).toEqual(
      expect.arrayContaining(['web.upload', 'api.access', 'api.batches', 'api.reference']),
    );
  });

  it('PATCH features replaces the set and GET returns them', async () => {
    const patched = await request(app.getHttpServer())
      .patch(`/api/v1/admin/tenants/${tenantId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ features: ['web.upload', 'api.access', 'api.reference'] })
      .expect(200);
    expect(patched.body.data.features.sort()).toEqual(
      ['api.access', 'api.reference', 'web.upload'].sort(),
    );

    const shown = await request(app.getHttpServer())
      .get(`/api/v1/admin/tenants/${tenantId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(shown.body.data.features.sort()).toEqual(
      ['api.access', 'api.reference', 'web.upload'].sort(),
    );

    // Restore full set for later tests that need batches; subsequent tests re-patch as needed.
    await request(app.getHttpServer())
      .patch(`/api/v1/admin/tenants/${tenantId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        features: ['web.upload', 'api.access', 'api.batches', 'api.reference'],
      })
      .expect(200);
  });

  it('without web.upload, portal upload is 403 even when subscription is active', async () => {
    await request(app.getHttpServer())
      .patch(`/api/v1/admin/tenants/${tenantId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ features: ['api.access', 'api.batches'] })
      .expect(200);

    const res = await request(app.getHttpServer())
      .post('/api/v1/batches')
      .set('Authorization', `Bearer ${tenantUserToken}`)
      .attach('edi_file', Buffer.from('ISA*00*'), 'sample.edi');
    expect(res.status).toBe(403);

    await request(app.getHttpServer())
      .patch(`/api/v1/admin/tenants/${tenantId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        features: ['web.upload', 'api.access', 'api.batches', 'api.reference'],
      })
      .expect(200);
  });

  it('without api.access, create credentials is 403', async () => {
    await request(app.getHttpServer())
      .patch(`/api/v1/admin/tenants/${tenantId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ features: ['web.upload', 'api.batches'] })
      .expect(200);

    const res = await request(app.getHttpServer())
      .post('/api/v1/settings/integrations/create')
      .set('Authorization', `Bearer ${tenantUserToken}`);
    expect(res.status).toBe(403);

    await request(app.getHttpServer())
      .patch(`/api/v1/admin/tenants/${tenantId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        features: ['web.upload', 'api.access', 'api.batches', 'api.reference'],
      })
      .expect(200);
  });

  it('api.access + api.reference only → token lacks batches scopes; batches API 403', async () => {
    await request(app.getHttpServer())
      .patch(`/api/v1/admin/tenants/${tenantId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ features: ['api.access', 'api.reference'] })
      .expect(200);

    // Remove any prior client so create succeeds.
    await prisma.apiClient.deleteMany({ where: { tenantId } });

    const created = await request(app.getHttpServer())
      .post('/api/v1/settings/integrations/create')
      .set('Authorization', `Bearer ${tenantUserToken}`)
      .expect(201);

    const clientId = created.body.data.api_client.client_id as string;
    const secret = created.body.data.plain_client_secret as string;
    expect(created.body.data.api_client.scopes).toEqual(['reference:read']);

    const tokenRes = await request(app.getHttpServer())
      .post('/api/v1/auth/token')
      .send({ client_id: clientId, client_secret: secret })
      .expect(200);
    expect(tokenRes.body.scopes).toEqual(['reference:read']);

    const batches = await request(app.getHttpServer())
      .get('/api/v1/batches')
      .set('Authorization', `Bearer ${tokenRes.body.access_token}`);
    expect(batches.status).toBe(403);

    // Reference search should be allowed with reference:read.
    const ref = await request(app.getHttpServer())
      .get('/api/v1/reference/icd10/search')
      .query({ q: 'E11' })
      .set('Authorization', `Bearer ${tokenRes.body.access_token}`);
    expect([200, 404]).toContain(ref.status);
    expect(ref.status).not.toBe(403);
  });

  it('with api.batches, batch list via API is allowed', async () => {
    await request(app.getHttpServer())
      .patch(`/api/v1/admin/tenants/${tenantId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ features: ['api.access', 'api.batches'] })
      .expect(200);

    await prisma.apiClient.deleteMany({ where: { tenantId } });

    const created = await request(app.getHttpServer())
      .post('/api/v1/settings/integrations/create')
      .set('Authorization', `Bearer ${tenantUserToken}`)
      .expect(201);

    const tokenRes = await request(app.getHttpServer())
      .post('/api/v1/auth/token')
      .send({
        client_id: created.body.data.api_client.client_id,
        client_secret: created.body.data.plain_client_secret,
      })
      .expect(200);
    expect(tokenRes.body.scopes).toEqual(
      expect.arrayContaining(['batches:read', 'batches:write', 'validate']),
    );
    expect(tokenRes.body.scopes).not.toContain('reference:read');

    await request(app.getHttpServer())
      .get('/api/v1/batches')
      .set('Authorization', `Bearer ${tokenRes.body.access_token}`)
      .expect(200);
  });

  it('platform service client (null tenant) is unaffected by tenant features', async () => {
    const plainSecret = 'svc-feat-secret-' + stamp;
    const client = await prisma.apiClient.create({
      data: {
        name: `Service Feat ${stamp}`,
        clientId: `ns_live_svcfeat${stamp}`,
        clientSecret: await passwords.hashSecret(plainSecret),
        userId: null,
        tenantId: null,
        isActive: true,
        scopes: ['reference:read'],
      },
    });

    const tokenRes = await request(app.getHttpServer())
      .post('/api/v1/auth/token')
      .send({ client_id: client.clientId, client_secret: plainSecret })
      .expect(200);
    expect(tokenRes.body.scopes).toEqual(['reference:read']);

    await prisma.apiClient.delete({ where: { id: client.id } });
  });

  it('rejects unknown feature codes on create', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/admin/tenants')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: `Bad Features ${stamp}`,
        subscription_status: 'active',
        features: ['web.upload', 'not.a.feature'],
      })
      .expect(400);
  });
});
