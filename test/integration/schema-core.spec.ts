import { PrismaClient } from '@prisma/client';

/**
 * SP-2 Task 6 — asserts core BatchFile columns required by Laravel parity.
 * Uses disposable Compose Postgres via DATABASE_URL.
 */
describe('schema-core (BatchFile)', () => {
  const prisma = new PrismaClient();

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('BatchFile has required Laravel-mapped columns and persists a row', async () => {
    const user = await prisma.user.create({
      data: {
        name: 'Schema Tester',
        email: `schema-core-${Date.now()}@example.com`,
        password: 'not-a-real-hash',
        role: 'customer',
      },
    });

    const batch = await prisma.batchFile.create({
      data: {
        filename: 'stored-abc.edi',
        originalFilename: 'upload.edi',
        filePath: 'storage/edi/stored-abc.edi',
        status: 'pending',
        uploadedById: user.id,
      },
    });

    expect(batch.filename).toBe('stored-abc.edi');
    expect(batch.originalFilename).toBe('upload.edi');
    expect(batch.filePath).toBe('storage/edi/stored-abc.edi');
    expect(batch.status).toBe('pending');
    expect(batch.uploadedById).toBe(user.id);
    expect(batch.totalClaims).toBe(0);
    expect(batch.validClaims).toBe(0);
    expect(batch.errorClaims).toBe(0);
    expect(batch.warningClaims).toBe(0);

    await prisma.batchFile.delete({ where: { id: batch.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });
});
