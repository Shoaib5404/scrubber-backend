import { accessSync, constants, readFileSync } from 'fs';
import * as path from 'path';
import { parse } from 'csv-parse/sync';

export function resolveFilePath(fileArg: string | undefined, defaultRelative: string): string {
  if (fileArg) {
    return path.isAbsolute(fileArg) ? fileArg : path.resolve(process.cwd(), fileArg);
  }
  return path.resolve(process.cwd(), defaultRelative);
}

export function assertReadableFile(filePath: string): void {
  accessSync(filePath, constants.R_OK);
}

export function parseCsvFile(filePath: string): string[][] {
  const content = readFileSync(filePath);
  return parse(content, {
    relax_column_count: true,
    skip_empty_lines: false,
    bom: true,
  }) as string[][];
}

export function getCsvValue(row: string[], index: number | null): string | null {
  if (index === null || index < 0 || index >= row.length) {
    return null;
  }
  const value = row[index]?.trim() ?? '';
  return value === '' ? null : value;
}

/** Laravel ImportRadiologyCptCodes::parseCpt */
export function parseRadiologyCpt(value: string | null): string | null {
  const normalized = (value ?? '').trim().toUpperCase();
  if (normalized === '' || normalized === 'PROCEDURE' || !/^[A-Z0-9]+$/.test(normalized)) {
    return null;
  }
  return normalized;
}

/** Laravel ImportMajorSurgeryCodes / ImportInitialTreatmentCodes::parseCode */
export function parseAlphanumericCode(value: string | null): string | null {
  const normalized = (value ?? '').trim().toUpperCase();
  if (normalized === '' || !/^[A-Z0-9]+$/.test(normalized)) {
    return null;
  }
  return normalized;
}

/** Laravel ImportNoOfUnitsCpts::parseCpt */
export function parseNoOfUnitsCpt(value: string | null): string | null {
  let normalized = (value ?? '').trim().toUpperCase();
  if (normalized === '' || !/^[A-Z0-9]+$/.test(normalized)) {
    return null;
  }
  if (normalized.length < 5 && /^\d+$/.test(normalized)) {
    normalized = normalized.padStart(5, '0');
  }
  return normalized;
}

/** Laravel ImportNoOfUnitsCpts::normalizeHeader */
export function normalizeHeader(header: string): string {
  let normalized = header.trim().toLowerCase();
  normalized = normalized.replace(/[^a-z0-9]+/g, '_');
  return normalized.replace(/^_+|_+$/g, '');
}

const NO_OF_UNITS_CPT_COLUMN_NAMES = [
  'hcpcs_code',
  'hcpcs',
  'cpt',
  'cpt_code',
  'code',
  'procedure_code',
  'procedurecode',
] as const;

/** Laravel ImportNoOfUnitsCpts::mapColumns */
export function mapNoOfUnitsCptColumn(headers: string[]): number | null {
  for (const name of NO_OF_UNITS_CPT_COLUMN_NAMES) {
    const index = headers.indexOf(name);
    if (index !== -1) {
      return index;
    }
  }
  return null;
}

export function dedupeBatchByKey<T extends Record<string, string>>(
  batch: T[],
  key: keyof T & string,
): T[] {
  const unique = new Map<string, T>();
  for (const row of batch) {
    unique.set(row[key], row);
  }
  return [...unique.values()];
}

/** Laravel Import*::normalizeHeaders — header row to normalized name → column index. */
export function normalizeHeaders(headers: string[]): Record<string, number> {
  const normalized: Record<string, number> = {};
  for (let index = 0; index < headers.length; index += 1) {
    const key = normalizeHeader(String(headers[index] ?? ''));
    if (key !== '') {
      normalized[key] = index;
    }
  }
  return normalized;
}

export function resolveColumnIndex(
  columns: Record<string, number>,
  names: readonly string[],
  fallback: number,
): number {
  for (const name of names) {
    if (Object.prototype.hasOwnProperty.call(columns, name)) {
      return columns[name];
    }
  }
  return fallback;
}

/** Laravel ImportAnesthesiaCodes::parseActive (and siblings). */
export function parseImportActive(value: string | null): boolean {
  const normalized = (value ?? '').trim().toLowerCase();
  switch (normalized) {
    case '0':
    case 'false':
    case 'inactive':
    case 'no':
    case 'n':
      return false;
    default:
      return true;
  }
}

/** Laravel ImportAnesthesiaCodes::parseUnit */
export function parseImportUnit(value: string | null): number | null {
  if (value === null || value === '') {
    return null;
  }
  if (!/^-?\d+(\.\d+)?$/.test(value.trim()) || !Number.isFinite(Number(value))) {
    return null;
  }
  return Math.trunc(Number(value));
}

/** Laravel ImportGlobalDaysSurgeries::parseDays (ctype_digit) */
export function parseGlobalDaysDigits(value: string | null): number | null {
  if (value === null || value === '') {
    return null;
  }
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) {
    return null;
  }
  return Number.parseInt(trimmed, 10);
}

const GLOBAL_DAYS_COLUMN_ALIASES = {
  cptCode: ['hcpcs', 'cpt', 'cpt_code', 'code'] as const,
  description: ['description', 'desc'] as const,
  days: ['global_days', 'golbal_days', 'days'] as const,
};

/** Laravel ImportGlobalDaysSurgeries::mapCsvColumns */
export function mapGlobalDaysSurgeryColumns(
  headers: string[],
): Partial<Record<'cptCode' | 'description' | 'days', number>> {
  const map: Partial<Record<'cptCode' | 'description' | 'days', number>> = {};
  for (let index = 0; index < headers.length; index += 1) {
    const normalized = normalizeHeader(String(headers[index] ?? ''));
    for (const [field, possibleNames] of Object.entries(GLOBAL_DAYS_COLUMN_ALIASES) as [
      keyof typeof GLOBAL_DAYS_COLUMN_ALIASES,
      readonly string[],
    ][]) {
      if (possibleNames.includes(normalized)) {
        map[field] = index;
      }
    }
  }
  return map;
}

export function dedupeBatchByCompositeKey<T extends Record<string, string>>(
  batch: T[],
  keys: (keyof T & string)[],
): T[] {
  const unique = new Map<string, T>();
  for (const row of batch) {
    unique.set(keys.map((key) => row[key]).join('|'), row);
  }
  return [...unique.values()];
}

/** Laravel ImportMue87726Uhc06111Oxford::parseInteger (ctype_digit) */
export function parseCtypeDigitInteger(value: string | null): number | null {
  if (value === null || value === '') {
    return null;
  }
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) {
    return null;
  }
  return Number.parseInt(trimmed, 10);
}

const MUE_87726_COLUMN_ALIASES = {
  cptCode: ['code', 'cpt', 'cpt_code', 'hcpcs'] as const,
  min: ['minimun', 'minimum', 'min'] as const,
  max: ['maximun', 'maximum', 'max'] as const,
};

/** Laravel ImportMue87726Uhc06111Oxford::mapCsvColumns */
export function mapMue87726UhcOxfordColumns(
  headers: string[],
): Partial<Record<'cptCode' | 'min' | 'max', number>> {
  const map: Partial<Record<'cptCode' | 'min' | 'max', number>> = {};
  for (let index = 0; index < headers.length; index += 1) {
    const normalized = normalizeHeader(String(headers[index] ?? ''));
    for (const [field, possibleNames] of Object.entries(MUE_87726_COLUMN_ALIASES) as [
      keyof typeof MUE_87726_COLUMN_ALIASES,
      readonly string[],
    ][]) {
      if (possibleNames.includes(normalized)) {
        map[field] = index;
      }
    }
  }
  return map;
}

/** Laravel ImportBcbsClaimRoutings::buildColumns */
export function buildBcbsClaimRoutingColumns(
  descriptions: string[],
  payerIds: string[],
): Array<{ index: number; description: string; payerId: string }> {
  const columns: Array<{ index: number; description: string; payerId: string }> = [];
  const columnCount = Math.max(descriptions.length, payerIds.length);
  for (let index = 0; index < columnCount; index += 1) {
    const description = (descriptions[index] ?? '').trim();
    const payerId = (payerIds[index] ?? '').trim();
    if (description === '' || payerId === '') {
      continue;
    }
    columns.push({ index, description, payerId });
  }
  return columns;
}

/** Laravel ImportZeroAmountProcedures::parseProcedureCode */
export function parseZeroAmountProcedureCode(value: string | null): string | null {
  let normalized = (value ?? '').trim().toUpperCase();
  if (normalized === '' || !/^[A-Z0-9]+$/.test(normalized)) {
    return null;
  }
  if (normalized.length < 5) {
    normalized = normalized.padStart(5, '0');
  }
  return normalized;
}

const ZERO_AMOUNT_PROCEDURE_COLUMN_NAMES = [
  'procedure_code',
  'procedurecode',
  'code',
  'cpt',
  'cpt_code',
  'hcpcs',
] as const;

/** Laravel ImportZeroAmountProcedures::mapExcelColumns */
export function mapZeroAmountProcedureColumn(headers: string[]): number | null {
  const normalizedHeaders = headers.map((header) => normalizeHeader(String(header ?? '')));
  for (const name of ZERO_AMOUNT_PROCEDURE_COLUMN_NAMES) {
    const index = normalizedHeaders.indexOf(name);
    if (index !== -1) {
      return index;
    }
  }
  return null;
}

/** Laravel ImportUhcAuthorizations::mapColumns */
export function mapUhcAuthorizationColumns(headers: string[]): Partial<Record<'cptCode' | 'description' | 'diagnosis', number>> {
  const map: Partial<Record<'cptCode' | 'description' | 'diagnosis', number>> = {};
  for (let index = 0; index < headers.length; index += 1) {
    const normalized = normalizeHeader(String(headers[index] ?? ''));
    if (['procedure_codes', 'procedure_code', 'cpt', 'cpt_code', 'hcpcs', 'code'].includes(normalized)) {
      map.cptCode = index;
    }
    if (['description', 'condition'].includes(normalized)) {
      map.description = index;
    }
    if (['diagnosis', 'diagnosis_icd', 'icd', 'icds', 'condition_values'].includes(normalized)) {
      map.diagnosis = index;
    }
  }
  return map;
}
