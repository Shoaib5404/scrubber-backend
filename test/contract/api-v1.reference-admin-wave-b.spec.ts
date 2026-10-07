import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { LookupCacheService } from '../../src/modules/cache/lookup-cache.service';
import { PasswordService } from '../../src/modules/auth/password.service';

describe('api-v1 admin reference-admin wave B contract', () => {
  let app: INestApplication<App>;
  const prisma = new PrismaClient();
  const passwords = new PasswordService();
  let staffToken = '';
  let customerToken = '';
  let stamp = 0;
  let lookupCache: LookupCacheService;
  let medicaidJsonPath = '';

  beforeAll(async () => {
    stamp = Date.now();
    medicaidJsonPath = path.join(
      os.tmpdir(),
      `medicaid-formats-contract-${stamp}.json`,
    );
    process.env.MEDICAID_MEMBER_ID_FORMATS_PATH = medicaidJsonPath;
    await fs.writeFile(
      medicaidJsonPath,
      JSON.stringify({ meta: { updated_at: null }, by_payer_id: {} }, null, 2),
    );

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
        name: 'Ref Admin Wave B Staff',
        email: `ref-admin-b-staff-${stamp}@example.com`,
        password: passwordHash,
        role: 'admin',
        isActive: true,
      },
    });
    const customer = await prisma.user.create({
      data: {
        name: 'Ref Admin Wave B Customer',
        email: `ref-admin-b-customer-${stamp}@example.com`,
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
    await prisma.cignaCptIcdCrosswalk.deleteMany({
      where: {
        OR: [
          { cptCode: { startsWith: `WB${stamp}` } },
          { icdCode: { startsWith: `WB${stamp}` } },
        ],
      },
    });
    await prisma.refreshToken.deleteMany({
      where: {
        user: {
          email: {
            in: [
              `ref-admin-b-staff-${stamp}@example.com`,
              `ref-admin-b-customer-${stamp}@example.com`,
            ],
          },
        },
      },
    });
    await prisma.user.deleteMany({
      where: {
        email: {
          in: [
            `ref-admin-b-staff-${stamp}@example.com`,
            `ref-admin-b-customer-${stamp}@example.com`,
          ],
        },
      },
    });
    await app.close();
    await prisma.$disconnect();
    try {
      await fs.unlink(medicaidJsonPath);
    } catch {
      // ignore
    }
    delete process.env.MEDICAID_MEMBER_ID_FORMATS_PATH;
  });

  it('domain list includes Wave B slugs', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/admin/references')
      .set('Authorization', `Bearer ${staffToken}`);
    expect(res.status).toBe(200);
    const slugs = res.body.data.domains.map((d: { slug: string }) => d.slug);
    expect(slugs).toContain('ndc-codes');
    expect(slugs).toContain('bcbs-claim-routings');
  });

  it('staff cigna-cpt-icd-crosswalk CRUD + toggle + delete invalidates lookup cache', async () => {
    const cpt = `WB${stamp}`;
    const icd = `WB${stamp}A`;

    const create = await request(app.getHttpServer())
      .post('/api/v1/admin/references/cigna-cpt-icd-crosswalk')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ cpt_code: cpt, icd_code: icd, is_active: true });
    expect(create.status).toBe(201);
    expect(create.body.data.cpt_code).toBe(cpt);
    expect(lookupCache.invalidateTable).toHaveBeenCalledWith('cigna_cpt_icd_crosswalk');

    const id = create.body.data.id as number;

    const toggle = await request(app.getHttpServer())
      .post(`/api/v1/admin/references/cigna-cpt-icd-crosswalk/${id}/toggle-active`)
      .set('Authorization', `Bearer ${staffToken}`);
    expect(toggle.status).toBe(200);
    expect(toggle.body.data.is_active).toBe(false);

    const destroy = await request(app.getHttpServer())
      .delete(`/api/v1/admin/references/cigna-cpt-icd-crosswalk/${id}`)
      .set('Authorization', `Bearer ${staffToken}`);
    expect(destroy.status).toBe(200);
  });

  it('customer JWT gets 403 on Wave B create', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/admin/references/cigna-cpt-icd-crosswalk')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ cpt_code: `WB${stamp}X`, icd_code: `WB${stamp}Y` });
    expect(res.status).toBe(403);
  });

  it('medicaid-member-id-formats JSON CRUD with string id', async () => {
    const rtPayerId = `RT${stamp}`;
    const create = await request(app.getHttpServer())
      .post('/api/v1/admin/references/medicaid-member-id-formats')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        payer_name: 'AL MEDICAID',
        rt_payer_id: rtPayerId,
        member_id_format: 'NUM12',
        is_active: true,
      });
    expect(create.status).toBe(201);
    const id = create.body.data.id as string;
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);

    const list = await request(app.getHttpServer())
      .get(`/api/v1/admin/references/medicaid-member-id-formats?search=${rtPayerId}`)
      .set('Authorization', `Bearer ${staffToken}`);
    expect(list.status).toBe(200);
    expect(list.body.data.items.some((row: { id: string }) => row.id === id)).toBe(true);

    const toggle = await request(app.getHttpServer())
      .post(`/api/v1/admin/references/medicaid-member-id-formats/${id}/toggle-active`)
      .set('Authorization', `Bearer ${staffToken}`);
    expect(toggle.status).toBe(200);
    expect(toggle.body.data.is_active).toBe(false);

    const destroy = await request(app.getHttpServer())
      .delete(`/api/v1/admin/references/medicaid-member-id-formats/${id}`)
      .set('Authorization', `Bearer ${staffToken}`);
    expect(destroy.status).toBe(200);
  });
});
