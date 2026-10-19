import { PrismaClient } from '@prisma/client';
import { BUSINESS_RULE_CATALOG } from '../src/modules/business-rules/business-rule.catalog';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  for (const entry of BUSINESS_RULE_CATALOG) {
    await prisma.businessRule.upsert({
      where: { ruleKey: entry.ruleKey },
      create: {
        ruleKey: entry.ruleKey,
        name: entry.name,
        description: entry.description,
        category: entry.category,
        severity: entry.severity,
        defaultEnabled: true,
      },
      update: {
        name: entry.name,
        description: entry.description,
        category: entry.category,
        severity: entry.severity,
      },
    });
  }
  const count = await prisma.businessRule.count();
  console.log(`business_rules=${count}`);
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
