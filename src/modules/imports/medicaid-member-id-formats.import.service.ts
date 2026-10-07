import { Injectable } from '@nestjs/common';
import { MedicaidMemberIdFormatRepository } from '../reference-admin/medicaid/medicaid-member-id-format.repository';
import { loadExcelRows } from './import.utils';

export interface MedicaidMemberIdFormatImportOptions {
  truncate?: boolean;
  dryRun?: boolean;
}

export interface MedicaidMemberIdFormatImportResult {
  parsed: number;
  uniquePayers: number;
  existing: number;
  stored: number;
  dryRun: boolean;
}

interface MedicaidMemberIdFormatRecord {
  payer_name: string;
  direct_indirect: string | null;
  rt_payer_id: string | null;
  member_id_format: string;
  length: number | null;
  format_type: string | null;
  pattern: string | null;
  is_active: boolean;
}

/** Laravel App\Console\Commands\ImportMedicaidMemberIdFormats (medicaid:import-member-id-formats). */
@Injectable()
export class MedicaidMemberIdFormatsImportService {
  constructor(private readonly repository: MedicaidMemberIdFormatRepository) {}

  async importFromFile(
    filePath: string,
    options: MedicaidMemberIdFormatImportOptions = {},
  ): Promise<MedicaidMemberIdFormatImportResult> {
    const records = await this.parseExcel(filePath);
    const uniquePayers = new Set(records.map((record) => record.payer_name)).size;
    const existing = await this.repository.count();

    if (options.dryRun) {
      return { parsed: records.length, uniquePayers, existing, stored: 0, dryRun: true };
    }

    if (!options.truncate && existing > 0) {
      throw new Error('JSON store already has records. Use --truncate to replace them.');
    }

    const stored = await this.repository.replaceAll(records as unknown as Array<Record<string, unknown>>);

    return { parsed: records.length, uniquePayers, existing, stored, dryRun: false };
  }

  private async parseExcel(filePath: string): Promise<MedicaidMemberIdFormatRecord[]> {
    const rows = await loadExcelRows(filePath);
    if (rows.length === 0) {
      throw new Error('Excel sheet is empty.');
    }

    const headerRowIndex = this.findHeaderRowIndex(rows);
    const records: MedicaidMemberIdFormatRecord[] = [];
    const seen = new Set<string>();

    let currentPayerName: string | null = null;
    let currentDirectIndirect: string | null = null;
    let currentRtPayerId: string | null = null;

    for (let i = headerRowIndex + 1; i < rows.length; i += 1) {
      const row = rows[i] ?? [];

      const payerName = (row[0] ?? '').trim();
      if (payerName !== '') {
        currentPayerName = payerName.toUpperCase();
        currentDirectIndirect = this.nullable((row[1] ?? '').trim());
        currentRtPayerId = this.nullable((row[2] ?? '').trim());
      }

      if (currentPayerName === null) {
        continue;
      }

      // Column index 3 ("Success Member ID Format" example IDs) is intentionally skipped.
      const lengthRaw = (row[4] ?? '').trim();
      const formatType = this.nullable((row[5] ?? '').trim());
      const pattern = this.nullable((row[6] ?? '').trim().toUpperCase());
      const parsedLength =
        lengthRaw !== '' && /^-?\d+(\.\d+)?$/.test(lengthRaw) ? Math.trunc(Number(lengthRaw)) : null;

      // Prefer pattern as the format key; fall back to format type when pattern is blank.
      let memberIdFormat: string | null = pattern ?? (formatType !== null ? formatType.toUpperCase() : null);
      if (memberIdFormat === null && parsedLength === null) {
        continue;
      }
      if (memberIdFormat === null) {
        memberIdFormat = `LEN${parsedLength}`;
      }

      const key = [
        currentPayerName,
        currentRtPayerId ?? '',
        parsedLength ?? '',
        formatType ?? '',
        pattern ?? '',
      ].join('|');
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);

      records.push({
        payer_name: currentPayerName,
        direct_indirect: currentDirectIndirect,
        rt_payer_id: currentRtPayerId,
        member_id_format: memberIdFormat,
        length: parsedLength,
        format_type: formatType,
        pattern,
        is_active: true,
      });
    }

    if (records.length === 0) {
      throw new Error('No member ID format rows found in Excel.');
    }

    return records;
  }

  private findHeaderRowIndex(rows: string[][]): number {
    for (let index = 0; index < rows.length; index += 1) {
      const header = (rows[index]?.[0] ?? '').trim().toLowerCase();
      if (header.includes('payer')) {
        return index;
      }
    }
    return 0;
  }

  private nullable(value: string): string | null {
    return value === '' ? null : value;
  }
}
