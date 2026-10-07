import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

/** Laravel App\Services\ImportLibs\Icd10\Icd10RangeExpander */
@Injectable()
export class Icd10RangeExpander {
  private billableCodesCache: string[] | null = null;

  private readonly maxNumericSpan = 500;

  constructor(private readonly prisma: PrismaService) {}

  async expand(cell: string): Promise<string[]> {
    const trimmed = cell.trim();
    if (trimmed === '') {
      return [];
    }

    if (!trimmed.includes('-')) {
      const code = this.formatWithDot(trimmed);
      return code === '' ? [] : [code];
    }

    const parts = trimmed.split(/\s*-\s*/, 2);
    if (parts.length !== 2) {
      const code = this.formatWithDot(trimmed);
      return code === '' ? [] : [code];
    }

    const start = parts[0]?.trim() ?? '';
    const end = parts[1]?.trim() ?? '';
    if (start === '' || end === '') {
      const code = this.formatWithDot(start !== '' ? start : end);
      return code === '' ? [] : [code];
    }

    const numeric = this.expandNumericSuffixRange(start, end);
    if (numeric !== null) {
      return numeric;
    }

    const tabular = await this.expandViaTabular(start, end);
    if (tabular.length > 0) {
      return tabular;
    }

    return [this.formatWithDot(start)];
  }

  private expandNumericSuffixRange(start: string, end: string): string[] | null {
    const left = this.splitPrefixAndNumericSuffix(start);
    const right = this.splitPrefixAndNumericSuffix(end);
    if (left === null || right === null) {
      return null;
    }

    const [prefL, digitsL, intL] = left;
    const [prefR, digitsR, intR] = right;
    if (prefL !== prefR || digitsL.length !== digitsR.length || intL > intR) {
      return null;
    }

    const span = intR - intL;
    if (span > this.maxNumericSpan) {
      return null;
    }

    const width = digitsL.length;
    const out: string[] = [];
    for (let n = intL; n <= intR; n += 1) {
      out.push(this.formatWithDot(prefL + String(n).padStart(width, '0')));
    }
    return out;
  }

  private async expandViaTabular(start: string, end: string): Promise<string[]> {
    const normStart = this.normalizeCode(start);
    const normEnd = this.normalizeCode(end);
    if (normStart === '' || normEnd === '' || normStart.localeCompare(normEnd) > 0) {
      return [];
    }

    const codes: string[] = [];
    for (const code of await this.billableTabularCodes()) {
      const norm = this.normalizeCode(code);
      if (norm === '') {
        continue;
      }
      if (norm.localeCompare(normStart) >= 0 && norm.localeCompare(normEnd) <= 0) {
        codes.push(this.formatWithDot(code));
      }
    }
    return [...new Set(codes)];
  }

  private async billableTabularCodes(): Promise<string[]> {
    if (this.billableCodesCache !== null) {
      return this.billableCodesCache;
    }

    try {
      const rows = await this.prisma.$queryRaw<{ code: string }[]>`
        SELECT code FROM icd10_tabular_codes
        WHERE is_billable = true
        ORDER BY code
      `;
      this.billableCodesCache = rows.map((row) => String(row.code));
    } catch {
      this.billableCodesCache = [];
    }

    return this.billableCodesCache;
  }

  private splitPrefixAndNumericSuffix(code: string): [string, string, number] | null {
    const match = /^(.+?)(\d+)$/.exec(code.trim());
    if (!match) {
      return null;
    }
    return [match[1] ?? '', match[2] ?? '', Number.parseInt(match[2] ?? '0', 10)];
  }

  normalizeCode(code: string): string {
    return code.trim().toUpperCase().replace(/\./g, '');
  }

  private formatWithDot(code: string): string {
    const normalized = this.normalizeCode(code);
    if (normalized === '') {
      return '';
    }
    if (normalized.length <= 3) {
      return normalized;
    }
    return `${normalized.slice(0, 3)}.${normalized.slice(3)}`;
  }
}
