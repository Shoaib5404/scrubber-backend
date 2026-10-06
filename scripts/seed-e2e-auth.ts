import { hash } from 'argon2';
import { PrismaClient } from '@prisma/client';

/** Deterministic users for FE Playwright auth e2e (Task 9). */
async function main() {
  const prisma = new PrismaClient();
  const password = await hash('Password123!');

  const fixtures = [
    {
      email: 'e2e-admin@example.com',
      name: 'E2E Admin',
      role: 'admin',
      subscriptionStatus: 'active',
    },
    {
      email: 'e2e-customer@example.com',
      name: 'E2E Customer',
      role: 'customer',
      subscriptionStatus: 'active',
    },
  ] as const;

  for (const fixture of fixtures) {
    await prisma.user.upsert({
      where: { email: fixture.email },
      create: {
        email: fixture.email,
        name: fixture.name,
        role: fixture.role,
        password,
        isActive: true,
        subscriptionStatus: fixture.subscriptionStatus,
      },
      update: {
        password,
        isActive: true,
        role: fixture.role,
        subscriptionStatus: fixture.subscriptionStatus,
      },
    });
  }

  await prisma.$disconnect();
  // eslint-disable-next-line no-console
  console.log('Seeded e2e auth users.');
}

void main();
