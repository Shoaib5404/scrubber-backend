import ExcelJS from 'exceljs';
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
/** Laravel Import* Excel helpers — prefer Sheet1, else first worksheet. */
export async function loadExcelRows(filePath: string): Promise<string[][]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const sheet = workbook.getWorksheet('Sheet1') ?? workbook.worksheets[0];
  if (!sheet) {
    return [];
  }

  const rows: string[][] = [];
  sheet.eachRow((row) => {
    const values = row.values;
    if (!Array.isArray(values)) {
      return;
    }
    const cells = values.slice(1).map((value) => excelCellToTrimmedString(value));
    rows.push(cells);
  });
  return rows;
}

export function excelCellToTrimmedString(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (value instanceof Date) {
    const y = value.getUTCFullYear();
    const m = String(value.getUTCMonth() + 1).padStart(2, '0');
    const d = String(value.getUTCDate()).padStart(2, '0');
    return `${y}${m}${d}`;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (Number.isInteger(value) && value >= 19000101 && value <= 99991231) {
      return String(value);
    }
  }
  return String(value).trim();
}

export function getMappedColumnValue(
  row: string[],
  columnMap: Partial<Record<string, number>>,
  field: string,
): string | null {
  const index = columnMap[field];
  if (index === undefined || index < 0 || index >= row.length) {
    return null;
  }
  const value = row[index]?.trim() ?? '';
  return value === '' ? null : value;
}

/** Laravel ImportEnmProcedures / ImportConsultationProcedures::mapExcelColumns (cpt + description). */
export function mapCptDescriptionExcelColumns(
  headers: string[],
  descriptionAliases: readonly string[] = ['description', 'desc', 'name', 'procedure_description'],
): Partial<Record<'cptCode' | 'description', number>> {
  const map: Partial<Record<'cptCode' | 'description', number>> = {};
  const cptNames = ['cpt', 'cpt_code', 'code', 'procedure_code', 'hcpcs'] as const;
  for (const name of cptNames) {
    const index = headers.indexOf(name);
    if (index !== -1) {
      map.cptCode = index;
      break;
    }
  }
  for (const name of descriptionAliases) {
    const index = headers.indexOf(name);
    if (index !== -1) {
      map.description = index;
      break;
    }
  }
  return map;
}

/** Laravel ImportEnmSurgeryCodes::mapExcelColumns */
export function mapEnmSurgeryCodeExcelColumns(
  headers: string[],
): Partial<Record<'cptCode', number>> {
  const names = [
    'cpt',
    'cpt_code',
    'code',
    'procedure_code',
    'hcpcs',
    'e_mcodes',
    'em_codes',
    'e_m_codes',
    'enm_codes',
    'enm_code',
  ] as const;
  for (const name of names) {
    const index = headers.indexOf(name);
    if (index !== -1) {
      return { cptCode: index };
    }
  }
  return {};
}

/** Laravel ImportConsultationProcedures::mapExcelColumns */
export function mapConsultationProcedureExcelColumns(
  headers: string[],
): Partial<Record<'cptCode' | 'description' | 'typeOfService', number>> {
  const map: Partial<Record<'cptCode' | 'description' | 'typeOfService', number>> =
    mapCptDescriptionExcelColumns(headers, [
      'short_description',
      'description',
      'desc',
      'name',
      'procedure_description',
    ]);
  const tosNames = ['type_of_service', 'tos', 'service_type'] as const;
  for (const name of tosNames) {
    const index = headers.indexOf(name);
    if (index !== -1) {
      map.typeOfService = index;
      break;
    }
  }
  return map;
}

/** Laravel ImportLabCodes::mapExcelColumns */
export function mapLabCodeExcelColumns(
  headers: string[],
): Partial<
  Record<'hcpcs' | 'modifier' | 'effectiveDate' | 'indicator' | 'rate' | 'shortDescription', number>
> {
  const map: Partial<
    Record<'hcpcs' | 'modifier' | 'effectiveDate' | 'indicator' | 'rate' | 'shortDescription', number>
  > = {};
  const mappings: Record<string, readonly string[]> = {
    hcpcs: ['hcpcs', 'code', 'cpt', 'cpt_code', 'procedure_code'],
    modifier: ['mod', 'modifier', 'modifer'],
    effectiveDate: ['eff_date', 'effective_date', 'effdate', 'effective'],
    indicator: ['indicator', 'ind'],
    rate: ['rate', 'amount', 'fee'],
    shortDescription: ['shortdesc', 'short_description', 'short_desc', 'description', 'desc'],
  };
  for (const [field, possibleNames] of Object.entries(mappings)) {
    for (const name of possibleNames) {
      const index = headers.indexOf(name);
      if (index !== -1) {
        map[field as keyof typeof map] = index;
        break;
      }
    }
  }
  return map;
}

/** Laravel ImportLabCodes::nullableTrim */
export function nullableTrim(value: string | null): string | null {
  if (value === null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/** Laravel ImportLabCodes::parseModifier */
export function parseLabModifier(value: string | null): string {
  return (value ?? '').trim().toUpperCase();
}

/** Laravel ImportLabCodes::parseEffectiveDate */
export function parseLabEffectiveDate(value: string | null): Date | null {
  const trimmed = (value ?? '').trim();
  if (trimmed === '') {
    return null;
  }
  if (/^\d{8}$/.test(trimmed)) {
    const y = Number.parseInt(trimmed.slice(0, 4), 10);
    const m = Number.parseInt(trimmed.slice(4, 6), 10);
    const d = Number.parseInt(trimmed.slice(6, 8), 10);
    const date = new Date(Date.UTC(y, m - 1, d));
    if (date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d) {
      return date;
    }
    return null;
  }
  const parsed = Date.parse(trimmed);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  const date = new Date(parsed);
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
}

/** Laravel ImportLabCodes::parseRate */
export function parseLabRate(value: string | null): string | null {
  const trimmed = (value ?? '').trim();
  if (trimmed === '') {
    return null;
  }
  const normalized = trimmed.replace(/[$,]/g, '');
  if (!/^-?\d+(\.\d+)?$/.test(normalized) || !Number.isFinite(Number(normalized))) {
    return null;
  }
  return Number(normalized).toFixed(2);
}

/** Laravel ImportVaccineCodes::mapExcelColumns */
export function mapVaccineCodeExcelColumns(
  headers: string[],
): Partial<Record<'vaccineCode' | 'description' | 'componentCount', number>> {
  const map: Partial<Record<'vaccineCode' | 'description' | 'componentCount', number>> = {};
  const mappings: Record<string, readonly string[]> = {
    vaccineCode: ['vaccine_code', 'vaccine_codes', 'code', 'cpt', 'hcpcs'],
    description: ['descriptions', 'description', 'desc', 'short_description'],
    componentCount: [
      'of_vaccine_components',
      'number_of_vaccine_components',
      'num_of_vaccine_components',
      'vaccine_components',
      'component_count',
      'components',
    ],
  };
  for (const [field, possibleNames] of Object.entries(mappings)) {
    for (const name of possibleNames) {
      const index = headers.indexOf(name);
      if (index !== -1) {
        map[field as keyof typeof map] = index;
        break;
      }
    }
  }
  if (map.componentCount === undefined) {
    for (let index = 0; index < headers.length; index += 1) {
      const header = headers[index] ?? '';
      if (header.endsWith('vaccine_components') || header.includes('component')) {
        map.componentCount = index;
        break;
      }
    }
  }
  return map;
}

/** Laravel ImportVaccineCodes::parseComponentCount */
export function parseVaccineComponentCount(value: string | null): number | null {
  const trimmed = (value ?? '').trim();
  if (trimmed === '' || !/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return null;
  }
  return Math.max(0, Math.trunc(Number(trimmed)));
}

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

/** Laravel ImportAgeSpecificCptRules / ImportGenderSpecificCptRules — lowercase trim headers only. */
export function excelHeadersLowerTrim(row: string[]): string[] {
  return row.map((header) => String(header ?? '').trim().toLowerCase());
}

export function mapExcelColumnsByAliases(
  headers: string[],
  mappings: Record<string, readonly string[]>,
): Partial<Record<string, number>> {
  const map: Partial<Record<string, number>> = {};
  for (const [field, possibleNames] of Object.entries(mappings)) {
    for (const name of possibleNames) {
      const index = headers.indexOf(name);
      if (index !== -1) {
        map[field] = index;
        break;
      }
    }
  }
  return map;
}

/** Laravel ImportAgeSpecificCptRules::mapExcelColumns */
export function mapAgeSpecificCptExcelColumns(headers: string[]): Partial<Record<string, number>> {
  return mapExcelColumnsByAliases(headers, {
    cpt_code: ['cpt_code', 'cpt', 'code', 'cptcode', 'procedure_code', 'procedure code', 'hcpcs'],
    description: ['description', 'desc', 'name', 'procedure_description', 'procedure description'],
    low_limit: [
      'low_limit',
      'low',
      'min',
      'min_age',
      'minimum',
      'minimum_age',
      'low limit',
      'min age',
      'age_low',
      'from_age',
      'from age',
    ],
    high_limit: [
      'high_limit',
      'high',
      'max',
      'max_age',
      'maximum',
      'maximum_age',
      'high limit',
      'max age',
      'age_high',
      'to_age',
      'to age',
    ],
    unit: ['unit', 'units', 'age_unit', 'age unit', 'type'],
    gender: ['gender', 'sex', 'gender_restriction'],
    notes: ['notes', 'note', 'comments', 'comment', 'remarks'],
  });
}

/** Laravel ImportGenderSpecificCptRules::mapExcelColumns */
export function mapGenderSpecificCptExcelColumns(headers: string[]): Partial<Record<string, number>> {
  return mapExcelColumnsByAliases(headers, {
    cpt_code: ['cpt', 'cpt_code', 'cptcode', 'code', 'hcpc', 'hcpcs', 'procedure_code', 'procedure code'],
    description: [
      'description',
      'desc',
      'short_description',
      'short description',
      'long_description',
      'long description',
    ],
    gender: ['gender', 'sex', 'gender_restriction', 'applicable_gender', 'applicable gender'],
  });
}

/** Laravel ImportAgeSpecificIcdRules::mapExcelColumns (normalized headers). */
export function mapAgeSpecificIcdExcelColumns(headers: string[]): Partial<Record<string, number>> {
  return mapExcelColumnsByAliases(headers, {
    icd_code: ['icd_code', 'icd', 'code', 'icd10', 'icd_10', 'dx', 'diagnosis_code', 'dx_code'],
    description: ['description', 'desciption', 'desc', 'name', 'diagnosis_description'],
    low_limit: [
      'low_limit',
      'low',
      'lower_limit',
      'min',
      'min_age',
      'minimum',
      'minimum_age',
      'age_low',
      'from_age',
    ],
    upper_limit: [
      'upper_limit',
      'upper',
      'high_limit',
      'high',
      'max',
      'max_age',
      'maximum',
      'maximum_age',
      'age_high',
      'to_age',
    ],
    unit: ['unit', 'units', 'age_unit', 'type'],
  });
}

/** Laravel ImportTobaccoCounselingIcdRules::mapExcelColumns */
export function mapTobaccoCounselingIcdExcelColumns(headers: string[]): Partial<Record<string, number>> {
  return mapExcelColumnsByAliases(headers, {
    icd_code: ['icd_code', 'icd', 'icd_list', 'code', 'icd10', 'icd_10', 'dx', 'diagnosis_code'],
    description: ['description', 'desciption', 'desc', 'name', 'diagnosis_description'],
    indicator: ['indicator', 'indicater', 'ind', 'flag', 'counseling_indicator'],
  });
}

/** Laravel ImportModifierSequences::mapExcelColumns */
export function mapModifierSequenceExcelColumns(headers: string[]): Partial<Record<string, number>> {
  return mapExcelColumnsByAliases(headers, {
    sequence_order: ['order', 'sequence_order', 'seq', 'sequence', 'sort_order'],
    modifier: ['modifier', 'mod', 'modifier_code'],
    modifier_group: [
      'applied_to_the_group_of',
      'modifier_group',
      'group',
      'applied_group',
      'applied_to_group',
    ],
  });
}

/** Laravel ImportAgeSpecificCptRules::parseNumeric */
export function parseImportAgeNumeric(value: string | null): number | null {
  if (value === null || value === '') {
    return null;
  }
  const numeric = value.replace(/[^0-9.]/g, '');
  return numeric !== '' ? Math.trunc(Number(numeric)) : null;
}

/** Laravel age ICD / CPT unit parsers */
export function parseImportAgeUnit(value: string | null): string {
  if (value === null || value === '') {
    return 'years';
  }
  const normalized = value.trim().toLowerCase();
  if (['year', 'years', 'y', 'yr', 'yrs'].includes(normalized)) {
    return 'years';
  }
  if (['month', 'months', 'm', 'mo', 'mos'].includes(normalized)) {
    return 'months';
  }
  if (['day', 'days', 'd'].includes(normalized)) {
    return 'days';
  }
  return 'years';
}

/** Laravel ImportAgeSpecificCptRules::parseGender (default B). */
export function parseAgeSpecificCptGender(value: string | null): string {
  if (value === null || value === '') {
    return 'B';
  }
  const upper = value.trim().toUpperCase();
  if (['M', 'MALE', 'MAN', 'BOY'].includes(upper)) {
    return 'M';
  }
  if (['F', 'FEMALE', 'WOMAN', 'GIRL'].includes(upper)) {
    return 'F';
  }
  return 'B';
}

/** Laravel ImportGenderSpecificCptRules::parseGender (default M). */
export function parseGenderSpecificCptGender(value: string | null): string {
  if (value === null || value === '') {
    return 'M';
  }
  const upper = value.trim().toUpperCase();
  if (['M', 'MALE', 'MAN', 'BOY', '1'].includes(upper)) {
    return 'M';
  }
  if (['F', 'FEMALE', 'WOMAN', 'GIRL', '2'].includes(upper)) {
    return 'F';
  }
  return 'M';
}

/** Laravel ImportIcdGenderSpecificRules::parseGender */
export function parseIcdGenderSpecificGender(value: string | null): string {
  const upper = (value ?? '').trim().toUpperCase();
  if (['F', 'FEMALE', '2'].includes(upper)) {
    return 'F';
  }
  return 'M';
}

/** Laravel ImportTobaccoCounselingIcdRules::parseIndicator */
export function parseTobaccoCounselingIndicator(value: string | null): boolean {
  if (value === null || value === '') {
    return true;
  }
  const normalized = value.trim().toLowerCase();
  if (['0', 'false', 'no', 'n', 'off', '#n/a', 'n/a', 'na'].includes(normalized)) {
    return false;
  }
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) {
    return true;
  }
  return /^-?\d+(\.\d+)?$/.test(normalized);
}

/** Laravel ImportModifierSequences::parseInteger */
export function parseModifierSequenceOrder(value: string | null): number | null {
  if (value === null || value === '') {
    return null;
  }
  if (!/^-?\d+(\.\d+)?$/.test(value.trim())) {
    return null;
  }
  return Math.trunc(Number(value));
}
