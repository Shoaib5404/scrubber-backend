import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { PasswordService } from '../../src/modules/auth/password.service';

describe('api-v1 reference / cpt explorer contract', () => {
  let app: INestApplication<App>;
  const prisma = new PrismaClient();
  const passwords = new PasswordService();
  let adminToken = '';
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

    const passwordHash = await passwords.hashPassword('Password123!');
    const admin = await prisma.user.create({
      data: {
        name: 'Ref Admin',
        email: `ref-admin-${stamp}@example.com`,
        password: passwordHash,
        role: 'admin',
        isActive: true,
      },
    });

    await prisma.cptCode.upsert({
      where: { name: '97597' },
      create: {
        name: '97597',
        description: 'Debridement, open wound',
        isActive: true,
      },
      update: { description: 'Debridement, open wound', isActive: true },
    });
    await prisma.cptCode.upsert({
      where: { name: '99999' },
      create: { name: '99999', description: 'Inactive fixture', isActive: false },
      update: { isActive: false },
    });
    await prisma.modifier.upsert({
      where: { modifier: '25' },
      create: {
        modifier: '25',
        shortDescription: 'Significant, separately identifiable E/M',
      },
      update: { shortDescription: 'Significant, separately identifiable E/M', termDt: null },
    });

    // CMS Order & Referring fixtures (Luhn-valid; 99988* prefix avoids colliding with real CMS data).
    await prisma.npiOrderingReferring.upsert({
      where: { npi: '9998800129' },
      create: {
        npi: '9998800129',
        firstName: 'JANE',
        lastName: 'ZZZREFAPI',
        active: true,
      },
      update: { firstName: 'JANE', lastName: 'ZZZREFAPI', active: true },
    });
    await prisma.npiOrderingReferring.upsert({
      where: { npi: '9998800137' },
      create: {
        npi: '9998800137',
        firstName: 'INACTIVE',
        lastName: 'ZZZREFAPI',
        active: false,
      },
      update: { firstName: 'INACTIVE', lastName: 'ZZZREFAPI', active: false },
    });

    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: admin.email, password: 'Password123!' });
    adminToken = login.body.accessToken as string;
  });

  afterAll(async () => {
    await prisma.npiOrderingReferring.deleteMany({
      where: { npi: { in: ['9998800129', '9998800137'] } },
    });
    await prisma.refreshToken.deleteMany({
      where: { user: { email: { contains: `ref-admin-${stamp}@` } } },
    });
    await prisma.user.deleteMany({ where: { email: { contains: `ref-admin-${stamp}@` } } });
    await app.close();
    await prisma.$disconnect();
  });

  it('CPT coding-reference search/lookup', async () => {
    const search = await request(app.getHttpServer())
      .get('/api/v1/reference/cpt/search?q=97597')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(search.status).toBe(200);
    expect(search.body.success).toBe(true);
    expect(search.body.data.items.some((i: { code: string }) => i.code === '97597')).toBe(true);

    const show = await request(app.getHttpServer())
      .get('/api/v1/reference/cpt/97597')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(show.status).toBe(200);
    expect(show.body.data.description).toMatch(/Debridement/i);

    const missing = await request(app.getHttpServer())
      .get('/api/v1/reference/cpt/99999')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(missing.status).toBe(404);
  });

  it('cpt-search and tab explorer', async () => {
    const hit = await request(app.getHttpServer())
      .get('/api/v1/cpt-search?code=97597')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(hit.status).toBe(200);
    expect(hit.body.code).toBe('97597');

    const tab = await request(app.getHttpServer())
      .get('/api/v1/cpt/97597/age-specific')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(tab.status).toBe(200);
    expect(tab.body.tab).toBe('age-specific');
    expect(tab.body.pagination).toBeDefined();
    expect(Array.isArray(tab.body.columns)).toBe(true);
  });

  it('rejects empty reference search query', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/reference/cpt/search?q=')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(400);
  });

  it(
    'NPI coding-reference search/lookup',
    async () => {
      const searchByNpi = await request(app.getHttpServer())
        .get('/api/v1/reference/npi/search?q=9998800129')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(searchByNpi.status).toBe(200);
      expect(searchByNpi.body.success).toBe(true);
      expect(searchByNpi.body.data.items.some((i: { code: string }) => i.code === '9998800129')).toBe(
        true,
      );

      const searchByName = await request(app.getHttpServer())
        .get('/api/v1/reference/npi/search?q=ZZZREFAPI')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(searchByName.status).toBe(200);
      expect(
        searchByName.body.data.items.some(
          (i: { code: string; lastName: string }) =>
            i.code === '9998800129' && i.lastName === 'ZZZREFAPI',
        ),
      ).toBe(true);

      const show = await request(app.getHttpServer())
        .get('/api/v1/reference/npi/9998800129')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(show.status).toBe(200);
      expect(show.body.data.description).toBe('ZZZREFAPI, JANE');
      expect(show.body.data.formatValid).toBe(true);
      expect(show.body.data.active).toBe(true);

      const inactive = await request(app.getHttpServer())
        .get('/api/v1/reference/npi/9998800137')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(inactive.status).toBe(404);

      const missing = await request(app.getHttpServer())
        .get('/api/v1/reference/npi/9998800145')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(missing.status).toBe(404);
    },
    30_000,
  );

  it('batch validate NPI: hit, miss, format fail, dedupe, mixed', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/reference/validate')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        cpt: ['97597'],
        npi: ['9998800129', '9998800145', '9998800129', '123', '9998800137'],
      });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.cpt[0]).toMatchObject({ code: '97597', valid: true });

    const npis = res.body.data.npi as Array<{
      code: string;
      valid: boolean;
      formatValid: boolean;
      description: string | null;
    }>;
    expect(npis.map((n) => n.code)).toEqual([
      '9998800129',
      '9998800145',
      '123',
      '9998800137',
    ]);

    expect(npis[0]).toMatchObject({
      code: '9998800129',
      valid: true,
      formatValid: true,
      description: 'ZZZREFAPI, JANE',
      active: true,
    });
    expect(npis[1]).toMatchObject({
      code: '9998800145',
      valid: false,
      formatValid: true,
      description: null,
      active: null,
    });
    expect(npis[2]).toMatchObject({
      code: '123',
      valid: false,
      formatValid: false,
      description: null,
      active: null,
    });
    // Inactive registry row → not valid for reference API
    expect(npis[3]).toMatchObject({
      code: '9998800137',
      valid: false,
      formatValid: true,
      description: null,
      active: null,
    });
  });

  it('rejects empty validate body', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/reference/validate')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});
    expect(res.status).toBe(400);
  });
});
