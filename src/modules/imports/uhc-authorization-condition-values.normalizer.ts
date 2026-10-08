import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Icd10RangeExpander } from './icd10-range.expander';
import {
  UHC_AUTH_CONDITION_ALWAYS,
  UHC_AUTH_CONDITION_CHARGE_GT,
  UHC_AUTH_CONDITION_MANDATORY_WITH_ICDS,
  UHC_AUTH_CONDITION_NOT_REQUIRED_WITH_ICDS,
  UHC_AUTH_CONDITION_POS_IN,
} from './uhc-authorization-condition-map';

/** Laravel UhcAuthorizationConditionValuesNormalizer */
@Injectable()
export class UhcAuthorizationConditionValuesNormalizer {
  constructor(
    private readonly prisma: PrismaService,
    private readonly icd10RangeExpander: Icd10RangeExpander,
  ) {}

  async normalize(
    condition: string,
    description: string,
    diagnosis: string | null,
  ): Promise<string | null> {
    switch (condition) {
      case UHC_AUTH_CONDITION_ALWAYS:
        return null;
      case UHC_AUTH_CONDITION_CHARGE_GT:
        return this.extractChargeThreshold(description);
      case UHC_AUTH_CONDITION_POS_IN:
        return this.extractPosList(description);
      case UHC_AUTH_CONDITION_MANDATORY_WITH_ICDS:
      case UHC_AUTH_CONDITION_NOT_REQUIRED_WITH_ICDS:
        return this.expandIcdList(diagnosis ?? '');
      default: {
        const trimmed = (diagnosis ?? '').trim();
        return trimmed !== '' ? trimmed : null;
      }
    }
  }

  async expandIcdList(raw: string): Promise<string | null> {
    const trimmed = raw.trim();
    if (trimmed === '') {
      return null;
    }

    const tokens = trimmed.split(/\s*,\s*|\s+or\s+/i);
    const codes = new Map<string, true>();

    for (const token of tokens) {
      const part = token.trim();
      if (part === '') {
        continue;
      }
      for (const code of await this.expandToken(part)) {
        const formatted = this.formatIcdCode(code);
        if (formatted !== '') {
          codes.set(formatted, true);
        }
      }
    }

    if (codes.size === 0) {
      return null;
    }

    const sorted = [...codes.keys()].sort();
    return sorted.join(',');
  }

  private async expandToken(token: string): Promise<string[]> {
    const range = this.parseIcdRange(token);
    if (range !== null) {
      const expanded = await this.expandRangeFromTabular(range.start, range.end);
      if (expanded.length > 0) {
        return expanded;
      }
    }
    return await this.icd10RangeExpander.expand(token);
  }

  private parseIcdRange(token: string): { start: string; end: string } | null {
    const parts = token.trim().split(/\s*[-–—]\s*/u);
    if (parts.length !== 2) {
      return null;
    }
    const start = parts[0]?.trim() ?? '';
    const end = parts[1]?.trim() ?? '';
    if (start === '' || end === '') {
      return null;
    }
    return { start, end };
  }

  private async expandRangeFromTabular(start: string, end: string): Promise<string[]> {
    const normStart = this.normalizeIcd(start);
    const normEnd = this.normalizeIcd(end);
    if (normStart === '' || normEnd === '' || normStart.localeCompare(normEnd) > 0) {
      return [];
    }

    try {
      const rows = await this.prisma.$queryRaw<{ code: string }[]>`
        SELECT code FROM icd10_tabular_codes
        WHERE is_chapter = false
          AND is_section = false
          AND UPPER(REPLACE(code, '.', '')) >= ${normStart}
          AND UPPER(REPLACE(code, '.', '')) <= ${normEnd}
        ORDER BY code
      `;
      return rows.map((row) => String(row.code));
    } catch {
      return [];
    }
  }

  private extractChargeThreshold(description: string): string | null {
    const match = />\s*([\d,.]+)/.exec(description);
    if (!match?.[1]) {
      return null;
    }
    const threshold = match[1].replace(/,/g, '');
    return /^\d+(\.\d+)?$/.test(threshold) ? threshold : null;
  }

  private extractPosList(description: string): string | null {
    const matches = description.match(/\d+/g);
    if (!matches || matches.length === 0) {
      return null;
    }
    const codes = [...new Set(matches.map((code) => code.padStart(2, '0')))];
    return codes.join(',');
  }

  private formatIcdCode(code: string): string {
    const normalized = this.normalizeIcd(code);
    if (normalized === '') {
      return '';
    }
    if (normalized.length <= 3) {
      return normalized;
    }
    return `${normalized.slice(0, 3)}.${normalized.slice(3)}`;
  }

  normalizeIcd(code: string): string {
    return code.trim().toUpperCase().replace(/\./g, '');
  }

  /** Laravel UhcAuthorizationConditionValuesNormalizer::parsePosList */
  parsePosList(conditionValues: string | null | undefined): string[] {
    if (conditionValues === null || conditionValues === undefined || conditionValues.trim() === '') {
      return [];
    }
    const codes: string[] = [];
    for (const part of conditionValues.split(',')) {
      const trimmed = part.trim();
      if (trimmed === '') continue;
      codes.push(trimmed.padStart(2, '0'));
    }
    return [...new Set(codes)];
  }

  /** Laravel UhcAuthorizationConditionValuesNormalizer::parseIcdLookup */
  parseIcdLookup(conditionValues: string | null | undefined): Record<string, true> {
    if (conditionValues === null || conditionValues === undefined || conditionValues.trim() === '') {
      return {};
    }
    const lookup: Record<string, true> = {};
    for (const part of conditionValues.split(',')) {
      const normalized = this.normalizeIcd(part);
      if (normalized !== '') {
        lookup[normalized] = true;
      }
    }
    return lookup;
  }
}
