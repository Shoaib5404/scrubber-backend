import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { PasswordService } from '../../src/modules/auth/password.service';
import { AuditCategoryCode } from '../../src/modules/audit/audit.catalog';

describe('api-v1 audit logs', () => {
  let app: INestApplication<App>;
  const prisma = new PrismaClient();
  const passwords = new PasswordService();
  const stamp = Date.now();
  let superToken = '';
  let adminToken = '';
  let customerToken = '';
  let tenantId = 0;

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
    const tenant = await prisma.tenant.create({
      data: {
        name: `Audit Tenant ${stamp}`,
        slug: `audit-tenant-${stamp}`,
        status: 'active',
        subscriptionStatus: 'active',
      },
    });
    tenantId = tenant.id;

    const superAdmin = await prisma.user.create({
      data: {
        name: 'Audit Super',
        email: `audit-super-${stamp}@example.com`,
        password: passwordHash,
        role: 'super_admin',
        isActive: true,
        subscriptionStatus: 'active',
      },
    });
    await prisma.user.create({
      data: {
        name: 'Audit Admin',
        email: `audit-admin-${stamp}@example.com`,
        password: passwordHash,
        role: 'admin',
        isActive: true,
        subscriptionStatus: 'active',
      },
    });
    await prisma.rolePermission.upsert({
      where: {
        role_permission: { role: 'admin', permission: 'audit.view' },
      },
      create: { role: 'admin', permission: 'audit.view' },
      update: {},
    });
    await prisma.user.create({
      data: {
        name: 'Audit Customer',
        email: `audit-customer-${stamp}@example.com`,
        password: passwordHash,
        role: 'customer',
        tenantId,
        isActive: true,
        subscriptionStatus: 'active',
      },
    });

    const superLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: superAdmin.email, password: 'Password123!' });
    superToken = superLogin.body.accessToken as string;

    const adminLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: `audit-admin-${stamp}@example.com`,
        password: 'Password123!',
      });
    adminToken = adminLogin.body.accessToken as string;

    const customerLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: `audit-customer-${stamp}@example.com`,
        password: 'Password123!',
      });
    customerToken = customerLogin.body.accessToken as string;
  });

  afterAll(async () => {
    await app?.close();
    await prisma.$disconnect();
  });

  it('records login success audit events', async () => {
    const events = await prisma.auditEvent.findMany({
      where: {
        categoryCode: AuditCategoryCode.AuthLogin,
        actorUser: { email: `audit-admin-${stamp}@example.com` },
      },
    });
    expect(events.length).toBeGreaterThan(0);
  });

  it('allows super admin to list and toggle categories', async () => {
    const list = await request(app.getHttpServer())
      .get('/api/v1/admin/audit/categories')
      .set('Authorization', `Bearer ${superToken}`)
      .expect(200);

    expect(list.body.success).toBe(true);
    expect(Array.isArray(list.body.data)).toBe(true);
    expect(list.body.data.length).toBeGreaterThan(10);

    await request(app.getHttpServer())
      .patch(`/api/v1/admin/audit/categories/${AuditCategoryCode.AuthLogout}`)
      .set('Authorization', `Bearer ${superToken}`)
      .send({ enabled: false })
      .expect(200);

    const row = await prisma.auditCategory.findUnique({
      where: { code: AuditCategoryCode.AuthLogout },
    });
    expect(row?.enabled).toBe(false);

    await request(app.getHttpServer())
      .patch(`/api/v1/admin/audit/categories/${AuditCategoryCode.AuthLogout}`)
      .set('Authorization', `Bearer ${superToken}`)
      .send({ enabled: true })
      .expect(200);
  });

  it('lets staff with audit.view list events', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/admin/audit/events')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data.data)).toBe(true);
  });

  it('scopes customer audit events to their tenant', async () => {
    await prisma.auditEvent.create({
      data: {
        categoryCode: AuditCategoryCode.BatchUploadSucceeded,
        action: 'succeeded',
        actorType: 'user',
        tenantId,
        resourceType: 'batch',
        resourceId: '1',
      },
    });
    await prisma.auditEvent.create({
      data: {
        categoryCode: AuditCategoryCode.AdminPermissionsSync,
        action: 'updated',
        actorType: 'user',
        resourceType: 'role',
        resourceId: 'admin',
      },
    });

    const res = await request(app.getHttpServer())
      .get('/api/v1/audit/events')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    for (const row of res.body.data.data) {
      expect(row.tenant_id).toBe(tenantId);
      expect(row.category_code).not.toBe(AuditCategoryCode.AdminPermissionsSync);
    }
  });

  it('rejects customer access to admin audit categories', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/admin/audit/categories')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(403);
  });
});
