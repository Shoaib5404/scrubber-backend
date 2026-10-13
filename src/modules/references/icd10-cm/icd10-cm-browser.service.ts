import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { DescriptionType } from '../../imports/icd10-tabular/icd10-tabular.types';

const DEFAULT_TYPE = DescriptionType.Default;

type DescRow = { description: string; description_type: number };

@Injectable()
export class Icd10CmBrowserService {
  constructor(private readonly prisma: PrismaService) {}

  async listChapters() {
    const rows = await this.prisma.$queryRaw<Array<{ code: string; description: string | null }>>`
      SELECT c.code, d.description
      FROM icd10_tabular_codes AS c
      INNER JOIN icd10_tabular_code_descriptions AS d
        ON d.icd10_tabular_code_id = c.id AND d.description_type = ${DEFAULT_TYPE}
      WHERE c.is_chapter = true
      ORDER BY c.id
    `;
    return {
      items: rows.map((r) => ({ code: r.code, description: r.description ?? null })),
    };
  }

  async getChapter(chapterCode: string) {
    const chapter = await this.prisma.icd10TabularCode.findFirst({
      where: { code: chapterCode, isChapter: true },
      select: { id: true, code: true },
    });
    if (!chapter) throw new NotFoundException('ICD-10-CM chapter not found.');

    const notes = await this.notesByType(chapter.id);
    const sections = await this.prisma.$queryRaw<
      Array<{ code: string; description: string | null }>
    >`
      SELECT c.code, d.description
      FROM icd10_tabular_codes AS c
      INNER JOIN icd10_tabular_code_descriptions AS d
        ON d.icd10_tabular_code_id = c.id AND d.description_type = ${DEFAULT_TYPE}
      WHERE c.is_section = true AND c.parent_id = ${chapter.id}
      ORDER BY c.id
    `;

    return {
      chapter_code: chapter.code,
      chapter_description: notes.main_description,
      ...notes.named,
      sections: sections.map((s) => ({
        code: s.code,
        description: s.description ?? null,
      })),
    };
  }

  async getSection(chapterCode: string, sectionCode: string) {
    const resolved = await this.resolveChapterSection(chapterCode, sectionCode);
    if (!resolved) throw new NotFoundException('ICD-10-CM section not found.');

    const notes = await this.notesByType(resolved.sectionId);
    const childCodes = await this.prisma.$queryRaw<
      Array<{ code: string; description: string | null; is_billable: number | boolean }>
    >`
      SELECT c.code, d.description, c.is_billable
      FROM icd10_tabular_codes AS c
      INNER JOIN icd10_tabular_code_descriptions AS d
        ON d.icd10_tabular_code_id = c.id AND d.description_type = ${DEFAULT_TYPE}
      WHERE c.parent_id = ${resolved.sectionId}
      ORDER BY c.id
    `;

    const siblings = await this.prisma.icd10TabularCode.findMany({
      where: { parentId: resolved.chapterId, isSection: true },
      orderBy: { id: 'asc' },
      select: { code: true },
    });
    const idx = siblings.findIndex((s) => s.code === sectionCode);

    return {
      chapter_code: chapterCode,
      section_code: sectionCode,
      section_title: notes.main_description ?? sectionCode,
      child_codes: childCodes.map((c) => ({
        code: c.code,
        description: c.description ?? null,
        is_billable: Boolean(c.is_billable),
      })),
      prev_section_code: idx > 0 ? siblings[idx - 1].code : null,
      next_section_code: idx >= 0 && idx < siblings.length - 1 ? siblings[idx + 1].code : null,
      ...notes.named,
    };
  }

  async getCode(chapterCode: string, sectionCode: string, icdCode: string) {
    const resolved = await this.resolveChapterSection(chapterCode, sectionCode, true);
    if (!resolved) throw new NotFoundException('ICD-10-CM section not found.');

    const row = await this.prisma.icd10TabularCode.findFirst({
      where: { code: icdCode, isSection: false },
      orderBy: { id: 'asc' },
      select: {
        id: true,
        code: true,
        parentId: true,
        isBillable: true,
        effectiveStartDate: true,
      },
    });
    if (!row || !(await this.rowHasAncestor(row.id, resolved.sectionId))) {
      throw new NotFoundException('ICD-10-CM code not found in this section.');
    }

    const notes = await this.notesByType(row.id);
    const children = await this.prisma.$queryRaw<
      Array<{ code: string; description: string | null; is_billable: number | boolean }>
    >`
      SELECT c.code, d.description, c.is_billable
      FROM icd10_tabular_codes AS c
      INNER JOIN icd10_tabular_code_descriptions AS d
        ON d.icd10_tabular_code_id = c.id AND d.description_type = ${DEFAULT_TYPE}
      WHERE c.parent_id = ${row.id} AND c.is_section = false
      ORDER BY c.code
    `;

    let parentNav: { code: string; path: string } | null = null;
    if (row.parentId != null) {
      const parent = await this.prisma.icd10TabularCode.findUnique({
        where: { id: row.parentId },
        select: { id: true, code: true, isSection: true },
      });
      if (parent) {
        if (parent.isSection && parent.id === resolved.sectionId) {
          parentNav = {
            code: parent.code,
            path: `/icd10-cm/${encodeURIComponent(chapterCode)}/${encodeURIComponent(sectionCode)}`,
          };
        } else if (
          !parent.isSection &&
          (await this.rowHasAncestor(parent.id, resolved.sectionId))
        ) {
          parentNav = {
            code: parent.code,
            path: `/icd10-cm/${encodeURIComponent(chapterCode)}/${encodeURIComponent(sectionCode)}/${encodeURIComponent(parent.code)}`,
          };
        }
      }
    }

    return {
      chapter_code: chapterCode,
      section_code: sectionCode,
      section_title: resolved.sectionDefaultDescription ?? sectionCode,
      code: row.code,
      is_billable: row.isBillable,
      effective_start_date: row.effectiveStartDate
        ? row.effectiveStartDate.toISOString().slice(0, 10)
        : null,
      main_description: notes.main_description,
      description_groups: notes.groups,
      clinical_bullets: notes.clinical_bullets,
      sub_codes: children.map((c) => ({
        code: c.code,
        description: c.description ?? null,
        is_billable: Boolean(c.is_billable),
        path: `/icd10-cm/${encodeURIComponent(chapterCode)}/${encodeURIComponent(sectionCode)}/${encodeURIComponent(row.code)}/${encodeURIComponent(c.code)}`,
      })),
      parent_nav: parentNav,
      ...notes.named,
    };
  }

  async getChildCode(
    chapterCode: string,
    sectionCode: string,
    parentCode: string,
    childCode: string,
  ) {
    // Ensure parent is in section, then load child under that parent.
    await this.getCode(chapterCode, sectionCode, parentCode);
    const parent = await this.prisma.icd10TabularCode.findFirst({
      where: { code: parentCode, isSection: false },
      orderBy: { id: 'asc' },
      select: { id: true },
    });
    if (!parent) throw new NotFoundException('Parent ICD code not found.');

    const child = await this.prisma.icd10TabularCode.findFirst({
      where: { code: childCode, parentId: parent.id, isSection: false },
      select: {
        id: true,
        code: true,
        parentId: true,
        isBillable: true,
        effectiveStartDate: true,
      },
    });
    if (!child) throw new NotFoundException('Child ICD code not found.');

    const notes = await this.notesByType(child.id);
    const children = await this.prisma.$queryRaw<
      Array<{ code: string; description: string | null; is_billable: number | boolean }>
    >`
      SELECT c.code, d.description, c.is_billable
      FROM icd10_tabular_codes AS c
      INNER JOIN icd10_tabular_code_descriptions AS d
        ON d.icd10_tabular_code_id = c.id AND d.description_type = ${DEFAULT_TYPE}
      WHERE c.parent_id = ${child.id} AND c.is_section = false
      ORDER BY c.code
    `;

    return {
      chapter_code: chapterCode,
      section_code: sectionCode,
      parent_code: parentCode,
      code: child.code,
      is_billable: child.isBillable,
      effective_start_date: child.effectiveStartDate
        ? child.effectiveStartDate.toISOString().slice(0, 10)
        : null,
      main_description: notes.main_description,
      description_groups: notes.groups,
      clinical_bullets: notes.clinical_bullets,
      sub_codes: children.map((c) => ({
        code: c.code,
        description: c.description ?? null,
        is_billable: Boolean(c.is_billable),
        path: `/icd10-cm/${encodeURIComponent(chapterCode)}/${encodeURIComponent(sectionCode)}/${encodeURIComponent(child.code)}/${encodeURIComponent(c.code)}`,
      })),
      parent_nav: {
        code: parentCode,
        path: `/icd10-cm/${encodeURIComponent(chapterCode)}/${encodeURIComponent(sectionCode)}/${encodeURIComponent(parentCode)}`,
      },
      ...notes.named,
    };
  }

  private async resolveChapterSection(
    chapterCode: string,
    sectionCode: string,
    withDefaultDesc = false,
  ): Promise<{
    sectionId: number;
    chapterId: number;
    sectionDefaultDescription: string | null;
  } | null> {
    if (withDefaultDesc) {
      const rows = await this.prisma.$queryRaw<
        Array<{
          section_id: number;
          chapter_id: number;
          section_default_description: string | null;
        }>
      >`
        SELECT
          section.id AS section_id,
          chapter.id AS chapter_id,
          (
            SELECT d.description
            FROM icd10_tabular_code_descriptions AS d
            WHERE d.icd10_tabular_code_id = section.id
              AND d.description_type = ${DEFAULT_TYPE}
            ORDER BY d.id
            LIMIT 1
          ) AS section_default_description
        FROM icd10_tabular_codes AS section
        INNER JOIN icd10_tabular_codes AS chapter ON section.parent_id = chapter.id
        WHERE chapter.code = ${chapterCode}
          AND chapter.is_chapter = true
          AND section.code = ${sectionCode}
          AND section.is_section = true
        LIMIT 1
      `;
      const row = rows[0];
      if (!row) return null;
      return {
        sectionId: Number(row.section_id),
        chapterId: Number(row.chapter_id),
        sectionDefaultDescription: row.section_default_description,
      };
    }

    const rows = await this.prisma.$queryRaw<
      Array<{ section_id: number; chapter_id: number }>
    >`
      SELECT section.id AS section_id, chapter.id AS chapter_id
      FROM icd10_tabular_codes AS section
      INNER JOIN icd10_tabular_codes AS chapter ON section.parent_id = chapter.id
      WHERE chapter.code = ${chapterCode}
        AND chapter.is_chapter = true
        AND section.code = ${sectionCode}
        AND section.is_section = true
      LIMIT 1
    `;
    const row = rows[0];
    if (!row) return null;
    return {
      sectionId: Number(row.section_id),
      chapterId: Number(row.chapter_id),
      sectionDefaultDescription: null,
    };
  }

  private async rowHasAncestor(tabularRowId: number, ancestorId: number): Promise<boolean> {
    if (tabularRowId === ancestorId) return true;
    const rows = await this.prisma.$queryRaw<Array<{ ok: number }>>`
      WITH RECURSIVE ancestors AS (
        SELECT id, parent_id FROM icd10_tabular_codes WHERE id = ${tabularRowId}
        UNION ALL
        SELECT t.id, t.parent_id
        FROM icd10_tabular_codes AS t
        INNER JOIN ancestors AS a ON t.id = a.parent_id
      )
      SELECT 1 AS ok FROM ancestors WHERE id = ${ancestorId} LIMIT 1
    `;
    return rows.length > 0;
  }

  private async notesByType(tabularCodeId: number) {
    const rows = await this.prisma.$queryRaw<DescRow[]>`
      SELECT description, description_type
      FROM icd10_tabular_code_descriptions
      WHERE icd10_tabular_code_id = ${tabularCodeId}
      ORDER BY id
    `;

    const byType = new Map<number, string[]>();
    for (const row of rows) {
      const type = Number(row.description_type);
      const list = byType.get(type) ?? [];
      list.push(row.description);
      byType.set(type, list);
    }

    const pick = (type: number) => byType.get(type) ?? [];
    const defaultLines = pick(DescriptionType.Default);
    const mainDescription =
      defaultLines.length === 0 ? null : defaultLines.join('\n\n');

    const inclusionTerms = pick(DescriptionType.InclusionTerm)
      .map((s) => s.trim())
      .filter(Boolean);
    let clinicalBullets = inclusionTerms;
    if (clinicalBullets.length === 0 && mainDescription) {
      clinicalBullets = mainDescription
        .split(/\r\n|\r|\n/)
        .map((s) => s.trim())
        .filter(Boolean);
    }

    const typeLabels: Record<number, string> = {
      [DescriptionType.IncludeNote]: 'Includes',
      [DescriptionType.AdditionalCodeNote]: 'Use Additional Code',
      [DescriptionType.Exclude1Note]: 'Excludes1',
      [DescriptionType.Exclude2Note]: 'Excludes2',
      [DescriptionType.InclusionTerm]: 'Inclusion Terms',
      [DescriptionType.ShortDescription]: 'Short Description',
      [DescriptionType.CodeAlsoNote]: 'Code Also',
      [DescriptionType.Notes]: 'Notes',
      [DescriptionType.CodeFirstNote]: 'Code First',
    };

    const groups = [...byType.entries()]
      .filter(([type]) => type !== DescriptionType.Default)
      .map(([type, lines]) => ({
        type,
        type_label: typeLabels[type] ?? `Type ${type}`,
        lines,
      }));

    return {
      main_description: mainDescription,
      clinical_bullets: clinicalBullets,
      groups,
      named: {
        include_notes: pick(DescriptionType.IncludeNote),
        notes: pick(DescriptionType.Notes),
        code_first_notes: pick(DescriptionType.CodeFirstNote),
        additional_code_notes: pick(DescriptionType.AdditionalCodeNote),
        exclude1_notes: pick(DescriptionType.Exclude1Note),
        exclude2_notes: pick(DescriptionType.Exclude2Note),
        inclusion_terms: pick(DescriptionType.InclusionTerm),
        code_also_notes: pick(DescriptionType.CodeAlsoNote),
        short_descriptions: pick(DescriptionType.ShortDescription),
      },
    };
  }
}
