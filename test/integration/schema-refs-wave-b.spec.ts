import { PrismaClient } from '@prisma/client';

describe('schema-refs wave B', () => {
  const prisma = new PrismaClient();
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('persists NDC code and NDC–HCPCS crosswalk', async () => {
    const ndc = `00000-${Date.now().toString().slice(-4)}`;
    const digits = ndc.replace(/\D/g, '').padStart(11, '0').slice(0, 11);

    const code = await prisma.ndcCode.create({
      data: { ndc, ndcDigits: digits, isActive: true },
    });
    const xwalk = await prisma.ndcHcpcsCrosswalk.create({
      data: { ndc, hcpcs: 'J3490', isActive: true },
    });

    expect(await prisma.ndcCode.findUnique({ where: { ndc } })).not.toBeNull();
    expect(xwalk.hcpcs).toBe('J3490');

    await prisma.ndcHcpcsCrosswalk.delete({ where: { id: xwalk.id } });
    await prisma.ndcCode.delete({ where: { id: code.id } });
  });
});
