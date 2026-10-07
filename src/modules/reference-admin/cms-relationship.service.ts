import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  ARTICLE_CHILD_PRISMA_MODELS,
  ARTICLE_X_ADMIN_SLUGS,
  ARTICLE_X_ADMIN_TABLE_BY_SLUG,
  type ArticleXAdminSlug,
} from './cms-relationship.constants';
import { toSnakeCase } from './snake.util';

type DeleteManyDelegate = {
  deleteMany: (args: { where: Record<string, unknown> }) => Promise<{ count: number }>;
};

type FindManyDelegate = {
  findMany: (args: unknown) => Promise<Record<string, unknown>[]>;
  count: (args: unknown) => Promise<number>;
};

export type CmsIntegrityReport = {
  orphan_article_x: Record<string, number>;
  orphan_ncd_icd: number;
  orphan_contractor_jurisdiction: number;
  orphan_contractor_oversight: number;
  ok: boolean;
};

@Injectable()
export class CmsRelationshipService {
  constructor(private readonly prisma: PrismaService) {}

  async assertArticlePairExists(articleId: number, articleVersion: number): Promise<void> {
    const article = await this.prisma.article.findFirst({
      where: { articleId, articleVersion },
      select: { id: true },
    });
    if (!article) {
      throw new BadRequestException(
        `Article ${articleId} version ${articleVersion} does not exist.`,
      );
    }
  }

  async assertContractorTripletExists(
    contractorId: number,
    contractorTypeId: number,
    contractorVersion: number,
  ): Promise<void> {
    const contractor = await this.prisma.contractor.findFirst({
      where: { contractorId, contractorTypeId, contractorVersion },
      select: { id: true },
    });
    if (!contractor) {
      throw new BadRequestException(
        `Contractor ${contractorId} type ${contractorTypeId} version ${contractorVersion} does not exist.`,
      );
    }
  }

  async assertNcdCptExists(ncdCptId: number): Promise<void> {
    if (!Number.isInteger(ncdCptId) || ncdCptId <= 0 || ncdCptId > 2_147_483_647) {
      throw new BadRequestException(`NCD CPT id ${ncdCptId} does not exist.`);
    }
    const row = await this.prisma.ncdCpt.findUnique({
      where: { id: ncdCptId },
      select: { id: true },
    });
    if (!row) {
      throw new BadRequestException(`NCD CPT id ${ncdCptId} does not exist.`);
    }
  }

  async cascadeDeleteArticleChildren(
    articleId: number,
    articleVersion: number,
  ): Promise<{ deleted: Record<string, number> }> {
    const client = this.prisma as unknown as Record<string, DeleteManyDelegate>;
    const deleted: Record<string, number> = {};

    for (const target of ARTICLE_CHILD_PRISMA_MODELS) {
      const delegate = client[target.prismaModel];
      if (!delegate?.deleteMany) {
        throw new NotFoundException(`Prisma model ${target.prismaModel} is not configured.`);
      }
      const where =
        target.match === 'articleIdOnly'
          ? { articleId }
          : { articleId, articleVersion };
      const result = await delegate.deleteMany({ where });
      deleted[target.prismaModel] = result.count;
    }

    return { deleted };
  }

  async listNcdIcdsForCpt(
    ncdCptId: number,
    page: number,
    perPage: number,
    search?: string,
  ): Promise<{
    items: Record<string, unknown>[];
    meta: { page: number; per_page: number; total: number; last_page: number };
  }> {
    await this.assertNcdCptExists(ncdCptId);

    const safePage = Math.max(1, page);
    const safePerPage = Math.min(100, Math.max(1, perPage));
    const skip = (safePage - 1) * safePerPage;
    const needle = search?.trim();

    const where: Prisma.NcdIcdWhereInput = {
      ncdCptId,
      ...(needle ? { icdCode: { contains: needle, mode: 'insensitive' } } : {}),
    };

    const delegate = this.prisma.ncdIcd as unknown as FindManyDelegate;
    const [rows, total] = await Promise.all([
      delegate.findMany({
        where,
        skip,
        take: safePerPage,
        orderBy: { id: 'desc' },
      }),
      delegate.count({ where }),
    ]);

    const lastPage = Math.max(1, Math.ceil(total / safePerPage));

    return {
      items: rows.map((row) => toSnakeCase(row) as Record<string, unknown>),
      meta: {
        page: safePage,
        per_page: safePerPage,
        total,
        last_page: lastPage,
      },
    };
  }

  async countOrphans(): Promise<CmsIntegrityReport> {
    const orphan_article_x: Record<string, number> = {};

    for (const slug of ARTICLE_X_ADMIN_SLUGS) {
      const table = ARTICLE_X_ADMIN_TABLE_BY_SLUG[slug as ArticleXAdminSlug];
      const rows = await this.prisma.$queryRaw<{ count: bigint }[]>(
        Prisma.sql`
          SELECT COUNT(*)::bigint AS count
          FROM ${Prisma.raw(table)} AS child
          WHERE NOT EXISTS (
            SELECT 1 FROM article AS parent
            WHERE parent.article_id = child.article_id
              AND parent.article_version = child.article_version
          )
        `,
      );
      orphan_article_x[slug] = Number(rows[0]?.count ?? 0n);
    }

    const [ncdIcdRows, jurisdictionRows, oversightRows] = await Promise.all([
      this.prisma.$queryRaw<{ count: bigint }[]>(Prisma.sql`
        SELECT COUNT(*)::bigint AS count
        FROM ncd_icd AS child
        WHERE NOT EXISTS (SELECT 1 FROM ncd_cpt AS parent WHERE parent.id = child.ncd_cpt_id)
      `),
      this.prisma.$queryRaw<{ count: bigint }[]>(Prisma.sql`
        SELECT COUNT(*)::bigint AS count
        FROM contractor_jurisdiction AS child
        WHERE NOT EXISTS (
          SELECT 1 FROM contractor AS parent
          WHERE parent.contractor_id = child.contractor_id
            AND parent.contractor_type_id = child.contractor_type_id
            AND parent.contractor_version = child.contractor_version
        )
      `),
      this.prisma.$queryRaw<{ count: bigint }[]>(Prisma.sql`
        SELECT COUNT(*)::bigint AS count
        FROM contractor_oversight AS child
        WHERE NOT EXISTS (
          SELECT 1 FROM contractor AS parent
          WHERE parent.contractor_id = child.contractor_id
            AND parent.contractor_type_id = child.contractor_type_id
            AND parent.contractor_version = child.contractor_version
        )
      `),
    ]);

    const orphan_ncd_icd = Number(ncdIcdRows[0]?.count ?? 0n);
    const orphan_contractor_jurisdiction = Number(jurisdictionRows[0]?.count ?? 0n);
    const orphan_contractor_oversight = Number(oversightRows[0]?.count ?? 0n);

    const ok =
      Object.values(orphan_article_x).every((n) => n === 0) &&
      orphan_ncd_icd === 0 &&
      orphan_contractor_jurisdiction === 0 &&
      orphan_contractor_oversight === 0;

    return {
      orphan_article_x,
      orphan_ncd_icd,
      orphan_contractor_jurisdiction,
      orphan_contractor_oversight,
      ok,
    };
  }
}
