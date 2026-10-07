import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { LookupCacheService } from '../../src/modules/cache/lookup-cache.service';
import { PasswordService } from '../../src/modules/auth/password.service';

describe('api-v1 admin reference-admin wave D contract', () => {
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
        name: 'Ref Admin Wave D Staff',
        email: `ref-admin-d-staff-${stamp}@example.com`,
        password: passwordHash,
        role: 'admin',
        isActive: true,
      },
    });
    const customer = await prisma.user.create({
      data: {
        name: 'Ref Admin Wave D Customer',
        email: `ref-admin-d-customer-${stamp}@example.com`,
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
    const articleId = 8_000_000 + (stamp % 1_000_000);
    await prisma.articleXIcd10Covered.deleteMany({ where: { articleId } });
    await prisma.article.deleteMany({ where: { articleId } });
    await prisma.contractor.deleteMany({
      where: { contractorId: 8_000_000 + (stamp % 1_000_000) },
    });
    await prisma.contractorTypeLookup.deleteMany({
      where: { contractorTypeId: 8_000_000 + (stamp % 1_000_000) },
    });
    await prisma.articleTypeLookup.deleteMany({
      where: { articleTypeId: 8_000_000 + (stamp % 1_000_000) },
    });
    await prisma.refreshToken.deleteMany({
      where: {
        user: {
          email: {
            in: [
              `ref-admin-d-staff-${stamp}@example.com`,
              `ref-admin-d-customer-${stamp}@example.com`,
            ],
          },
        },
      },
    });
    await prisma.user.deleteMany({
      where: {
        email: {
          in: [
            `ref-admin-d-staff-${stamp}@example.com`,
            `ref-admin-d-customer-${stamp}@example.com`,
          ],
        },
      },
    });
    await app.close();
    await prisma.$disconnect();
  });

  it('domain list includes Wave D slugs', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/admin/references')
      .set('Authorization', `Bearer ${staffToken}`);
    expect(res.status).toBe(200);
    const slugs = res.body.data.domains.map((d: { slug: string }) => d.slug);
    expect(slugs).toContain('articles');
    expect(slugs).toContain('contractors');
    expect(slugs).toContain('article-type-lookup');
    expect(slugs).toContain('article-x-icd10-covered');
  });

  it('staff article-type-lookup CRUD uses article_type_id as primary key', async () => {
    const articleTypeId = 8_000_000 + (stamp % 1_000_000);

    const create = await request(app.getHttpServer())
      .post('/api/v1/admin/references/article-type-lookup')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        article_type_id: articleTypeId,
        description: `Wave D type ${stamp}`,
      });
    expect(create.status).toBe(201);
    expect(create.body.data.article_type_id).toBe(articleTypeId);
    expect(create.body.data.id).toBe(articleTypeId);
    expect(lookupCache.invalidateTable).toHaveBeenCalledWith('article_type_lookup');

    const show = await request(app.getHttpServer())
      .get(`/api/v1/admin/references/article-type-lookup/${articleTypeId}`)
      .set('Authorization', `Bearer ${staffToken}`);
    expect(show.status).toBe(200);
    expect(show.body.data.id).toBe(articleTypeId);

    const destroy = await request(app.getHttpServer())
      .delete(`/api/v1/admin/references/article-type-lookup/${articleTypeId}`)
      .set('Authorization', `Bearer ${staffToken}`);
    expect(destroy.status).toBe(200);
    expect(destroy.body.data.id).toBe(articleTypeId);
  });

  it('staff contractors create+delete invalidates contractor lookup', async () => {
    const contractorTypeId = 8_000_000 + (stamp % 1_000_000);
    const contractorId = 8_000_000 + (stamp % 1_000_000);

    await prisma.contractorTypeLookup.create({
      data: { contractorTypeId, description: `Type ${stamp}` },
    });

    const create = await request(app.getHttpServer())
      .post('/api/v1/admin/references/contractors')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        contractor_id: contractorId,
        contractor_type_id: contractorTypeId,
        contractor_version: 1,
      });
    expect(create.status).toBe(201);
    expect(lookupCache.invalidateTable).toHaveBeenCalledWith('contractor');

    const id = create.body.data.id as number;

    const destroy = await request(app.getHttpServer())
      .delete(`/api/v1/admin/references/contractors/${id}`)
      .set('Authorization', `Bearer ${staffToken}`);
    expect(destroy.status).toBe(200);
  });

  it('staff article-x-icd10-covered create+delete', async () => {
    const articleId = 8_000_000 + (stamp % 1_000_000);

    const articleCreate = await request(app.getHttpServer())
      .post('/api/v1/admin/references/articles')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        article_id: articleId,
        article_version: 1,
        title: `Wave D article ${stamp}`,
      });
    expect(articleCreate.status).toBe(201);

    const create = await request(app.getHttpServer())
      .post('/api/v1/admin/references/article-x-icd10-covered')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        article_id: articleId,
        article_version: 1,
        icd10_code_id: 'Z00.00',
      });
    expect(create.status).toBe(201);
    expect(create.body.data.article_id).toBe(articleId);

    const id = create.body.data.id as number;

    const destroy = await request(app.getHttpServer())
      .delete(`/api/v1/admin/references/article-x-icd10-covered/${id}`)
      .set('Authorization', `Bearer ${staffToken}`);
    expect(destroy.status).toBe(200);

    const articlePk = articleCreate.body.data.id as number;
    await request(app.getHttpServer())
      .delete(`/api/v1/admin/references/articles/${articlePk}`)
      .set('Authorization', `Bearer ${staffToken}`);
  });

  it('read-only NCD domains reject POST', async () => {
    const ncdCptPost = await request(app.getHttpServer())
      .post('/api/v1/admin/references/ncd-cpt')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        ncd_number: '1',
        ncd_description: 'Test',
        cpt_code: '99213',
      });
    expect(ncdCptPost.status).toBe(405);

    const otherLabPost = await request(app.getHttpServer())
      .post('/api/v1/admin/references/ncd-other-lab-cpt')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ cpt_code: '80000', is_active: true });
    expect(otherLabPost.status).toBe(405);
  });

  it('customer JWT gets 403 on articles list', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/admin/references/articles')
      .set('Authorization', `Bearer ${customerToken}`);
    expect(res.status).toBe(403);
  });
});
