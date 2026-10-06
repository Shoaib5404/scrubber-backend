import { PrismaClient } from '@prisma/client';

describe('schema-refs wave D', () => {
  const prisma = new PrismaClient();
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('persists article and NCD CPT/ICD with FK', async () => {
    const articleId = Number(`${Date.now()}`.slice(-8));
    const article = await prisma.article.create({
      data: {
        articleId,
        articleVersion: 1,
        title: 'Wave D article',
        status: 'A',
      },
    });

    const ncd = await prisma.ncdCpt.create({
      data: {
        ncdNumber: `NCD-${articleId}`,
        ncdDescription: 'Wave D NCD',
        cptCode: '99213',
      },
    });
    const ncdIcd = await prisma.ncdIcd.create({
      data: {
        icdCode: 'E11.9',
        ncdCptId: ncd.id,
        resolutionCode: 1,
      },
    });

    expect(article.articleId).toBe(articleId);
    expect(ncdIcd.ncdCptId).toBe(ncd.id);

    await prisma.ncdIcd.delete({ where: { id: ncdIcd.id } });
    await prisma.ncdCpt.delete({ where: { id: ncd.id } });
    await prisma.article.delete({ where: { id: article.id } });
  });
});
