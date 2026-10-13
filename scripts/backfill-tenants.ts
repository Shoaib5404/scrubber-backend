/**
 * Backfill: one Tenant per existing customer/tenant_admin user.
 * Staff users keep tenant_id null.
 *
 * Usage: npx ts-node scripts/backfill-tenants.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return base.length > 0 ? base : 'tenant';
}

async function uniqueSlug(base: string): Promise<string> {
  let slug = base;
  let n = 0;
  while (await prisma.tenant.findUnique({ where: { slug } })) {
    n += 1;
    slug = `${base}-${n}`;
  }
  return slug;
}

async function main() {
  const customers = await prisma.user.findMany({
    where: {
      tenantId: null,
      role: { in: ['customer', 'tenant_admin'] },
    },
    orderBy: { id: 'asc' },
  });

  let created = 0;
  for (const user of customers) {
    const name = user.name?.trim() || user.email.split('@')[0] || `Customer ${user.id}`;
    const slug = await uniqueSlug(slugify(`${name}-${user.id}`));
    const tenant = await prisma.tenant.create({
      data: {
        name: `${name} Org`,
        slug,
        status: 'active',
        subscriptionStatus: user.subscriptionStatus || 'inactive',
        subscriptionStartsAt: user.subscriptionStartsAt,
        subscriptionEndsAt: user.subscriptionEndsAt,
      },
    });

    await prisma.user.update({
      where: { id: user.id },
      data: { tenantId: tenant.id },
    });

    await prisma.apiClient.updateMany({
      where: { userId: user.id, tenantId: null },
      data: { tenantId: tenant.id },
    });

    await prisma.batchFile.updateMany({
      where: { uploadedById: user.id, tenantId: null },
      data: { tenantId: tenant.id },
    });

    await prisma.ediUploadErrorLog.updateMany({
      where: { userId: user.id, tenantId: null },
      data: { tenantId: tenant.id },
    });

    created += 1;
    // eslint-disable-next-line no-console
    console.log(`Tenant ${tenant.id} (${tenant.slug}) <- user ${user.id} ${user.email}`);
  }

  const orphanBatches = await prisma.batchFile.count({
    where: { tenantId: null, uploadedById: { not: null } },
  });
  const customersWithoutTenant = await prisma.user.count({
    where: { role: { in: ['customer', 'tenant_admin'] }, tenantId: null },
  });

  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        tenants_created: created,
        orphan_batches_with_uploader: orphanBatches,
        customers_without_tenant: customersWithoutTenant,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
