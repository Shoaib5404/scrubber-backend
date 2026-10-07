import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { LookupCacheService } from '../../src/modules/cache/lookup-cache.service';
import { PasswordService } from '../../src/modules/auth/password.service';

describe('api-v1 admin reference-admin wave C contract', () => {
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
        name: 'Ref Admin Wave C Staff',
        email: `ref-admin-c-staff-${stamp}@example.com`,
        password: passwordHash,
        role: 'admin',
        isActive: true,
      },
    });
    const customer = await prisma.user.create({
      data: {
        name: 'Ref Admin Wave C Customer',
        email: `ref-admin-c-customer-${stamp}@example.com`,
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
    await prisma.taxonomyCode.deleteMany({
      where: { taxonomyCode: { startsWith: `WC${stamp}` } },
    });
    await prisma.regionLookup.deleteMany({
      where: { regionId: { gte: 9_000_000 + (stamp % 1_000_000) } },
    });
    await prisma.refreshToken.deleteMany({
      where: {
        user: {
          email: {
            in: [
              `ref-admin-c-staff-${stamp}@example.com`,
              `ref-admin-c-customer-${stamp}@example.com`,
            ],
          },
        },
      },
    });
    await prisma.user.deleteMany({
      where: {
        email: {
          in: [
            `ref-admin-c-staff-${stamp}@example.com`,
            `ref-admin-c-customer-${stamp}@example.com`,
          ],
        },
      },
    });
    await app.close();
    await prisma.$disconnect();
  });

  it('domain list includes Wave C slugs', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/admin/references')
      .set('Authorization', `Bearer ${staffToken}`);
    expect(res.status).toBe(200);
    const slugs = res.body.data.domains.map((d: { slug: string }) => d.slug);
    expect(slugs).toContain('taxonomy-codes');
    expect(slugs).toContain('zip-codes');
    expect(slugs).toContain('claim-filing-indicators');
  });

  it('staff taxonomy-codes create+toggle+delete invalidates taxonomy_codes lookup', async () => {
    const taxonomyCode = `WC${stamp}`.slice(0, 10);
    const specialtyName = `Wave C Specialty ${stamp}`;

    const create = await request(app.getHttpServer())
      .post('/api/v1/admin/references/taxonomy-codes')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        taxonomy_code: taxonomyCode,
        specialty_name: specialtyName,
        is_active: true,
      });
    expect(create.status).toBe(201);
    expect(create.body.data.taxonomy_code).toBe(taxonomyCode);
    expect(lookupCache.invalidateTable).toHaveBeenCalledWith('taxonomy_codes');

    const id = create.body.data.id as number;

    const toggle = await request(app.getHttpServer())
      .post(`/api/v1/admin/references/taxonomy-codes/${id}/toggle-active`)
      .set('Authorization', `Bearer ${staffToken}`);
    expect(toggle.status).toBe(200);
    expect(toggle.body.data.is_active).toBe(false);

    const destroy = await request(app.getHttpServer())
      .delete(`/api/v1/admin/references/taxonomy-codes/${id}`)
      .set('Authorization', `Bearer ${staffToken}`);
    expect(destroy.status).toBe(200);
  });

  it('region-lookup create/show/delete uses region_id as primary key', async () => {
    const regionId = 9_000_000 + (stamp % 1_000_000);

    const create = await request(app.getHttpServer())
      .post('/api/v1/admin/references/region-lookup')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ region_id: regionId, description: `Region ${stamp}` });
    expect(create.status).toBe(201);
    expect(create.body.data.region_id).toBe(regionId);
    expect(create.body.data.id).toBe(regionId);

    const show = await request(app.getHttpServer())
      .get(`/api/v1/admin/references/region-lookup/${regionId}`)
      .set('Authorization', `Bearer ${staffToken}`);
    expect(show.status).toBe(200);
    expect(show.body.data.id).toBe(regionId);
    expect(show.body.data.region_id).toBe(regionId);

    const destroy = await request(app.getHttpServer())
      .delete(`/api/v1/admin/references/region-lookup/${regionId}`)
      .set('Authorization', `Bearer ${staffToken}`);
    expect(destroy.status).toBe(200);
    expect(destroy.body.data.id).toBe(regionId);
  });

  it('claim-filing-indicators list returns config items; POST rejected', async () => {
    const list = await request(app.getHttpServer())
      .get('/api/v1/admin/references/claim-filing-indicators')
      .set('Authorization', `Bearer ${staffToken}`);
    expect(list.status).toBe(200);
    expect(list.body.data.items.length).toBeGreaterThan(0);
    expect(list.body.data.items[0]).toMatchObject({
      id: expect.any(String),
      code: expect.any(String),
      description: expect.any(String),
    });

    const post = await request(app.getHttpServer())
      .post('/api/v1/admin/references/claim-filing-indicators')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ code: 'ZZ', description: 'Test' });
    expect(post.status).toBe(405);
  });

  it('customer JWT gets 403 on taxonomy-codes list', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/admin/references/taxonomy-codes')
      .set('Authorization', `Bearer ${customerToken}`);
    expect(res.status).toBe(403);
  });
});
