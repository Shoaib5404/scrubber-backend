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
