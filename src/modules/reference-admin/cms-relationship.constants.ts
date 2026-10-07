/**
 * Wave D article-x domains exposed in reference-admin (SP-7 Task 17).
 *
 * Import-only ArticleX* / related article child tables (no Laravel web CRUD) are listed in
 * ARTICLE_CHILD_PRISMA_MODELS so article delete cascades leave zero orphans (Task 18).
 */
export const ARTICLE_X_ADMIN_SLUGS = [
  'article-x-icd10-covered',
  'article-x-icd10-covered-group',
  'article-x-icd10-noncovered',
  'article-x-icd10-noncovered-group',
  'article-x-icd10-pcs-code',
  'article-x-icd10-pcs-code-group',
  'article-x-hcpc-code',
  'article-x-hcpc-code-group',
  'article-x-hcpc-modifier',
  'article-x-hcpc-modifier-group',
] as const;

export type ArticleXAdminSlug = (typeof ARTICLE_X_ADMIN_SLUGS)[number];

/** Prisma client delegate keys for orphan spot-check (admin article-x tables only). */
export const ARTICLE_X_ADMIN_PRISMA_BY_SLUG: Record<ArticleXAdminSlug, string> = {
  'article-x-icd10-covered': 'articleXIcd10Covered',
  'article-x-icd10-covered-group': 'articleXIcd10CoveredGroup',
  'article-x-icd10-noncovered': 'articleXIcd10Noncovered',
  'article-x-icd10-noncovered-group': 'articleXIcd10NoncoveredGroup',
  'article-x-icd10-pcs-code': 'articleXIcd10PcsCode',
  'article-x-icd10-pcs-code-group': 'articleXIcd10PcsCodeGroup',
  'article-x-hcpc-code': 'articleXHcpcCode',
  'article-x-hcpc-code-group': 'articleXHcpcCodeGroup',
  'article-x-hcpc-modifier': 'articleXHcpcModifier',
  'article-x-hcpc-modifier-group': 'articleXHcpcModifierGroup',
};

/** DB table names (@@map) aligned with ARTICLE_X_ADMIN_PRISMA_BY_SLUG keys. */
export const ARTICLE_X_ADMIN_TABLE_BY_SLUG: Record<ArticleXAdminSlug, string> = {
  'article-x-icd10-covered': 'article_x_icd10_covered',
  'article-x-icd10-covered-group': 'article_x_icd10_covered_group',
  'article-x-icd10-noncovered': 'article_x_icd10_noncovered',
  'article-x-icd10-noncovered-group': 'article_x_icd10_noncovered_group',
  'article-x-icd10-pcs-code': 'article_x_icd10_pcs_code',
  'article-x-icd10-pcs-code-group': 'article_x_icd10_pcs_code_group',
  'article-x-hcpc-code': 'article_x_hcpc_code',
  'article-x-hcpc-code-group': 'article_x_hcpc_code_group',
  'article-x-hcpc-modifier': 'article_x_hcpc_modifier',
  'article-x-hcpc-modifier-group': 'article_x_hcpc_modifier_group',
};

export type ArticleChildCascadeTarget =
  | { prismaModel: string; match: 'pair' }
  | { prismaModel: string; match: 'articleIdOnly' };

/** All article child tables that must be removed when an article row is deleted. */
export const ARTICLE_CHILD_PRISMA_MODELS: ArticleChildCascadeTarget[] = [
  { prismaModel: 'articleFutureRetire', match: 'articleIdOnly' },
  { prismaModel: 'articleRelatedDocument', match: 'pair' },
  { prismaModel: 'articleRelatedNcdDocument', match: 'pair' },
  { prismaModel: 'articleRelatedSourceIcd9', match: 'pair' },
  { prismaModel: 'articleXBillCode', match: 'pair' },
  { prismaModel: 'articleXCodeTable', match: 'pair' },
  { prismaModel: 'articleXContractor', match: 'pair' },
  { prismaModel: 'articleXHcpcCode', match: 'pair' },
  { prismaModel: 'articleXHcpcCodeGroup', match: 'pair' },
  { prismaModel: 'articleXHcpcModifier', match: 'pair' },
  { prismaModel: 'articleXHcpcModifierGroup', match: 'pair' },
  { prismaModel: 'articleXIcd10Covered', match: 'pair' },
  { prismaModel: 'articleXIcd10CoveredGroup', match: 'pair' },
  { prismaModel: 'articleXIcd10Noncovered', match: 'pair' },
  { prismaModel: 'articleXIcd10NoncoveredGroup', match: 'pair' },
  { prismaModel: 'articleXIcd10PcsCode', match: 'pair' },
  { prismaModel: 'articleXIcd10PcsCodeGroup', match: 'pair' },
  { prismaModel: 'articleXOtherCodingGroup', match: 'pair' },
  { prismaModel: 'articleXPrimaryJurisdiction', match: 'pair' },
  { prismaModel: 'articleXResponseToComment', match: 'pair' },
  { prismaModel: 'articleXRevenueCode', match: 'pair' },
  { prismaModel: 'articleXRevisionHistory', match: 'pair' },
  { prismaModel: 'articleXStickyNote', match: 'pair' },
  { prismaModel: 'articleXUrl', match: 'pair' },
];

export function isArticleXReferenceSlug(slug: string): boolean {
  return (
    (ARTICLE_X_ADMIN_SLUGS as readonly string[]).includes(slug) || slug.startsWith('article-x-')
  );
}
