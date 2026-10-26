import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { validateNpiLuhn } from '../../claim-validation/support/npi.validator';

export type CodingRefItem = { code: string; description: string | null };

/** CMS Order & Referring NPI reference item (active registry row). */
export type NpiRefItem = {
  code: string;
  description: string | null;
  firstName: string | null;
  lastName: string | null;
  active: boolean;
  formatValid: boolean;
};

export type NpiValidateItem = {
  code: string;
  valid: boolean;
  formatValid: boolean;
  description: string | null;
  firstName: string | null;
  lastName: string | null;
  active: boolean | null;
};

/** Laravel DescriptionType::Default */
const ICD10_DEFAULT_DESCRIPTION_TYPE = 1;

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 25;
const MIN_DESCRIPTION_QUERY_LENGTH = 3;
const MIN_NPI_NAME_QUERY_LENGTH = 3;

@Injectable()
export class CodingReferenceService {
  constructor(private readonly prisma: PrismaService) {}

  sanitizeQuery(query: string): string {
    return query.trim().toUpperCase().replace(/[%_]/g, '');
  }

  compactIcd10(code: string): string {
    return this.sanitizeQuery(code).replace(/[.\s]/g, '');
  }

  resolveLimit(limit?: number | null): number {
    if (limit == null || limit < 1) return DEFAULT_LIMIT;
    return Math.min(limit, MAX_LIMIT);
  }

  async searchIcd10(query: string, limit: number): Promise<CodingRefItem[]> {
    const raw = this.sanitizeQuery(query);
    const compact = this.compactIcd10(raw);
    if (!raw || !compact) return [];

    const descClause =
      compact.length >= MIN_DESCRIPTION_QUERY_LENGTH
        ? Prisma.sql`OR d.description ILIKE ${'%' + raw + '%'}`
        : Prisma.empty;

    const rows = await this.prisma.$queryRaw<Array<{ code: string; description: string | null }>>`
      SELECT c.code, d.description
      FROM icd10_tabular_codes c
      INNER JOIN icd10_tabular_code_descriptions d
        ON d.icd10_tabular_code_id = c.id
       AND d.description_type = ${ICD10_DEFAULT_DESCRIPTION_TYPE}
      WHERE c.is_section = false
        AND c.is_billable = true
        AND (
          c.code ILIKE ${raw + '%'}
          OR REPLACE(c.code, '.', '') ILIKE ${compact + '%'}
          ${descClause}
        )
      ORDER BY c.code
      LIMIT ${limit}
    `;

    return rows.map((r) => ({
      code: String(r.code),
      description: r.description != null ? String(r.description) : null,
    }));
  }

  async findIcd10(code: string): Promise<CodingRefItem | null> {
    const raw = this.sanitizeQuery(code);
    const compact = this.compactIcd10(raw);
    if (!compact) return null;

    const rows = await this.prisma.$queryRaw<Array<{ code: string; description: string | null }>>`
      SELECT c.code, d.description
      FROM icd10_tabular_codes c
      INNER JOIN icd10_tabular_code_descriptions d
        ON d.icd10_tabular_code_id = c.id
       AND d.description_type = ${ICD10_DEFAULT_DESCRIPTION_TYPE}
      WHERE c.is_section = false
        AND c.is_billable = true
        AND (c.code = ${raw} OR REPLACE(c.code, '.', '') = ${compact})
      LIMIT 1
    `;

    const row = rows[0];
    if (!row) return null;
    return {
      code: String(row.code),
      description: row.description != null ? String(row.description) : null,
    };
  }

  async searchCpt(query: string, limit: number): Promise<CodingRefItem[]> {
    const raw = this.sanitizeQuery(query);
    if (!raw) return [];

    const rows = await this.prisma.cptCode.findMany({
      where: { isActive: true, name: { startsWith: raw, mode: 'insensitive' } },
      orderBy: { name: 'asc' },
      take: limit,
      select: { name: true, description: true },
    });

    return rows.map((r) => ({ code: r.name, description: r.description }));
  }

  async findCpt(code: string): Promise<CodingRefItem | null> {
    const normalized = normalizeProcedureCode(code) ?? this.sanitizeQuery(code);
    if (!normalized) return null;

    const row = await this.prisma.cptCode.findFirst({
      where: { isActive: true, name: normalized },
      select: { name: true, description: true },
    });
    if (!row) return null;
    return { code: row.name, description: row.description };
  }

  async searchModifiers(query: string, limit: number): Promise<CodingRefItem[]> {
    const raw = this.sanitizeQuery(query);
    if (!raw) return [];

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const rows = await this.prisma.modifier.findMany({
      where: {
        modifier: { startsWith: raw, mode: 'insensitive' },
        OR: [{ termDt: null }, { termDt: { gte: today } }],
      },
      orderBy: { modifier: 'asc' },
      take: limit,
      select: { modifier: true, shortDescription: true },
    });

    return rows.map((r) => ({ code: r.modifier, description: r.shortDescription }));
  }

  async findModifier(code: string): Promise<CodingRefItem | null> {
    const raw = this.sanitizeQuery(code);
    if (!raw) return null;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const row = await this.prisma.modifier.findFirst({
      where: {
        modifier: raw,
        OR: [{ termDt: null }, { termDt: { gte: today } }],
      },
      select: { modifier: true, shortDescription: true },
    });
    if (!row) return null;
    return { code: row.modifier, description: row.shortDescription };
  }

  /**
   * Lookup active CMS Order & Referring NPI.
   * `valid` for batch means found here — not full NPPES.
   */
  async findNpi(npi: string): Promise<NpiRefItem | null> {
    const normalized = normalizeNpi(npi);
    if (!normalized) return null;

    const row = await this.prisma.npiOrderingReferring.findFirst({
      where: { npi: normalized, active: true },
      select: { npi: true, firstName: true, lastName: true, active: true },
    });
    if (!row) return null;

    return mapNpiRow(row.npi, row.firstName, row.lastName, row.active);
  }

  /**
   * Search active Order & Referring NPIs by NPI prefix (digits) or last-name prefix (len ≥ 3).
   */
  async searchNpis(query: string, limit: number): Promise<NpiRefItem[]> {
    const raw = String(query ?? '').trim();
    if (!raw) return [];

    const digits = normalizeNpi(raw);
    const isNumericQuery = /^\d+$/.test(raw.replace(/[\s-]/g, ''));

    if (isNumericQuery && digits) {
      const rows = await this.prisma.npiOrderingReferring.findMany({
        where: { active: true, npi: { startsWith: digits } },
        orderBy: { npi: 'asc' },
        take: limit,
        select: { npi: true, firstName: true, lastName: true, active: true },
      });
      return rows.map((r) => mapNpiRow(r.npi, r.firstName, r.lastName, r.active));
    }

    const nameQ = this.sanitizeQuery(raw);
    if (nameQ.length < MIN_NPI_NAME_QUERY_LENGTH) return [];

    const rows = await this.prisma.npiOrderingReferring.findMany({
      where: { active: true, lastName: { startsWith: nameQ, mode: 'insensitive' } },
      orderBy: [{ lastName: 'asc' }, { npi: 'asc' }],
      take: limit,
      select: { npi: true, firstName: true, lastName: true, active: true },
    });
    return rows.map((r) => mapNpiRow(r.npi, r.firstName, r.lastName, r.active));
  }

  async validateBatch(payload: {
    icd10?: string[];
    cpt?: string[];
    modifiers?: string[];
    npi?: string[];
  }): Promise<{
    icd10: Array<{ code: string; valid: boolean; description: string | null }>;
    cpt: Array<{ code: string; valid: boolean; description: string | null }>;
    modifiers: Array<{ code: string; valid: boolean; description: string | null }>;
    npi: NpiValidateItem[];
  }> {
    return {
      icd10: await this.validateList(payload.icd10 ?? [], (c) => this.findIcd10(c)),
      cpt: await this.validateList(payload.cpt ?? [], (c) => this.findCpt(c)),
      modifiers: await this.validateList(payload.modifiers ?? [], (c) => this.findModifier(c)),
      npi: await this.validateNpiList(payload.npi ?? []),
    };
  }

  private async validateNpiList(npis: string[]): Promise<NpiValidateItem[]> {
    const seen = new Set<string>();
    const results: NpiValidateItem[] = [];

    for (const raw of npis) {
      const display = String(raw ?? '').trim();
      const key = normalizeNpi(display) || this.sanitizeQuery(display);
      if (!key || seen.has(key)) continue;
      seen.add(key);

      const formatValid = validateNpiLuhn(normalizeNpi(display) ?? '');
      const match = await this.findNpi(display);
      results.push({
        code: match?.code ?? (normalizeNpi(display) || display),
        valid: match != null,
        formatValid,
        description: match?.description ?? null,
        firstName: match?.firstName ?? null,
        lastName: match?.lastName ?? null,
        active: match != null ? true : null,
      });
    }
    return results;
  }

  private async validateList(
    codes: string[],
    finder: (code: string) => Promise<CodingRefItem | null>,
  ): Promise<Array<{ code: string; valid: boolean; description: string | null }>> {
    const seen = new Set<string>();
    const results: Array<{ code: string; valid: boolean; description: string | null }> = [];

    for (const code of codes) {
      const raw = this.sanitizeQuery(String(code));
      const key = this.compactIcd10(raw);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const match = await finder(raw);
      results.push({
        code: match?.code ?? raw,
        valid: match != null,
        description: match?.description ?? null,
      });
    }
    return results;
  }
}

/** CPT (5 digits), HCPCS (letter+4 digits), Cat III/PLA (4 digits+letter). */
export function normalizeProcedureCode(code: string | null | undefined): string | null {
  const c = String(code ?? '')
    .trim()
    .toUpperCase();
  if (!c) return null;
  if (/^\d{5}$/.test(c) || /^[A-Z]\d{4}$/.test(c) || /^\d{4}[A-Z]$/.test(c)) return c;
  return null;
}

/** Digits-only NPI candidate (strips spaces/dashes). Empty → null. */
export function normalizeNpi(npi: string | null | undefined): string | null {
  const digits = String(npi ?? '').replace(/\D/g, '');
  return digits.length > 0 ? digits : null;
}

export function formatNpiDescription(
  lastName: string | null | undefined,
  firstName: string | null | undefined,
): string | null {
  const last = String(lastName ?? '').trim();
  const first = String(firstName ?? '').trim();
  if (last && first) return `${last}, ${first}`;
  if (last) return last;
  if (first) return first;
  return null;
}

function mapNpiRow(
  npi: string,
  firstName: string | null,
  lastName: string | null,
  active: boolean,
): NpiRefItem {
  return {
    code: npi,
    description: formatNpiDescription(lastName, firstName),
    firstName: firstName != null && firstName !== '' ? firstName : null,
    lastName: lastName != null && lastName !== '' ? lastName : null,
    active,
    formatValid: validateNpiLuhn(npi),
  };
}

export function requireFound<T>(item: T | null, message: string): T {
  if (item == null) throw new NotFoundException(message);
  return item;
}
