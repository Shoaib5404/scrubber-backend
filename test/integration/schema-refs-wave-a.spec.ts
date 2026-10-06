import { PrismaClient } from '@prisma/client';

describe('schema-refs wave A', () => {
  const prisma = new PrismaClient();

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('inserts CPT code and age-specific CPT rule then queries by code', async () => {
    const suffix = Date.now().toString().slice(-6);
    const cptName = `99${suffix}`.slice(0, 5);

    const cpt = await prisma.cptCode.create({
      data: {
        name: cptName,
        description: 'Wave A integration CPT',
        isActive: true,
      },
    });

    const rule = await prisma.ageSpecificCptRule.create({
      data: {
        cptCode: cpt.name,
        description: 'Age rule for wave A',
        lowLimit: 18,
        highLimit: 65,
        unit: 'years',
        gender: 'B',
        isActive: true,
      },
    });

    const foundCpt = await prisma.cptCode.findUnique({ where: { name: cptName } });
    const foundRule = await prisma.ageSpecificCptRule.findUnique({
      where: { cptCode: cptName },
    });

    expect(foundCpt?.id).toBe(cpt.id);
    expect(foundRule?.id).toBe(rule.id);
    expect(foundRule?.lowLimit).toBe(18);
    expect(foundRule?.highLimit).toBe(65);

    await prisma.ageSpecificCptRule.delete({ where: { id: rule.id } });
    await prisma.cptCode.delete({ where: { id: cpt.id } });
  });
});
