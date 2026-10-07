import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { LookupCacheService } from '../../src/modules/cache/lookup-cache.service';
import { PasswordService } from '../../src/modules/auth/password.service';

describe('api-v1 admin reference-admin wave A contract', () => {
  let app: INestApplication<App>;
  const prisma = new PrismaClient();
  const passwords = new PasswordService();
  let staffToken = '';
  let customerToken = '';
  let stamp = 0;
  let lookupCache: LookupCacheService;

  beforeAll(async () => {
    stamp = Date.now();
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1', { exclude: ['health'] });
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();

    lookupCache = moduleRef.get(LookupCacheService);
    jest.spyOn(lookupCache, 'invalidateTable').mockResolvedValue(undefined);

    const passwordHash = await passwords.hashPassword('Password123!');
    const staff = await prisma.user.create({
      data: {
        name: 'Ref Admin Staff',
        email: `ref-admin-staff-${stamp}@example.com`,
        password: passwordHash,
        role: 'admin',
        isActive: true,
      },
    });
    const customer = await prisma.user.create({
      data: {
        name: 'Ref Admin Customer',
        email: `ref-admin-customer-${stamp}@example.com`,
        password: passwordHash,
        role: 'customer',
        isActive: true,
      },
    });

    const staffLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: staff.email, password: 'Password123!' });
    staffToken = staffLogin.body.accessToken as string;

    const customerLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: customer.email, password: 'Password123!' });
    customerToken = customerLogin.body.accessToken as string;
  });

  afterAll(async () => {
    await prisma.cptCode.deleteMany({
      where: { name: { startsWith: `ADM${stamp}` } },
    });
    await prisma.refreshToken.deleteMany({
      where: {
        user: {
          email: {
            in: [
              `ref-admin-staff-${stamp}@example.com`,
              `ref-admin-customer-${stamp}@example.com`,
            ],
          },
        },
      },
    });
    await prisma.user.deleteMany({
      where: {
        email: {
          in: [
            `ref-admin-staff-${stamp}@example.com`,
            `ref-admin-customer-${stamp}@example.com`,
          ],
        },
      },
    });
    await app.close();
    await prisma.$disconnect();
  });

  it('staff can list registered Wave A domains', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/admin/references')
      .set('Authorization', `Bearer ${staffToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data.domains)).toBe(true);
    const cpt = res.body.data.domains.find((d: { slug: string }) => d.slug === 'cpt-codes');
    expect(cpt).toBeDefined();
    expect(cpt.ops).toContain('toggle_active');
  });

  it('staff CPT codes CRUD + toggle + delete invalidates lookup cache', async () => {
    const code = `ADM${stamp}`;
    const create = await request(app.getHttpServer())
      .post('/api/v1/admin/references/cpt-codes')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ name: code, description: 'Admin contract CPT', is_active: true });
    expect(create.status).toBe(201);
    expect(create.body.success).toBe(true);
    expect(create.body.data.name).toBe(code);
    expect(lookupCache.invalidateTable).toHaveBeenCalledWith('cpt_codes');

    const id = create.body.data.id as number;

    const show = await request(app.getHttpServer())
      .get(`/api/v1/admin/references/cpt-codes/${id}`)
      .set('Authorization', `Bearer ${staffToken}`);
    expect(show.status).toBe(200);
    expect(show.body.data.name).toBe(code);

    const list = await request(app.getHttpServer())
      .get(`/api/v1/admin/references/cpt-codes?search=${code}`)
      .set('Authorization', `Bearer ${staffToken}`);
    expect(list.status).toBe(200);
    expect(list.body.data.items.some((row: { name: string }) => row.name === code)).toBe(true);

    const toggle = await request(app.getHttpServer())
      .post(`/api/v1/admin/references/cpt-codes/${id}/toggle-active`)
      .set('Authorization', `Bearer ${staffToken}`);
    expect(toggle.status).toBe(200);
    expect(toggle.body.data.is_active).toBe(false);

    const destroy = await request(app.getHttpServer())
      .delete(`/api/v1/admin/references/cpt-codes/${id}`)
      .set('Authorization', `Bearer ${staffToken}`);
    expect(destroy.status).toBe(200);
    expect(destroy.body.success).toBe(true);
  });

  it('customer JWT gets 403 on admin reference list and create', async () => {
    const list = await request(app.getHttpServer())
      .get('/api/v1/admin/references')
      .set('Authorization', `Bearer ${customerToken}`);
    expect(list.status).toBe(403);

    const create = await request(app.getHttpServer())
      .post('/api/v1/admin/references/cpt-codes')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ name: `ADM${stamp}X`, description: 'blocked' });
    expect(create.status).toBe(403);
  });

  it('unknown domain returns 404', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/admin/references/not-a-real-domain')
      .set('Authorization', `Bearer ${staffToken}`);
    expect(res.status).toBe(404);
  });

  it('icd10-codes POST is rejected (read-only domain)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/admin/references/icd10-codes')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ code: 'Z00.00' });
    expect([403, 405]).toContain(res.status);
  });
});
