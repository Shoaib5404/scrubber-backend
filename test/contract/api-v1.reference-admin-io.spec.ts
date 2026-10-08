import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { LookupCacheService } from '../../src/modules/cache/lookup-cache.service';
import { PasswordService } from '../../src/modules/auth/password.service';
import { LookupSyncHelper } from '../../src/modules/imports/lookup-sync.helper';

describe('api-v1 admin reference import/export (M3)', () => {
  let app: INestApplication<App>;
  const prisma = new PrismaClient();
  const passwords = new PasswordService();
  let staffToken = '';
  let stamp = 0;
  /** Short unique prefix — cpt_code is VarChar(10). */
  let codePrefix = '';

  beforeAll(async () => {
    stamp = Date.now();
    codePrefix = `I${String(stamp).slice(-6)}`;
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
    const lookupSync = moduleRef.get(LookupSyncHelper);
    jest.spyOn(lookupSync, 'syncTable').mockResolvedValue(undefined);

    const passwordHash = await passwords.hashPassword('Password123!');
    const staff = await prisma.user.create({
      data: {
        name: 'Ref IO Staff',
        email: `ref-io-staff-${stamp}@example.com`,
        password: passwordHash,
        role: 'admin',
        isActive: true,
      },
    });

    const staffLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: staff.email, password: 'Password123!' });
    staffToken = staffLogin.body.accessToken as string;
  });

  afterAll(async () => {
    await prisma.ageSpecificCptRule.deleteMany({
      where: { cptCode: { startsWith: codePrefix } },
    });
    await prisma.refreshToken.deleteMany({
      where: { user: { email: `ref-io-staff-${stamp}@example.com` } },
    });
    await prisma.user.deleteMany({
      where: { email: `ref-io-staff-${stamp}@example.com` },
    });
    await app.close();
    await prisma.$disconnect();
  });

  it('domain list advertises import/export ops for Laravel web surface', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/admin/references')
      .set('Authorization', `Bearer ${staffToken}`);
    expect(res.status).toBe(200);
    const age = res.body.data.domains.find(
      (d: { slug: string }) => d.slug === 'age-specific-cpt-rules',
    );
    const cpt = res.body.data.domains.find((d: { slug: string }) => d.slug === 'cpt-codes');
    expect(age.ops).toEqual(expect.arrayContaining(['import', 'export']));
    expect(cpt.ops).toContain('export');
    expect(cpt.ops).not.toContain('import');
  });

  it('exports age-specific CPT rules as JSON attachment', async () => {
    const code = `${codePrefix}A`;
    await prisma.ageSpecificCptRule.upsert({
      where: { cptCode: code },
      create: {
        cptCode: code,
        description: 'IO export fixture',
        lowLimit: 0,
        highLimit: 17,
        unit: 'years',
        gender: 'B',
        isActive: true,
      },
      update: { description: 'IO export fixture' },
    });

    const res = await request(app.getHttpServer())
      .get('/api/v1/admin/references/age-specific-cpt-rules/export')
      .set('Authorization', `Bearer ${staffToken}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toMatch(/age_specific_cpt_rules_/);
    expect(Array.isArray(res.body.rules)).toBe(true);
    expect(res.body.rules.some((r: { cpt_code: string }) => r.cpt_code === code)).toBe(true);
  });

  it('imports age-specific CPT rules from JSON multipart', async () => {
    const code = `${codePrefix}B`;
    const payload = JSON.stringify({
      rules: [
        {
          cpt_code: code,
          description: 'IO import fixture',
          low_limit: 18,
          high_limit: 64,
          unit: 'years',
          gender: 'B',
          is_active: true,
        },
      ],
    });

    const res = await request(app.getHttpServer())
      .post('/api/v1/admin/references/age-specific-cpt-rules/import')
      .set('Authorization', `Bearer ${staffToken}`)
      .attach('file', Buffer.from(payload, 'utf8'), {
        filename: 'age-rules.json',
        contentType: 'application/json',
      });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.upserted).toBeGreaterThanOrEqual(1);

    const row = await prisma.ageSpecificCptRule.findUnique({ where: { cptCode: code } });
    expect(row?.description).toBe('IO import fixture');
  });

  it('rejects import on domains without Laravel web import', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/admin/references/cpt-codes/import')
      .set('Authorization', `Bearer ${staffToken}`)
      .attach('file', Buffer.from('{}', 'utf8'), {
        filename: 'x.json',
        contentType: 'application/json',
      });
    expect([404, 405]).toContain(res.status);
  });
});
