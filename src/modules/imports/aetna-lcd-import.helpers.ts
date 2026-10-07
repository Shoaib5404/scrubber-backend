import { PrismaService } from '../../common/prisma/prisma.service';
import { Icd10RangeExpander } from './icd10-range.expander';
import {
  AETNA_CPT_HEADER_ALIASES,
  AETNA_ICD_HEADER_ALIASES,
  extractSingleColumnCodes,
  findHeaderRowIndexByFirstColumn,
  formatStoredIcd,
  isValidStoredIcd,
  normalizeIcdCodeForRange,
  normalizeIcdSource,
  parseIcdRange,
} from './import.utils';

/** Shared parse helpers for Laravel ImportAetnaB12Lcd / ImportAetnaFetalLcd. */

export interface AetnaIcdRow {
  source: string;
  description: string;
  icds: string[];
}

export type IcdSourceExpander = (source: string) => Promise<string[]>;

/** Laravel ImportAetnaB12Lcd/ImportAetnaFetalLcd::extractCptCodesFromSheet */
export function extractAetnaCptCodes(rows: string[][]): string[] {
  if (rows.length === 0) {
    return [];
  }
  const headerRowIndex = findHeaderRowIndexByFirstColumn(rows, AETNA_CPT_HEADER_ALIASES);
  return extractSingleColumnCodes(rows, headerRowIndex, true);
}

/** Laravel ImportAetnaB12Lcd/ImportAetnaFetalLcd::buildIcdRow */
export async function buildAetnaIcdRow(
  source: string,
  description: string,
  expandSource: IcdSourceExpander,
): Promise<AetnaIcdRow> {
  const normalized = normalizeIcdSource(source);
  const expanded = await expandSource(normalized);

  const seen = new Set<string>();
  const icds: string[] = [];
  for (const icd of expanded) {
    const formatted = formatStoredIcd(icd);
    if (formatted !== '' && isValidStoredIcd(formatted) && !seen.has(formatted)) {
      seen.add(formatted);
      icds.push(formatted);
    }
  }

  return { source: normalized, description, icds };
}

async function extractAetnaIcdRowsFromDataRows(
  dataRows: string[][],
  expandSource: IcdSourceExpander,
  dropEmptyIcdRows: boolean,
): Promise<AetnaIcdRow[]> {
  const icdRows: AetnaIcdRow[] = [];
  let currentSource: string | null = null;
  let currentDescription = '';

  for (const row of dataRows) {
    const source = normalizeIcdSource(String(row[0] ?? ''));
    const description = String(row[1] ?? '').trim();

    if (source === '' && currentSource !== null) {
      if (description !== '') {
        currentDescription = `${currentDescription} ${description}`.trim();
      }
      continue;
    }

    if (currentSource !== null) {
      const builtRow = await buildAetnaIcdRow(currentSource, currentDescription, expandSource);
      if (!dropEmptyIcdRows || builtRow.icds.length > 0) {
        icdRows.push(builtRow);
      }
    }

    currentSource = source;
    currentDescription = description;
  }

  if (currentSource !== null && currentSource !== '') {
    const builtRow = await buildAetnaIcdRow(currentSource, currentDescription, expandSource);
    if (!dropEmptyIcdRows || builtRow.icds.length > 0) {
      icdRows.push(builtRow);
    }
  }

  return icdRows;
}

/**
 * Laravel ImportAetnaB12Lcd/ImportAetnaFetalLcd::extractIcdRowsFromSheet — continuation lines
 * (blank source cell) append to the previous row's description. `dropEmptyIcdRows` mirrors the
 * one behavioral difference between B12 (keeps empty-icds rows) and Fetal (drops them).
 */
export async function extractAetnaIcdRows(
  rows: string[][],
  expandSource: IcdSourceExpander,
  dropEmptyIcdRows: boolean,
): Promise<AetnaIcdRow[]> {
  if (rows.length === 0) {
    return [];
  }
  const headerRowIndex = findHeaderRowIndexByFirstColumn(rows, AETNA_ICD_HEADER_ALIASES);
  return extractAetnaIcdRowsFromDataRows(rows.slice(headerRowIndex + 1), expandSource, dropEmptyIcdRows);
}

/** Laravel ImportAetnaB12Lcd::parseCsv — CSV always discards exactly one header row (no name search). */
export async function extractAetnaIcdRowsFromCsvDataRows(
  dataRows: string[][],
  expandSource: IcdSourceExpander,
): Promise<AetnaIcdRow[]> {
  return extractAetnaIcdRowsFromDataRows(dataRows, expandSource, false);
}

/** Laravel ImportAetnaB12Lcd::parseCptOption — comma-separated --cpt list. */
export function parseAetnaCptOption(raw: string | undefined): string[] | null {
  if (raw === undefined || raw.trim() === '') {
    return null;
  }
  const seen = new Set<string>();
  const codes: string[] = [];
  for (const part of raw.split(/\s*,\s*/)) {
    const code = part.trim().toUpperCase();
    if (code !== '' && !seen.has(code)) {
      seen.add(code);
      codes.push(code);
    }
  }
  return codes;
}

async function expandAetnaRangeFromTabular(
  prisma: PrismaService,
  start: string,
  end: string,
): Promise<string[]> {
  const normStart = normalizeIcdCodeForRange(start);
  const normEnd = normalizeIcdCodeForRange(end);
  if (normStart === '' || normEnd === '' || normStart.localeCompare(normEnd) > 0) {
    return [];
  }

  const rows = await prisma.$queryRaw<{ code: string }[]>`
    SELECT code FROM icd10_tabular_codes
    WHERE is_chapter = false AND is_section = false
      AND UPPER(REPLACE(code, '.', '')) >= ${normStart}
      AND UPPER(REPLACE(code, '.', '')) <= ${normEnd}
    ORDER BY code
  `;
  return rows.map((row) => String(row.code));
}

/**
 * Laravel ImportAetnaB12Lcd/ImportAetnaFetalLcd::expandIcdSource — range cells are resolved via
 * icd10_tabular_codes first (is_chapter=false AND is_section=false), falling back to the shared
 * Icd10RangeExpander for single codes or when the tabular lookup finds nothing.
 */
export function createAetnaIcdSourceExpander(
  prisma: PrismaService,
  rangeExpander: Icd10RangeExpander,
): IcdSourceExpander {
  return async (source: string): Promise<string[]> => {
    const range = parseIcdRange(source);
    if (range !== null) {
      const expanded = await expandAetnaRangeFromTabular(prisma, range.start, range.end);
      if (expanded.length > 0) {
        return expanded;
      }
    }
    return rangeExpander.expand(source);
  };
}
