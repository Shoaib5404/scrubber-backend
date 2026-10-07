import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { normalizeProcedureCode } from '../coding-reference/coding-reference.service';

export const CPT_TAB_KEYS = [
  'age-specific',
  'gender-specific',
  'pos',
  'modifiers',
  'ncci',
  'add-on',
  'mue',
  'ncd-other',
  'anesthesia',
  'anesthesia-modifiers',
  'i-codes',
  'major-surgery-codes',
  'initial-treatment-codes',
] as const;

export type CptTabKey = (typeof CPT_TAB_KEYS)[number];

const TAB_PER_PAGE_DEFAULT = 25;
const TAB_PER_PAGE_MAX = 100;

const NCCI_MODIFIER_LABELS: Record<number, string> = {
  0: 'Not allowed',
  1: 'Allowed',
  9: 'Not applicable',
};

type TabColumn = { key: string; label: string; highlight?: boolean };

@Injectable()
export class CptDetailsService {
  constructor(private readonly prisma: PrismaService) {}

  normalizeCode(code: string | null | undefined): string | null {
    return normalizeProcedureCode(code);
  }

  async findCpt(code: string) {
    return this.prisma.cptCode.findFirst({ where: { name: code } });
  }

  summary(cpt: {
    id: number;
    name: string;
    description: string | null;
    isActive: boolean;
    effectiveDate: Date | null;
  }) {
    return {
      id: cpt.id,
      code: cpt.name,
      description: cpt.description,
      short_description: cpt.description,
      long_description: cpt.description,
      category: null,
      status: cpt.isActive ? 'Active' : 'Inactive',
      is_active: cpt.isActive,
      effective_date: cpt.effectiveDate ? cpt.effectiveDate.toISOString().slice(0, 10) : null,
      effective_date_formatted: cpt.effectiveDate
        ? cpt.effectiveDate.toLocaleDateString('en-US', {
            month: 'long',
            day: 'numeric',
            year: 'numeric',
          })
        : null,
    };
  }

  async tabPayload(
    tab: CptTabKey,
    code: string,
    page = 1,
    perPage = TAB_PER_PAGE_DEFAULT,
    filters: {
      ncciModifier?: number | null;
      ncdIcdCode?: string | null;
      cptModifierCode?: string | null;
    } = {},
  ) {
    const [p, pp] = this.normalizePagination(page, perPage);
    switch (tab) {
      case 'age-specific':
        return this.ageSpecific(code, p, pp);
      case 'gender-specific':
        return this.genderSpecific(code, p, pp);
      case 'pos':
        return this.pos(code, p, pp);
      case 'modifiers':
        return this.modifiers(code, p, pp, filters.cptModifierCode);
      case 'ncci':
        return this.ncci(code, p, pp, filters.ncciModifier);
      case 'add-on':
        return this.addOn(code, p, pp);
      case 'mue':
        return this.mue(code, p, pp);
      case 'ncd-other':
        return this.ncdOther(code, p, pp, filters.ncdIcdCode);
      case 'anesthesia':
        return this.anesthesia(code, p, pp);
      case 'anesthesia-modifiers':
        return this.anesthesiaModifiers(code, p, pp);
      case 'i-codes':
        return this.iCodes(code, p, pp);
      case 'major-surgery-codes':
        return this.majorSurgeryCodes(code, p, pp);
      case 'initial-treatment-codes':
        return this.initialTreatmentCodes(code, p, pp);
      default: {
        const _never: never = tab;
        return _never;
      }
    }
  }

  private normalizePagination(page: number, perPage: number): [number, number] {
    return [Math.max(page, 1), Math.min(Math.max(perPage, 1), TAB_PER_PAGE_MAX)];
  }

  private paginationMeta(total: number, page: number, perPage: number) {
    const lastPage = Math.max(1, Math.ceil(total / perPage) || 1);
    const from = total === 0 ? null : (page - 1) * perPage + 1;
    const to = total === 0 ? null : Math.min(page * perPage, total);
    return { current_page: page, last_page: lastPage, per_page: perPage, total, from, to };
  }

  private col(key: string, label: string, highlight = false): TabColumn {
    return highlight ? { key, label, highlight: true } : { key, label };
  }

  private empty(columns: TabColumn[], page: number, perPage: number, message?: string) {
    return {
      columns,
      rows: [] as Record<string, unknown>[],
      pagination: this.paginationMeta(0, page, perPage),
      ...(message ? { message } : {}),
    };
  }

  private async pageQuery<T>(
    total: number,
    page: number,
    perPage: number,
    columns: TabColumn[],
    rows: T[],
  ) {
    return {
      columns,
      rows,
      pagination: this.paginationMeta(total, page, perPage),
    };
  }

  private async ageSpecific(code: string, page: number, perPage: number) {
    const where = { cptCode: code, isActive: true };
    const [total, rows] = await Promise.all([
      this.prisma.ageSpecificCptRule.count({ where }),
      this.prisma.ageSpecificCptRule.findMany({
        where,
        orderBy: { id: 'asc' },
        skip: (page - 1) * perPage,
        take: perPage,
      }),
    ]);
    return this.pageQuery(total, page, perPage, [
      { key: 'min_age', label: 'Min Age' },
      { key: 'max_age', label: 'Max Age' },
      { key: 'unit', label: 'Unit' },
      { key: 'gender', label: 'Gender' },
      { key: 'rule', label: 'Rule' },
      { key: 'notes', label: 'Notes' },
    ], rows.map((r) => ({
      min_age: r.lowLimit,
      max_age: r.highLimit,
      unit: r.unit,
      gender: r.gender,
      rule: `${r.lowLimit ?? ''}–${r.highLimit ?? ''} ${r.unit}`,
      notes: r.notes,
    })));
  }

  private async genderSpecific(code: string, page: number, perPage: number) {
    const where = { cptCode: code, isActive: true };
    const [total, rows] = await Promise.all([
      this.prisma.genderSpecificCptRule.count({ where }),
      this.prisma.genderSpecificCptRule.findMany({
        where,
        orderBy: { id: 'asc' },
        skip: (page - 1) * perPage,
        take: perPage,
      }),
    ]);
    return this.pageQuery(total, page, perPage, [
      { key: 'gender', label: 'Gender' },
      { key: 'description', label: 'Description' },
      { key: 'notes', label: 'Notes' },
    ], rows.map((r) => ({
      gender: r.gender,
      description: r.description,
      notes: r.notes ?? null,
    })));
  }

  private async pos(code: string, page: number, perPage: number) {
    const where = { cptCode: code, isDeleted: false };
    const [total, rows] = await Promise.all([
      this.prisma.cptPosRule.count({ where }),
      this.prisma.cptPosRule.findMany({
        where,
        orderBy: { posCode: 'asc' },
        skip: (page - 1) * perPage,
        take: perPage,
      }),
    ]);
    return this.pageQuery(total, page, perPage, [
      this.col('pos_code', 'POS Code', true),
      this.col('payer_id', 'Payer'),
    ], rows.map((r) => ({ pos_code: r.posCode, payer_id: r.payerId ?? '-' })));
  }

  private async modifiers(
    code: string,
    page: number,
    perPage: number,
    modifierCode?: string | null,
  ) {
    const where: Prisma.CptModifierRuleWhereInput = { cptCode: code, isActive: true };
    const mod = String(modifierCode ?? '').trim();
    if (mod) where.modifierCode = { contains: mod, mode: 'insensitive' };

    const [total, rows] = await Promise.all([
      this.prisma.cptModifierRule.count({ where }),
      this.prisma.cptModifierRule.findMany({
        where,
        orderBy: { modifierCode: 'asc' },
        skip: (page - 1) * perPage,
        take: perPage,
      }),
    ]);
    return this.pageQuery(total, page, perPage, [
      this.col('modifier', 'Modifier', true),
      { key: 'description', label: 'Description' },
      { key: 'allowed', label: 'Allowed' },
      { key: 'payer_id', label: 'Payer' },
      { key: 'notes', label: 'Notes' },
    ], rows.map((r) => ({
      modifier: r.modifierCode,
      description: r.description,
      allowed: r.isAllowed ? 'Yes' : 'No',
      payer_id: r.payerId ?? 'All',
      notes: r.notes,
    })));
  }

  private async ncci(
    code: string,
    page: number,
    perPage: number,
    modifier?: number | null,
  ) {
    const where: Prisma.NcciWhereInput = {
      isActive: true,
      OR: [{ column1: code }, { column2: code }],
    };
    if (modifier != null) where.modifier = modifier;

    const [total, rows] = await Promise.all([
      this.prisma.ncci.count({ where }),
      this.prisma.ncci.findMany({
        where,
        orderBy: [{ column1: 'asc' }, { column2: 'asc' }],
        skip: (page - 1) * perPage,
        take: perPage,
      }),
    ]);
    return this.pageQuery(total, page, perPage, [
      this.col('column_1', 'Primary CPT', true),
      { key: 'column_2', label: 'SECONDARY CPT' },
      { key: 'modifier_allowed', label: 'Modifier Allowed' },
      { key: 'effective_date', label: 'Effective Date' },
      { key: 'deletion_date', label: 'Deletion Date' },
      { key: 'rationale', label: 'Rationale' },
    ], rows.map((r) => ({
      column_1: r.column1,
      column_2: r.column2,
      modifier_allowed: NCCI_MODIFIER_LABELS[r.modifier] ?? String(r.modifier),
      effective_date: r.effectiveDate?.toISOString().slice(0, 10) ?? null,
      deletion_date: r.deletionDate?.toISOString().slice(0, 10) ?? null,
      rationale: r.ptpEditRationale,
    })));
  }

  private async addOn(code: string, page: number, perPage: number) {
    const where: Prisma.AddOnCodeWhereInput = {
      OR: [{ primaryCode: code }, { addOnCode: code }],
    };
    const [total, rows] = await Promise.all([
      this.prisma.addOnCode.count({ where }),
      this.prisma.addOnCode.findMany({
        where,
        orderBy: [{ primaryCode: 'asc' }, { addOnCode: 'asc' }],
        skip: (page - 1) * perPage,
        take: perPage,
      }),
    ]);
    return this.pageQuery(total, page, perPage, [
      this.col('primary_code', 'Primary CPT', true),
      { key: 'add_on_code', label: 'Add-On CPT' },
      { key: 'edit_type', label: 'Edit Type' },
      { key: 'effective_date', label: 'Effective Date' },
      { key: 'notes', label: 'Notes' },
    ], rows.map((r) => ({
      primary_code: r.primaryCode,
      add_on_code: r.addOnCode,
      edit_type: r.aocEditType == null ? '—' : String(r.aocEditType),
      effective_date: r.aocEditEffdt?.toISOString().slice(0, 10) ?? null,
      notes: r.specialInstructionNotes,
    })));
  }

  private async mue(code: string, page: number, perPage: number) {
    const where = { cptCode: code };
    const [total, rows] = await Promise.all([
      this.prisma.muePractitioner.count({ where }),
      this.prisma.muePractitioner.findMany({
        where,
        orderBy: { id: 'asc' },
        skip: (page - 1) * perPage,
        take: perPage,
      }),
    ]);
    return this.pageQuery(total, page, perPage, [
      this.col('lower_limit', 'Lower Limit', true),
      this.col('upper_limit', 'Upper Limit', true),
      { key: 'adjudication_indicator', label: 'Adjudication Indicator' },
      { key: 'effective_date', label: 'Effective Date' },
    ], rows.map((r) => ({
      lower_limit: r.lowerLimit,
      upper_limit: r.upperLimit,
      adjudication_indicator: r.indicator,
      effective_date: r.effectiveDate?.toISOString().slice(0, 10) ?? null,
    })));
  }

  private async ncdOther(
    code: string,
    page: number,
    perPage: number,
    icdCode?: string | null,
  ) {
    const columns = [
      this.col('icd_code', 'ICD Code', true),
      { key: 'effective_date', label: 'Effective Date' },
      { key: 'terminate_date', label: 'Terminate Date' },
      { key: 'resolution_code', label: 'Resolution Code' },
    ];
    const ncd = await this.prisma.ncdCpt.findFirst({
      where: { cptCode: code },
      orderBy: { id: 'asc' },
      select: { id: true },
    });
    if (!ncd) {
      return {
        ...this.empty(columns, page, perPage, 'No NCD ICD-10 records found for this CPT code.'),
        ncd_icd_searchable: false,
      };
    }

    const icd = String(icdCode ?? '').trim();
    const where: Prisma.NcdIcdWhereInput = { ncdCptId: ncd.id };
    if (icd) where.icdCode = { contains: icd, mode: 'insensitive' };

    const [total, rows] = await Promise.all([
      this.prisma.ncdIcd.count({ where }),
      this.prisma.ncdIcd.findMany({
        where,
        orderBy: [{ icdCode: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * perPage,
        take: perPage,
      }),
    ]);

    return {
      ...(await this.pageQuery(total, page, perPage, columns, rows.map((r) => ({
        icd_code: r.icdCode,
        effective_date: r.effectiveDate?.toISOString().slice(0, 10) ?? '—',
        terminate_date: r.terminateDate?.toISOString().slice(0, 10) ?? '—',
        resolution_code: String(r.resolutionCode),
      })))),
      ncd_icd_searchable: true,
    };
  }

  private async anesthesia(code: string, page: number, perPage: number) {
    const where = { cptCode: code, active: true };
    const [total, rows] = await Promise.all([
      this.prisma.anesthesiaCode.count({ where }),
      this.prisma.anesthesiaCode.findMany({
        where,
        orderBy: { id: 'asc' },
        skip: (page - 1) * perPage,
        take: perPage,
      }),
    ]);
    return this.pageQuery(total, page, perPage, [
      this.col('cpt_code', 'CPT Code', true),
      { key: 'unit', label: 'Unit (Minutes)' },
    ], rows.map((r) => ({ cpt_code: r.cptCode, unit: r.unit })));
  }

  private async anesthesiaModifiers(code: string, page: number, perPage: number) {
    const where = { code, active: true };
    const [total, rows] = await Promise.all([
      this.prisma.anesthesiaCodeWithBillableModifier.count({ where }),
      this.prisma.anesthesiaCodeWithBillableModifier.findMany({
        where,
        orderBy: { modifier: 'asc' },
        skip: (page - 1) * perPage,
        take: perPage,
      }),
    ]);
    return this.pageQuery(total, page, perPage, [
      this.col('code', 'CPT Code', true),
      { key: 'modifier', label: 'Modifier' },
    ], rows.map((r) => ({ code: r.code, modifier: r.modifier })));
  }

  private async iCodes(code: string, page: number, perPage: number) {
    const where = { hcpcs: code, active: true };
    const [total, rows] = await Promise.all([
      this.prisma.iCode.count({ where }),
      this.prisma.iCode.findMany({
        where,
        orderBy: { id: 'asc' },
        skip: (page - 1) * perPage,
        take: perPage,
      }),
    ]);
    return this.pageQuery(total, page, perPage, [
      this.col('hcpcs', 'HCPCS', true),
      { key: 'description', label: 'Description' },
      { key: 'status', label: 'Status' },
    ], rows.map((r) => ({
      hcpcs: r.hcpcs,
      description: r.description ?? '—',
      status: 'Active',
    })));
  }

  private async majorSurgeryCodes(code: string, page: number, perPage: number) {
    const where = { code, active: true };
    const [total, rows] = await Promise.all([
      this.prisma.majorSurgeryCode.count({ where }),
      this.prisma.majorSurgeryCode.findMany({
        where,
        orderBy: { id: 'asc' },
        skip: (page - 1) * perPage,
        take: perPage,
      }),
    ]);
    return this.pageQuery(total, page, perPage, [
      this.col('code', 'Code', true),
      { key: 'status', label: 'Status' },
    ], rows.map((r) => ({ code: r.code, status: 'Active' })));
  }

  private async initialTreatmentCodes(code: string, page: number, perPage: number) {
    const where = { code, active: true };
    const [total, rows] = await Promise.all([
      this.prisma.initialTreatmentCode.count({ where }),
      this.prisma.initialTreatmentCode.findMany({
        where,
        orderBy: { id: 'asc' },
        skip: (page - 1) * perPage,
        take: perPage,
      }),
    ]);
    return this.pageQuery(total, page, perPage, [
      this.col('code', 'Code', true),
      { key: 'status', label: 'Status' },
    ], rows.map((r) => ({ code: r.code, status: 'Active' })));
  }
}

export function assertCptFound<T>(row: T | null): T {
  if (!row) throw new NotFoundException('No CPT code found.');
  return row;
}
