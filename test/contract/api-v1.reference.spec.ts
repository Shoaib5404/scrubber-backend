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

    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: admin.email, password: 'Password123!' });
    adminToken = login.body.accessToken as string;
  });

  afterAll(async () => {
    await prisma.refreshToken.deleteMany({
      where: { user: { email: { contains: `ref-admin-${stamp}@` } } },
    });
    await prisma.user.deleteMany({ where: { email: { contains: `ref-admin-${stamp}@` } } });
    await app.close();
    await prisma.$disconnect();
  });

  it('CPT coding-reference search/lookup', async () => {
    const search = await request(app.getHttpServer())
      .get('/api/v1/reference/cpt/search?q=975')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(search.status).toBe(200);
    expect(search.body.success).toBe(true);
    expect(search.body.data.items[0].code).toBe('97597');

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
});
