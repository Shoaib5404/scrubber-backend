import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { PasswordService } from '../../src/modules/auth/password.service';

describe('api-v1 users-admin + upload-logs (C1/C2)', () => {
  let app: INestApplication<App>;
  const prisma = new PrismaClient();
  const passwords = new PasswordService();
  const stamp = Date.now();
  let adminToken = '';
  let customerToken = '';
  let customerId = 0;
  let adminId = 0;

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
        name: 'Users Admin',
        email: `users-admin-${stamp}@example.com`,
        password: passwordHash,
        role: 'admin',
        isActive: true,
        subscriptionStatus: 'active',
      },
    });
    const customer = await prisma.user.create({
      data: {
        name: 'Users Customer',
        email: `users-customer-${stamp}@example.com`,
        password: passwordHash,
        role: 'customer',
        isActive: true,
        subscriptionStatus: 'active',
      },
    });
    adminId = admin.id;
    customerId = customer.id;

    await prisma.ediUploadErrorLog.create({
      data: {
        userId: customer.id,
        originalFilename: `fail-${stamp}.edi`,
        status: 'failed',
        errorType: 'parse',
        errorMessage: 'boom',
        source: 'web',
      },
    });

    const adminLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: admin.email, password: 'Password123!' });
    adminToken = adminLogin.body.accessToken as string;

    const customerLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: customer.email, password: 'Password123!' });
    customerToken = customerLogin.body.accessToken as string;
  });

  afterAll(async () => {
    await prisma.ediUploadErrorLog.deleteMany({
      where: { originalFilename: `fail-${stamp}.edi` },
    });
    await prisma.apiClient.deleteMany({ where: { userId: customerId } });
    await prisma.user.deleteMany({ where: { id: { in: [adminId, customerId] } } });
    await app.close();
    await prisma.$disconnect();
  });

  it('staff lists users; customer gets 403', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/admin/users')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(403);

    const res = await request(app.getHttpServer())
      .get('/api/v1/admin/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data.data)).toBe(true);
  });

  it('staff creates customer API client and receives plain secret once', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/admin/users/${customerId}/api-clients`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Contract Client' })
      .expect(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.client_id).toMatch(/^ns_live_/);
    expect(typeof res.body.data.plain_client_secret).toBe('string');
    expect(res.body.data.plain_client_secret.length).toBeGreaterThan(20);
  });

  it('upload-logs: staff sees all; customer sees own', async () => {
    const staff = await request(app.getHttpServer())
      .get('/api/v1/upload-logs')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(staff.body.data.show_user_column).toBe(true);
    expect(staff.body.data.data.some((r: { original_filename: string }) => r.original_filename === `fail-${stamp}.edi`)).toBe(
      true,
    );

    const customer = await request(app.getHttpServer())
      .get('/api/v1/upload-logs')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);
    expect(customer.body.data.show_user_column).toBe(false);
    expect(
      customer.body.data.data.every((r: { user_id: number }) => r.user_id === customerId),
    ).toBe(true);
  });
});
