import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const orphans = await prisma.batchFile.findMany({
    where: { tenantId: null, uploadedById: { not: null } },
    select: { id: true, uploadedById: true },
  });
  let fixed = 0;
  for (const batch of orphans) {
    if (batch.uploadedById == null) continue;
    const user = await prisma.user.findUnique({ where: { id: batch.uploadedById } });
    if (user?.tenantId == null) continue;
    await prisma.batchFile.update({
      where: { id: batch.id },
      data: { tenantId: user.tenantId },
    });
    fixed += 1;
  }
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ orphans: orphans.length, fixed }, null, 2));
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
