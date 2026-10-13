import { hash } from 'argon2';
import { PrismaClient } from '@prisma/client';

/** Deterministic users for FE Playwright auth e2e (Task 9). */
async function main() {
  const prisma = new PrismaClient();
  const password = await hash('Password123!');

  await prisma.user.upsert({
    where: { email: 'e2e-admin@example.com' },
    create: {
      email: 'e2e-admin@example.com',
      name: 'E2E Admin',
      role: 'admin',
      password,
      isActive: true,
      subscriptionStatus: 'active',
    },
    update: {
      password,
      isActive: true,
      role: 'admin',
      subscriptionStatus: 'active',
      tenantId: null,
    },
  });

  const tenant = await prisma.tenant.upsert({
    where: { slug: 'e2e-customer-org' },
    create: {
      name: 'E2E Customer Org',
      slug: 'e2e-customer-org',
      status: 'active',
      subscriptionStatus: 'active',
      subscriptionStartsAt: new Date(),
    },
    update: {
      status: 'active',
      subscriptionStatus: 'active',
    },
  });

  await prisma.user.upsert({
    where: { email: 'e2e-customer@example.com' },
    create: {
      email: 'e2e-customer@example.com',
      name: 'E2E Customer',
      role: 'customer',
      password,
      isActive: true,
      subscriptionStatus: 'active',
      tenantId: tenant.id,
    },
    update: {
      password,
      isActive: true,
      role: 'customer',
      subscriptionStatus: 'active',
      tenantId: tenant.id,
    },
  });

  await prisma.$disconnect();
  // eslint-disable-next-line no-console
  console.log('Seeded e2e auth users.');
}

void main();
