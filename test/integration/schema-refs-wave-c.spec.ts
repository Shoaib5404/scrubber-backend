import { PrismaClient } from '@prisma/client';

describe('schema-refs wave C', () => {
  const prisma = new PrismaClient();
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('persists taxonomy and zip code', async () => {
    const tax = await prisma.taxonomyCode.create({
      data: {
        taxonomyCode: `T${Date.now().toString().slice(-8)}`.slice(0, 10),
        specialtyName: 'Wave C Specialty',
        isActive: true,
      },
    });
    const zip = await prisma.zipCode.create({
      data: {
        zipCode: '90210',
        city: `Beverly${Date.now().toString().slice(-4)}`,
        state: 'CA',
        isActive: true,
      },
    });

    expect(tax.specialtyName).toBe('Wave C Specialty');
    expect(zip.state).toBe('CA');

    await prisma.zipCode.delete({ where: { id: zip.id } });
    await prisma.taxonomyCode.delete({ where: { id: tax.id } });
  });
});
