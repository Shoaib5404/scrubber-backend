import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ASSOCIATED_DOCUMENT_URL_HEADINGS } from './articles-show.constants';
import { toSnakeCase } from './snake.util';

export type ArticleShowQuery = {
  articleId: number;
  requestedVersion: number | null;
};

type HcpcGroupBucket = {
  code_group: Record<string, unknown> | null;
  codes: Record<string, unknown>[];
};

type HcpcModifierBucket = {
  modifier_group: Record<string, unknown> | null;
  modifiers: Record<string, unknown>[];
};

type Icd10GroupedBucket = {
  group: number | null;
  group_row: Record<string, unknown> | null;
  codes: Record<string, unknown>[];
};

@Injectable()
export class ArticlesShowService {
  constructor(private readonly prisma: PrismaService) {}

  async showByMedicareNumber(query: ArticleShowQuery): Promise<Record<string, unknown>> {
    const { articleId, requestedVersion } = query;
    const articleRow = await this.loadArticleForShow(articleId, requestedVersion);

    const aid = articleRow.articleId;
    const ver = articleRow.articleVersion;

    const [
      articleContractorRows,
      articleCoding,
      articleRelatedDocuments,
      articleRelatedNcdDocuments,
      articleAssociatedUrls,
      articlePublicVersions,
      articleStickyNotes,
      articleResponseToComments,
    ] = await Promise.all([
      this.articleContractorDisplayRows(aid, ver),
      this.articleCodingViewData(aid, ver, articleRow.addIcd10Info),
      this.articleRelatedDocumentsForShow(aid, ver),
      this.articleRelatedNcdDocumentsForShow(aid, ver),
      this.articleAssociatedUrlsDisplay(aid, ver),
      this.articlePublicVersionsForAssociatedDocuments(aid),
      this.articleStickyNotesForArticleId(aid),
      this.articleResponseToCommentsForArticleId(aid),
    ]);

    const articleTypeDescription = await this.articleTypeDescription(articleRow.articleType);

    const article = {
      ...articleRow,
      article_type_description: articleTypeDescription,
    };

    const payload = {
      article,
      requested_article_version: requestedVersion,
      article_contractor_rows: articleContractorRows,
      article_coding: articleCoding,
      article_related_documents: articleRelatedDocuments,
      article_related_ncd_documents: articleRelatedNcdDocuments,
      article_associated_urls: articleAssociatedUrls,
      article_public_versions: articlePublicVersions,
      article_sticky_notes: articleStickyNotes,
      article_response_to_comments: articleResponseToComments,
      associated_document_url_headings: ASSOCIATED_DOCUMENT_URL_HEADINGS,
    };

    return toSnakeCase(payload) as Record<string, unknown>;
  }

  private async loadArticleForShow(articleId: number, requestedVersion: number | null) {
    if (requestedVersion !== null) {
      const exact = await this.prisma.article.findFirst({
        where: { articleId, articleVersion: requestedVersion },
      });
      if (exact) {
        return exact;
      }
    }

    const latest = await this.prisma.article.findFirst({
      where: { articleId },
      orderBy: { articleVersion: 'desc' },
    });

    if (!latest) {
      throw new NotFoundException(`Article ${articleId} was not found.`);
    }

    return latest;
  }

  private async articleTypeDescription(articleType: number | null): Promise<string | null> {
    if (articleType === null) {
      return null;
    }
    const row = await this.prisma.articleTypeLookup.findUnique({
      where: { articleTypeId: articleType },
      select: { description: true },
    });
    return row?.description ?? null;
  }

  private async articleContractorDisplayRows(articleId: number, articleVersion: number) {
    type ContractorRow = {
      pivot_id: number;
      article_id: number;
      article_version: number;
      article_type: number | null;
      pivot_contractor_id: number;
      pivot_contractor_type_id: number | null;
      pivot_contractor_version: number | null;
      pivot_last_updated: Date | null;
      contractor_pk: number | null;
      contractor_id: number | null;
      contractor_type_id: number | null;
      contractor_version: number | null;
      contractor_bus_name: string | null;
      contractor_number: string | null;
      contractor_subtype_id: number | null;
      dmerc_rgn: number | null;
      resolved_contractor_type_id: number | null;
      contactracto_type: string | null;
      sub_type_desc: string | null;
      super_mac_description: string | null;
      state_descriptions: string | null;
    };

    const rows = await this.prisma.$queryRaw<ContractorRow[]>`
SELECT
    ac.id AS pivot_id,
    ac.article_id,
    ac.article_version,
    ac.article_type,
    ac.contractor_id AS pivot_contractor_id,
    ac.contractor_type_id AS pivot_contractor_type_id,
    ac.contractor_version AS pivot_contractor_version,
    ac.last_updated AS pivot_last_updated,
    c.id AS contractor_pk,
    c.contractor_id,
    c.contractor_type_id,
    c.contractor_version,
    c.contractor_bus_name,
    c.contractor_number,
    c.contractor_subtype_id,
    c.dmerc_rgn,
    COALESCE(c.contractor_type_id, ac.contractor_type_id) AS resolved_contractor_type_id,
    ct.description AS contactracto_type,
    sct.description AS sub_type_desc,
    regin.super_mac_description,
    cj_states.state_descriptions
FROM article_x_contractor ac
LEFT JOIN contractor c
    ON c.contractor_id = ac.contractor_id
    AND c.contractor_type_id = ac.contractor_type_id
    AND c.contractor_version = ac.contractor_version
LEFT JOIN contractor_type_lookup ct
    ON ct.contractor_type_id = COALESCE(c.contractor_type_id, ac.contractor_type_id)
LEFT JOIN contractor_subtype_lookup sct
    ON sct.contractor_subtype_id = c.contractor_subtype_id
LEFT JOIN dmerc_region_lookup regin
    ON regin.region_id = c.dmerc_rgn
LEFT JOIN (
SELECT
    cj.contractor_id,
    cj.contractor_type_id,
    cj.contractor_version,
    string_agg(sl.description, ', ' ORDER BY sl.description) AS state_descriptions
FROM contractor_jurisdiction cj
INNER JOIN state_lookup sl ON sl.state_id = cj.state_id
GROUP BY cj.contractor_id, cj.contractor_type_id, cj.contractor_version
) AS cj_states
    ON cj_states.contractor_id = ac.contractor_id
    AND cj_states.contractor_type_id = ac.contractor_type_id
    AND cj_states.contractor_version = ac.contractor_version
WHERE ac.article_id = ${articleId}
  AND ac.article_version = ${articleVersion}
ORDER BY ac.id
`;

    return rows.map((row) => {
      const pivot = {
        id: row.pivot_id,
        article_id: row.article_id,
        article_version: row.article_version,
        article_type: row.article_type,
        contractor_id: row.pivot_contractor_id,
        contractor_type_id: row.pivot_contractor_type_id,
        contractor_version: row.pivot_contractor_version,
        last_updated: row.pivot_last_updated,
      };

      let contractor: Record<string, unknown> | null = null;
      if (row.contractor_pk !== null) {
        contractor = {
          id: row.contractor_pk,
          contractor_id: row.contractor_id,
          contractor_type_id: row.contractor_type_id,
          contractor_version: row.contractor_version,
          contractor_bus_name: row.contractor_bus_name,
          contractor_number: row.contractor_number,
          contractor_subtype_id: row.contractor_subtype_id,
          dmerc_rgn: row.dmerc_rgn,
          contractor_type_lookup:
            row.resolved_contractor_type_id !== null || row.contactracto_type !== null
              ? {
                  contractor_type_id: row.resolved_contractor_type_id,
                  description: row.contactracto_type,
                }
              : null,
          contractor_subtype_lookup:
            row.contractor_subtype_id !== null
              ? {
                  contractor_subtype_id: row.contractor_subtype_id,
                  description: row.sub_type_desc,
                }
              : null,
          dmerc_region_lookup:
            row.dmerc_rgn !== null
              ? {
                  region_id: row.dmerc_rgn,
                  super_mac_description: row.super_mac_description,
                }
              : null,
        };
      }

      const stateList = row.state_descriptions;
      const jurisdictionStates =
        stateList !== null && stateList !== '' ? stateList : '—';

      return {
        pivot,
        contractor,
        contractor_show_url: contractor ? `/admin/references/contractors/${row.contractor_pk}` : null,
        jurisdiction_states: jurisdictionStates,
      };
    });
  }

  private async articleCodingViewData(
    articleId: number,
    articleVersion: number,
    addIcd10Info: string | null,
  ) {
    const [hcpcs, hcpcModifiers, icd10CmCovered, icd10CmNoncovered, icd10Pcs, billCodes, revenueCodes, otherCoding] =
      await Promise.all([
        this.hcpcCodeGroupsAndCodesJoined(articleId, articleVersion),
        this.hcpcModifierGroupsAndModifiersJoined(articleId, articleVersion),
        this.icd10CoveredCodesAndGroupsJoined(articleId, articleVersion),
        this.icd10NoncoveredGrouped(articleId, articleVersion),
        this.icd10PcsGrouped(articleId, articleVersion),
        this.prisma.articleXBillCode.findMany({
          where: { articleId, articleVersion },
          select: { billCodeId: true, description: true },
          orderBy: { billCodeId: 'asc' },
        }),
        this.prisma.articleXRevenueCode.findMany({
          where: { articleId, articleVersion },
          select: { revenueCodeId: true, description: true },
          orderBy: { revenueCodeId: 'asc' },
        }),
        this.prisma.articleXOtherCodingGroup.findMany({
          where: { articleId, articleVersion },
          select: { otherCodingGroup: true, paragraph: true, codes: true },
          orderBy: { otherCodingGroup: 'asc' },
        }),
      ]);

    return {
      hcpcs,
      hcpc_modifiers: hcpcModifiers,
      icd10_cm_covered: icd10CmCovered,
      icd10_cm_noncovered: icd10CmNoncovered,
      icd10_pcs: icd10Pcs,
      bill_codes: billCodes.map((r) => ({
        bill_code_id: r.billCodeId,
        description: r.description,
      })),
      revenue_codes: revenueCodes.map((r) => ({
        revenue_code_id: r.revenueCodeId,
        description: r.description,
      })),
      other_coding: otherCoding.map((r) => ({
        other_coding_group: r.otherCodingGroup,
        paragraph: r.paragraph,
        codes: r.codes,
      })),
      add_icd10_info: addIcd10Info,
    };
  }

  private async hcpcCodeGroupsAndCodesJoined(
    articleId: number,
    articleVersion: number,
  ): Promise<Record<number, HcpcGroupBucket>> {
    type Row = {
      grp_hcpc_code_group: number;
      grp_paragraph: string | null;
      code_hcpc_code_id: string | null;
      code_hcpc_code_version: number | null;
      code_short_description: string | null;
      code_long_description: string | null;
    };

    const rows = await this.prisma.$queryRaw<Row[]>`
SELECT
    g.hcpc_code_group AS grp_hcpc_code_group,
    g.paragraph AS grp_paragraph,
    c.hcpc_code_id AS code_hcpc_code_id,
    c.hcpc_code_version AS code_hcpc_code_version,
    c.short_description AS code_short_description,
    c.long_description AS code_long_description
FROM article_x_hcpc_code_group AS g
LEFT JOIN article_x_hcpc_code AS c
    ON c.article_id = g.article_id
    AND c.article_version = g.article_version
    AND c.hcpc_code_group = g.hcpc_code_group
WHERE g.article_id = ${articleId}
  AND g.article_version = ${articleVersion}
  AND g.hcpc_code_group IN (1, 2)
ORDER BY g.hcpc_code_group ASC, c.hcpc_code_id ASC
`;

    const groupsMap = new Map<number, Record<string, unknown>>();
    const codesLists: Record<number, Record<string, unknown>[]> = { 1: [], 2: [] };

    for (const row of rows) {
      const gNum = row.grp_hcpc_code_group;
      if (!groupsMap.has(gNum)) {
        groupsMap.set(gNum, {
          hcpc_code_group: gNum,
          paragraph: row.grp_paragraph,
        });
      }
      if (row.code_hcpc_code_id !== null) {
        codesLists[gNum]?.push({
          hcpc_code_group: gNum,
          hcpc_code_id: row.code_hcpc_code_id,
          hcpc_code_version: row.code_hcpc_code_version,
          short_description: row.code_short_description,
          long_description: row.code_long_description,
        });
      }
    }

    const out: Record<number, HcpcGroupBucket> = {};
    for (const g of [1, 2] as const) {
      out[g] = {
        code_group: groupsMap.get(g) ?? null,
        codes: codesLists[g] ?? [],
      };
    }
    return out;
  }

  private async hcpcModifierGroupsAndModifiersJoined(
    articleId: number,
    articleVersion: number,
  ): Promise<Record<number, HcpcModifierBucket>> {
    type Row = {
      grp_hcpc_modifier_group: number;
      grp_paragraph: string | null;
      mod_hcpc_modifier_code_id: string | null;
      mod_description: string | null;
    };

    const rows = await this.prisma.$queryRaw<Row[]>`
SELECT
    g.hcpc_modifier_group AS grp_hcpc_modifier_group,
    g.paragraph AS grp_paragraph,
    m.hcpc_modifier_code_id AS mod_hcpc_modifier_code_id,
    m.description AS mod_description
FROM article_x_hcpc_modifier_group AS g
LEFT JOIN article_x_hcpc_modifier AS m
    ON m.article_id = g.article_id
    AND m.article_version = g.article_version
    AND m.hcpc_modifier_group = g.hcpc_modifier_group
WHERE g.article_id = ${articleId}
  AND g.article_version = ${articleVersion}
  AND g.hcpc_modifier_group IN (1, 2)
ORDER BY g.hcpc_modifier_group ASC, m.hcpc_modifier_code_id ASC
`;

    const groupsMap = new Map<number, Record<string, unknown>>();
    const modsLists: Record<number, Record<string, unknown>[]> = { 1: [], 2: [] };

    for (const row of rows) {
      const gNum = row.grp_hcpc_modifier_group;
      if (!groupsMap.has(gNum)) {
        groupsMap.set(gNum, {
          hcpc_modifier_group: gNum,
          paragraph: row.grp_paragraph,
        });
      }
      if (row.mod_hcpc_modifier_code_id !== null) {
        modsLists[gNum]?.push({
          hcpc_modifier_group: gNum,
          hcpc_modifier_code_id: row.mod_hcpc_modifier_code_id,
          description: row.mod_description,
        });
      }
    }

    const out: Record<number, HcpcModifierBucket> = {};
    for (const g of [1, 2] as const) {
      out[g] = {
        modifier_group: groupsMap.get(g) ?? null,
        modifiers: modsLists[g] ?? [],
      };
    }
    return out;
  }

  private async icd10CoveredCodesAndGroupsJoined(
    articleId: number,
    articleVersion: number,
  ): Promise<Icd10GroupedBucket[]> {
    type Row = {
      cov_icd10_covered_group: number | null;
      cov_icd10_code_id: string;
      cov_sort_order: number | null;
      cov_description: string | null;
      grp_icd10_covered_group: number | null;
      grp_paragraph: string | null;
    };

    const rows = await this.prisma.$queryRaw<Row[]>`
SELECT
    c.icd10_covered_group AS cov_icd10_covered_group,
    c.icd10_code_id AS cov_icd10_code_id,
    c.sort_order AS cov_sort_order,
    c.description AS cov_description,
    grp.icd10_covered_group AS grp_icd10_covered_group,
    grp.paragraph AS grp_paragraph
FROM article_x_icd10_covered AS c
LEFT JOIN article_x_icd10_covered_group AS grp
    ON grp.article_id = c.article_id
    AND grp.article_version = c.article_version
    AND grp.icd10_covered_group = c.icd10_covered_group
WHERE c.article_id = ${articleId}
  AND c.article_version = ${articleVersion}
ORDER BY c.sort_order ASC, c.icd10_code_id ASC
`;

    const coveredAll: Array<{
      icd10_covered_group: number | null;
      icd10_code_id: string;
      sort_order: number | null;
      description: string | null;
    }> = [];
    const groupsMap = new Map<number, Record<string, unknown>>();

    for (const row of rows) {
      coveredAll.push({
        icd10_covered_group: row.cov_icd10_covered_group,
        icd10_code_id: row.cov_icd10_code_id,
        sort_order: row.cov_sort_order,
        description: row.cov_description,
      });

      if (row.cov_icd10_covered_group !== null && row.grp_icd10_covered_group !== null) {
        const gn = row.cov_icd10_covered_group;
        if (!groupsMap.has(gn)) {
          groupsMap.set(gn, {
            icd10_covered_group: gn,
            paragraph: row.grp_paragraph,
          });
        }
      }
    }

    return this.groupIcd10Rows(coveredAll, 'icd10_covered_group', groupsMap);
  }

  private async icd10NoncoveredGrouped(
    articleId: number,
    articleVersion: number,
  ): Promise<Icd10GroupedBucket[]> {
    const nonAll = await this.prisma.articleXIcd10Noncovered.findMany({
      where: { articleId, articleVersion },
      select: {
        icd10NoncoveredGroup: true,
        icd10CodeId: true,
        description: true,
      },
      orderBy: [{ sortOrder: 'asc' }, { icd10CodeId: 'asc' }],
    });

    const codes = nonAll.map((r) => ({
      icd10_noncovered_group: r.icd10NoncoveredGroup,
      icd10_code_id: r.icd10CodeId,
      description: r.description,
    }));

    const groupNums = [
      ...new Set(
        codes
          .map((c) => c.icd10_noncovered_group)
          .filter((v): v is number => v !== null),
      ),
    ].sort((a, b) => a - b);

    const groupsMap = new Map<number, Record<string, unknown>>();
    if (groupNums.length > 0) {
      const groupRows = await this.prisma.articleXIcd10NoncoveredGroup.findMany({
        where: {
          articleId,
          articleVersion,
          icd10NoncoveredGroup: { in: groupNums },
        },
        select: { icd10NoncoveredGroup: true, paragraph: true },
      });
      for (const g of groupRows) {
        groupsMap.set(g.icd10NoncoveredGroup, {
          icd10_noncovered_group: g.icd10NoncoveredGroup,
          paragraph: g.paragraph,
        });
      }
    }

    return this.groupIcd10Rows(codes, 'icd10_noncovered_group', groupsMap);
  }

  private async icd10PcsGrouped(
    articleId: number,
    articleVersion: number,
  ): Promise<Icd10GroupedBucket[]> {
    const pcsAll = await this.prisma.articleXIcd10PcsCode.findMany({
      where: { articleId, articleVersion },
      select: {
        icd10PcsCodeGroup: true,
        icd10PcsCodeId: true,
        description: true,
      },
      orderBy: [{ sortOrder: 'asc' }, { icd10PcsCodeId: 'asc' }],
    });

    const codes = pcsAll.map((r) => ({
      icd10_pcs_code_group: r.icd10PcsCodeGroup,
      icd10_pcs_code_id: r.icd10PcsCodeId,
      description: r.description,
    }));

    const groupNums = [
      ...new Set(
        codes
          .map((c) => c.icd10_pcs_code_group)
          .filter((v): v is number => v !== null),
      ),
    ].sort((a, b) => a - b);

    const groupsMap = new Map<number, Record<string, unknown>>();
    if (groupNums.length > 0) {
      const groupRows = await this.prisma.articleXIcd10PcsCodeGroup.findMany({
        where: {
          articleId,
          articleVersion,
          icd10PcsCodeGroup: { in: groupNums },
        },
        select: { icd10PcsCodeGroup: true, paragraph: true },
      });
      for (const g of groupRows) {
        groupsMap.set(g.icd10PcsCodeGroup, {
          icd10_pcs_code_group: g.icd10PcsCodeGroup,
          paragraph: g.paragraph,
        });
      }
    }

    return this.groupIcd10Rows(codes, 'icd10_pcs_code_group', groupsMap);
  }

  private groupIcd10Rows<
    T extends Record<string, unknown> & { [K in GKey]: number | null },
    GKey extends string,
  >(
    all: T[],
    groupField: GKey,
    groupRowsByNum: Map<number, Record<string, unknown>>,
  ): Icd10GroupedBucket[] {
    const buckets: Icd10GroupedBucket[] = [];
    const groupNums = [
      ...new Set(
        all
          .map((r) => r[groupField] as number | null)
          .filter((v): v is number => v !== null),
      ),
    ].sort((a, b) => a - b);

    for (const grp of groupNums) {
      buckets.push({
        group: grp,
        group_row: groupRowsByNum.get(grp) ?? null,
        codes: all.filter((r) => r[groupField] === grp),
      });
    }

    const ungrouped = all.filter((r) => r[groupField] === null);
    if (ungrouped.length > 0) {
      buckets.push({
        group: null,
        group_row: null,
        codes: ungrouped,
      });
    }

    return buckets;
  }

  private async articleRelatedDocumentsForShow(articleId: number, articleVersion: number) {
    const rows = await this.prisma.articleRelatedDocument.findMany({
      where: { articleId, articleVersion },
      select: {
        rArticleId: true,
        rLcdId: true,
        rLcdVersion: true,
      },
      orderBy: { relatedNum: 'asc' },
    });

    return rows.map((r) => ({
      row: {
        r_article_id: r.rArticleId,
        r_lcd_id: r.rLcdId,
        r_lcd_version: r.rLcdVersion,
      },
      related_article_url:
        r.rArticleId !== null
          ? `/admin/references/articles/by-number/${r.rArticleId}`
          : null,
    }));
  }

  private async articleRelatedNcdDocumentsForShow(articleId: number, articleVersion: number) {
    return this.prisma.articleRelatedNcdDocument.findMany({
      where: { articleId, articleVersion },
      select: {
        rNcdId: true,
        rNcdVersion: true,
      },
      orderBy: { relatedNum: 'asc' },
    }).then((rows) =>
      rows.map((r) => ({
        r_ncd_id: r.rNcdId,
        r_ncd_version: r.rNcdVersion,
      })),
    );
  }

  private async articlePublicVersionsForAssociatedDocuments(articleId: number) {
    return this.prisma.articleXRevisionHistory.findMany({
      where: { articleId },
      select: {
        articleVersion: true,
        revHistDate: true,
        lastUpdated: true,
        updatedAt: true,
      },
      orderBy: { articleVersion: 'desc' },
      take: 5,
    }).then((rows) =>
      rows.map((r) => ({
        article_version: r.articleVersion,
        rev_hist_date: r.revHistDate,
        last_updated: r.lastUpdated,
        updated_at: r.updatedAt,
      })),
    );
  }

  private articleUrlIsMeaningful(url: string | null): boolean {
    if (url === null) {
      return false;
    }
    const t = url.trim().toLowerCase();
    return t !== '' && t !== 'http://' && t !== 'https://';
  }

  private async articleAssociatedUrlsDisplay(articleId: number, articleVersion: number) {
    const rows = await this.prisma.articleXUrl.findMany({
      where: { articleId, articleVersion },
      select: {
        id: true,
        urlTypeId: true,
        sortOrder: true,
        url: true,
        urlName: true,
      },
      orderBy: [{ urlTypeId: 'asc' }, { sortOrder: 'asc' }, { id: 'asc' }],
    });

    const grouped = new Map<number, typeof rows>();
    for (const row of rows) {
      const list = grouped.get(row.urlTypeId) ?? [];
      list.push(row);
      grouped.set(row.urlTypeId, list);
    }

    const out: Record<number, Array<{ href: string; label: string }>> = {};
    for (const typeId of [1, 2, 3, 4] as const) {
      const items = (grouped.get(typeId) ?? [])
        .filter((u) => this.articleUrlIsMeaningful(u.url))
        .map((u) => {
          const href = (u.url ?? '').trim();
          const label =
            u.urlName !== null && u.urlName.trim() !== '' ? u.urlName : href;
          return { href, label };
        });
      out[typeId] = items;
    }
    return out;
  }

  private async articleStickyNotesForArticleId(articleId: number) {
    const rows = await this.prisma.articleXStickyNote.findMany({
      where: {
        articleId,
        stickyNote: { not: null },
        NOT: { stickyNote: '' },
      },
      select: { stickyNote: true },
      orderBy: [
        { articleVersion: 'desc' },
        { stickyNoteDt: 'desc' },
        { stickyNotePostingDt: 'desc' },
        { id: 'desc' },
      ],
    });
    return rows.map((r) => ({ sticky_note: r.stickyNote }));
  }

  private async articleResponseToCommentsForArticleId(articleId: number) {
    return this.prisma.articleXResponseToComment.findMany({
      where: { articleId },
      select: { rtcNum: true, comment: true, response: true },
      orderBy: [{ articleVersion: 'desc' }, { rtcNum: 'asc' }],
    }).then((rows) =>
      rows.map((r) => ({
        rtc_num: r.rtcNum,
        comment: r.comment,
        response: r.response,
      })),
    );
  }
}

/** Parse Laravel-compatible `?ver=` query (positive integer or omitted). */
export function parseRequestedArticleVersion(verRaw: string | undefined): number | null {
  if (verRaw === undefined || verRaw.trim() === '') {
    return null;
  }
  if (!/^\d+$/.test(verRaw.trim())) {
    return null;
  }
  const n = Number(verRaw);
  return Number.isInteger(n) && n > 0 ? n : null;
}
