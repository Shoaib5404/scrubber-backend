import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { LookupCacheService } from '../../src/modules/cache/lookup-cache.service';
import { PasswordService } from '../../src/modules/auth/password.service';

describe('api-v1 CMS relationship integrity contract', () => {
  let app: INestApplication<App>;
  const prisma = new PrismaClient();
  const passwords = new PasswordService();
  let staffToken = '';
  let customerToken = '';
  let stamp = 0;

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

    const lookupCache = moduleRef.get(LookupCacheService);
    jest.spyOn(lookupCache, 'invalidateTable').mockResolvedValue(undefined);

    const passwordHash = await passwords.hashPassword('Password123!');
    const staff = await prisma.user.create({
      data: {
        name: 'CMS Integrity Staff',
        email: `cms-integrity-staff-${stamp}@example.com`,
        password: passwordHash,
        role: 'admin',
        isActive: true,
      },
    });
    const customer = await prisma.user.create({
      data: {
        name: 'CMS Integrity Customer',
        email: `cms-integrity-customer-${stamp}@example.com`,
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
    const articleId = 9_000_000 + (stamp % 1_000_000);
    await prisma.articleXIcd10Covered.deleteMany({ where: { articleId } });
    await prisma.article.deleteMany({ where: { articleId } });
    await prisma.ncdIcd.deleteMany({
      where: { ncdCpt: { ncdNumber: { startsWith: `CMS-INT-${stamp}` } } },
    });
    await prisma.ncdCpt.deleteMany({
      where: { ncdNumber: { startsWith: `CMS-INT-${stamp}` } },
    });
    await prisma.refreshToken.deleteMany({
      where: {
        user: {
          email: {
            in: [
              `cms-integrity-staff-${stamp}@example.com`,
              `cms-integrity-customer-${stamp}@example.com`,
            ],
          },
        },
      },
    });
    await prisma.user.deleteMany({
      where: {
        email: {
          in: [
            `cms-integrity-staff-${stamp}@example.com`,
            `cms-integrity-customer-${stamp}@example.com`,
          ],
        },
      },
    });
    await app.close();
    await prisma.$disconnect();
  });

  it('rejects article-x-icd10-covered when article pair is missing', async () => {
    const articleId = 9_000_000 + (stamp % 1_000_000);
    const res = await request(app.getHttpServer())
      .post('/api/v1/admin/references/article-x-icd10-covered')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        article_id: articleId,
        article_version: 99,
        icd10_code_id: 'Z00.00',
      });
    expect(res.status).toBe(400);
  });

  it('cascade-deletes article-x children when article is destroyed', async () => {
    const articleId = 9_000_000 + (stamp % 1_000_000);

    const before = await request(app.getHttpServer())
      .get('/api/v1/admin/references/integrity/cms')
      .set('Authorization', `Bearer ${staffToken}`);
    expect(before.status).toBe(200);
    const beforeOrphans = before.body.data.orphan_article_x['article-x-icd10-covered'] as number;

    const articleCreate = await request(app.getHttpServer())
      .post('/api/v1/admin/references/articles')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        article_id: articleId,
        article_version: 1,
        title: `CMS integrity ${stamp}`,
      });
    expect(articleCreate.status).toBe(201);
    const articlePk = articleCreate.body.data.id as number;

    const coveredCreate = await request(app.getHttpServer())
      .post('/api/v1/admin/references/article-x-icd10-covered')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        article_id: articleId,
        article_version: 1,
        icd10_code_id: 'Z00.01',
      });
    expect(coveredCreate.status).toBe(201);
    const coveredId = coveredCreate.body.data.id as number;

    const mid = await request(app.getHttpServer())
      .get('/api/v1/admin/references/integrity/cms')
      .set('Authorization', `Bearer ${staffToken}`);
    expect(mid.status).toBe(200);
    expect(typeof mid.body.data.ok).toBe('boolean');

    const destroyArticle = await request(app.getHttpServer())
      .delete(`/api/v1/admin/references/articles/${articlePk}`)
      .set('Authorization', `Bearer ${staffToken}`);
    expect(destroyArticle.status).toBe(200);

    const orphanRow = await prisma.articleXIcd10Covered.findUnique({ where: { id: coveredId } });
    expect(orphanRow).toBeNull();

    const after = await request(app.getHttpServer())
      .get('/api/v1/admin/references/integrity/cms')
      .set('Authorization', `Bearer ${staffToken}`);
    expect(after.status).toBe(200);
    const afterOrphans = after.body.data.orphan_article_x['article-x-icd10-covered'] as number;
    expect(afterOrphans).toBe(beforeOrphans);
  });

  it('lists NCD ICDs under parent CPT and rejects bad ncd_cpt_id on update', async () => {
    const ncd = await prisma.ncdCpt.create({
      data: {
        ncdNumber: `CMS-INT-${stamp}`,
        ncdDescription: 'CMS integrity NCD',
        cptCode: '99214',
      },
    });
    const ncdIcd = await prisma.ncdIcd.create({
      data: {
        icdCode: 'E11.9',
        ncdCptId: ncd.id,
        resolutionCode: 1,
      },
    });

    const list = await request(app.getHttpServer())
      .get(`/api/v1/admin/references/ncd-cpt/${ncd.id}/icds`)
      .set('Authorization', `Bearer ${staffToken}`);
    expect(list.status).toBe(200);
    expect(list.body.data.items.some((row: { id: number }) => row.id === ncdIcd.id)).toBe(true);

    const badUpdate = await request(app.getHttpServer())
      .put(`/api/v1/admin/references/ncd-icd/${ncdIcd.id}`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ ncd_cpt_id: 9_999_999_999 });
    expect(badUpdate.status).toBe(400);
  });

  it('returns CMS integrity report shape for staff', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/admin/references/integrity/cms')
      .set('Authorization', `Bearer ${staffToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject({
      orphan_ncd_icd: expect.any(Number),
      orphan_contractor_jurisdiction: expect.any(Number),
      orphan_contractor_oversight: expect.any(Number),
      ok: expect.any(Boolean),
    });
    expect(res.body.data.orphan_article_x['article-x-icd10-covered']).toEqual(expect.any(Number));
  });

  it('customer JWT gets 403 on integrity endpoint', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/admin/references/integrity/cms')
      .set('Authorization', `Bearer ${customerToken}`);
    expect(res.status).toBe(403);
  });
});
