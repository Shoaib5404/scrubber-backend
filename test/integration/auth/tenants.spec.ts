import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../../src/app.module';
import { PasswordService } from '../../../src/modules/auth/password.service';
import { Permission } from '../../../src/modules/auth/permissions.constants';

describe('tenants + invites (integration)', () => {
  let app: INestApplication<App>;
  const prisma = new PrismaClient();
  const passwords = new PasswordService();
  const stamp = Date.now();

  let adminToken = '';
  let tenantAId = 0;
  let tenantBId = 0;
  let janeEmail = '';
  let bobEmail = '';
  let janeInviteUrl = '';
  let sameTenantEmail = '';

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
        name: 'Tenant Admin Staff',
        email: `tenant-staff-${stamp}@example.com`,
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

    janeEmail = `jane-${stamp}@example.com`;
    bobEmail = `bob-${stamp}@example.com`;
    sameTenantEmail = `alice-${stamp}@example.com`;

    const createA = await request(app.getHttpServer())
      .post('/api/v1/admin/tenants')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: `Acme ${stamp}`,
        subscription_status: 'active',
        admin_email: janeEmail,
        admin_name: 'Jane',
      })
      .expect(201);
    tenantAId = createA.body.data.tenant.id;
    janeInviteUrl = createA.body.data.invite?.invite_url;

    const createB = await request(app.getHttpServer())
      .post('/api/v1/admin/tenants')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: `Beta ${stamp}`,
        subscription_status: 'active',
        admin_email: bobEmail,
        admin_name: 'Bob',
      })
      .expect(201);
    tenantBId = createB.body.data.tenant.id;
    expect(createB.body.data.invite?.invite_url).toBeTruthy();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('accepts invite and allows login', async () => {
    expect(janeInviteUrl).toBeTruthy();
    const url = new URL(janeInviteUrl);
    const token = url.searchParams.get('token')!;
    const email = url.searchParams.get('email')!;

    await request(app.getHttpServer())
      .post('/api/v1/auth/accept-invite')
      .send({
        email,
        token,
        password: 'Password123!',
        password_confirmation: 'Password123!',
      })
      .expect(200);

    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: janeEmail, password: 'Password123!' })
      .expect(200);
    expect(login.body.user.tenant_id).toBe(tenantAId);
    expect(login.body.user.role).toBe('tenant_admin');
  });

  it('shares batches within tenant and hides cross-tenant', async () => {
    // Accept Bob
    const bobInvite = await prisma.tenantInvite.findFirst({
      where: { email: bobEmail, acceptedAt: null },
      orderBy: { id: 'desc' },
    });
    expect(bobInvite).toBeTruthy();

    // Resend to get invite_url in non-prod
    const resend = await request(app.getHttpServer())
      .post(`/api/v1/admin/tenants/${tenantBId}/users/resend-invite`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: bobEmail })
      .expect(201);
    const bobUrl = new URL(resend.body.data.invite_url as string);
    await request(app.getHttpServer())
      .post('/api/v1/auth/accept-invite')
      .send({
        email: bobEmail,
        token: bobUrl.searchParams.get('token'),
        password: 'Password123!',
        password_confirmation: 'Password123!',
      })
      .expect(200);

    // Invite second user under tenant A
    const inviteAlice = await request(app.getHttpServer())
      .post(`/api/v1/admin/tenants/${tenantAId}/users`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: sameTenantEmail, name: 'Alice', role: 'customer' })
      .expect(201);
    const aliceUrl = new URL(inviteAlice.body.data.invite_url as string);
    await request(app.getHttpServer())
      .post('/api/v1/auth/accept-invite')
      .send({
        email: sameTenantEmail,
        token: aliceUrl.searchParams.get('token'),
        password: 'Password123!',
        password_confirmation: 'Password123!',
      })
      .expect(200);

    const janeLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: janeEmail, password: 'Password123!' })
      .expect(200);
    const aliceLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: sameTenantEmail, password: 'Password123!' })
      .expect(200);
    const bobLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: bobEmail, password: 'Password123!' })
      .expect(200);

    const jane = await prisma.user.findUniqueOrThrow({ where: { email: janeEmail } });
    const batch = await prisma.batchFile.create({
      data: {
        filename: `tenant-a-${stamp}.edi`,
        originalFilename: 'shared.edi',
        filePath: `storage/edi/tenant-a-${stamp}.edi`,
        status: 'pending',
        uploadedById: jane.id,
        tenantId: tenantAId,
      },
    });

    await request(app.getHttpServer())
      .get(`/api/v1/batches/${batch.id}`)
      .set('Authorization', `Bearer ${aliceLogin.body.accessToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .get(`/api/v1/batches/${batch.id}`)
      .set('Authorization', `Bearer ${bobLogin.body.accessToken}`)
      .expect(404);

    await request(app.getHttpServer())
      .get(`/api/v1/batches/${batch.id}`)
      .set('Authorization', `Bearer ${janeLogin.body.accessToken}`)
      .expect(200);
  });

  it('rejects login for suspended tenant', async () => {
    await request(app.getHttpServer())
      .patch(`/api/v1/admin/tenants/${tenantAId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'suspended' })
      .expect(200);

    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: janeEmail, password: 'Password123!' })
      .expect(401);
  });
});
