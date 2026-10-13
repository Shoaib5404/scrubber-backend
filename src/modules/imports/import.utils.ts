import ExcelJS from 'exceljs';
import { accessSync, constants, readFileSync } from 'fs';
import * as path from 'path';
import { parse } from 'csv-parse/sync';
import * as XLSX from 'xlsx';

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

/**
 * Legacy BIFF `.xls` (OLE compound) — ExcelJS only reads OOXML `.xlsx`.
 * SheetJS (`xlsx`) mirrors Laravel PhpSpreadsheet coverage for NUCC taxonomy etc.
 */
export function loadLegacyXlsRows(filePath: string): string[][] {
  const workbook = XLSX.read(readFileSync(filePath), { type: 'buffer', cellDates: true });
  const sheetName =
    workbook.SheetNames.find((name) => name.toLowerCase() === 'sheet1') ?? workbook.SheetNames[0];
  if (!sheetName) {
    return [];
  }
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    return [];
  }
  const matrix = XLSX.utils.sheet_to_json<(string | number | Date | null | undefined)[]>(sheet, {
    header: 1,
    defval: '',
    raw: false,
  });
  return matrix.map((row) =>
    (row ?? []).map((value) => excelCellToTrimmedString(value === '' ? null : value)),
  );
}

function isLegacyXlsPath(filePath: string): boolean {
  return path.extname(filePath).toLowerCase() === '.xls';
}

/** Laravel ImportUhcAuthorizations::mapColumns */
/** Laravel Import* Excel helpers — prefer Sheet1, else first worksheet. */
export async function loadExcelRows(filePath: string): Promise<string[][]> {
  if (isLegacyXlsPath(filePath)) {
    return loadLegacyXlsRows(filePath);
  }

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

/** Laravel ImportCptCodes::parseDelimiter */
export function parseCptImportDelimiter(value: string | undefined): string | null {
  if (value === undefined || value.trim() === '') {
    return null;
  }
  const v = value.trim().toLowerCase();
  if (['tab', '\\t', 't'].includes(v)) {
    return '\t';
  }
  if ([',', 'comma', 'c'].includes(v)) {
    return ',';
  }
  return value;
}

/** Laravel ImportCptCodes::mapExcelColumns (lowercase trim headers). */
export function mapCptCodeExcelColumns(headers: string[]): Partial<Record<string, number>> {
  return mapExcelColumnsByAliases(headers, {
    name: [
      'hcpc',
      'hcpcs',
      'hcpc code',
      'hcpcs code',
      'cpt',
      'cpt_code',
      'cptcode',
      'code',
      'name',
      'procedure_code',
      'procedure code',
    ],
    description: [
      'description',
      'desc',
      'short_description',
      'short description',
      'long_description',
      'long description',
      'procedure_description',
      'procedure description',
    ],
    effective_date: [
      'effective_date',
      'effective date',
      'effdate',
      'eff_date',
      'eff date',
      'date',
      'start_date',
      'start date',
    ],
  });
}

/** Laravel ImportCptCodes::parseDate */
export function parseCptImportEffectiveDate(value: string | null): Date | null {
  if (value === null || value === '') {
    return null;
  }
  const trimmed = value.trim();
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    const serial = Number(trimmed);
    if (Number.isFinite(serial) && serial > 0 && serial < 100000) {
      const epoch = new Date(Date.UTC(1899, 11, 30));
      epoch.setUTCDate(epoch.getUTCDate() + Math.floor(serial));
      return epoch;
    }
  }
  return parseLabEffectiveDate(value);
}

/** Laravel ImportModifiers::parseDate */
export function parseModifierImportDate(value: string | null): Date | null {
  if (value === null || value === '') {
    return null;
  }
  const digits = value.replace(/\D/g, '');
  if (digits.length === 8) {
    const y = Number.parseInt(digits.slice(0, 4), 10);
    const m = Number.parseInt(digits.slice(4, 6), 10);
    const d = Number.parseInt(digits.slice(6, 8), 10);
    const date = new Date(Date.UTC(y, m - 1, d));
    if (date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d) {
      return date;
    }
  }
  return parseLabEffectiveDate(value);
}

/** Laravel ImportNdcCodes / crosswalk — first worksheet with a non-empty header row. */
export async function loadExcelRowsWithHeaderWorksheet(filePath: string): Promise<string[][]> {
  if (isLegacyXlsPath(filePath)) {
    const workbook = XLSX.read(readFileSync(filePath), { type: 'buffer', cellDates: true });
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) continue;
      const matrix = XLSX.utils.sheet_to_json<(string | number | Date | null | undefined)[]>(sheet, {
        header: 1,
        defval: '',
        raw: false,
      });
      const rows = matrix.map((row) =>
        (row ?? []).map((value) => excelCellToTrimmedString(value === '' ? null : value)),
      );
      const headers = (rows[0] ?? []).filter((header) => header.trim() !== '');
      if (headers.length > 0) {
        return rows;
      }
    }
    return loadLegacyXlsRows(filePath);
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  for (const sheet of workbook.worksheets) {
    const rows: string[][] = [];
    sheet.eachRow((row) => {
      const values = row.values;
      if (!Array.isArray(values)) {
        return;
      }
      rows.push(values.slice(1).map((value) => excelCellToTrimmedString(value)));
    });
    const headers = (rows[0] ?? []).filter((header) => header.trim() !== '');
    if (headers.length > 0) {
      return rows;
    }
  }

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
    rows.push(values.slice(1).map((value) => excelCellToTrimmedString(value)));
  });
  return rows;
}

/** Laravel ImportNdcCodes::mapExcelColumns */
export function mapNdcCodeExcelColumns(headers: string[]): Partial<Record<string, number>> {
  const normalized = headers.map((header) => normalizeHeader(String(header ?? '')));
  return mapExcelColumnsByAliases(normalized, {
    ndc: ['ndc', 'ndc_code', 'ndcpackagecode', 'national_drug_code'],
    package_description: ['package_description', 'packagedescription', 'description', 'ndc_label', 'label'],
  });
}

/** Laravel ImportNdcHcpcsCrosswalk::mapExcelColumns */
export function mapNdcHcpcsCrosswalkExcelColumns(headers: string[]): Partial<Record<string, number>> {
  const normalized = headers.map((header) => normalizeHeader(String(header ?? '')));
  return mapExcelColumnsByAliases(normalized, {
    ndc: ['ndc', 'ndc_code', 'national_drug_code'],
    hcpcs: ['hcpcs', 'hcpcs_code', 'hcpc', 'hcpc_code', 'code'],
    ndc_label: ['ndc_label', 'label', 'ndc_description', 'description', 'short_description'],
    hcpcs_amount: [
      'hcpcs_amount_1',
      'hcpcs_amount',
      'hcpcs_amount_number_1',
      'amount',
      'dosage_amount',
    ],
    hcpcs_measure: ['hcpcs_measure_1', 'hcpcs_measure', 'measure', 'unit', 'dosage_measure'],
    package_item_count: [
      'number_of_items_in_ndc_package',
      'package_item_count',
      'items_in_package',
      'ndc_package_items',
      'pkg_qty',
    ],
  });
}

/** Laravel ImportUhcPosCrosswalk::mapExcelColumns */
export function mapUhcPosCrosswalkExcelColumns(headers: string[]): Partial<Record<string, number>> {
  const normalized = headers.map((header) => normalizeHeader(String(header ?? '')));
  return mapExcelColumnsByAliases(normalized, {
    cpt_code: ['cpt', 'cpt_code', 'procedure_code', 'code', 'hcpcs'],
    pos_code: ['pos', 'pos_code', 'place_of_service', 'place_of_service_code'],
  });
}

/** Laravel ImportUhcPosCrosswalk::findHeaderRowIndex */
export function findUhcPosCrosswalkHeaderRowIndex(rows: string[][]): number {
  for (let index = 0; index < rows.length; index += 1) {
    const headers = (rows[index] ?? []).map((header) => normalizeHeader(String(header ?? '')));
    const map = mapUhcPosCrosswalkExcelColumns(headers);
    if (map.cpt_code !== undefined && map.pos_code !== undefined) {
      return index;
    }
  }
  return 0;
}

/** Laravel ImportUhcPosCrosswalk::normalizePosCode */
export function normalizeUhcPosCode(posCode: string): string | null {
  const trimmed = posCode.trim();
  if (trimmed === '') {
    return null;
  }
  return trimmed.padStart(2, '0');
}

/** Laravel ImportTaxonomyCodes::mapExcelColumns */
export function mapTaxonomyCodeExcelColumns(headers: string[]): Partial<Record<string, number>> {
  const normalized = headers.map((header) => normalizeHeader(String(header ?? '')));
  return mapExcelColumnsByAliases(normalized, {
    taxonomy_code: ['taxonomy_code', 'taxonomy_codes', 'taxonomy', 'code', 'nucc_code'],
    specialty_name: ['specialty_name', 'speciality_name', 'specialty', 'speciality', 'name', 'description'],
  });
}

/** Laravel ImportNdcHcpcsCrosswalk::parseNumeric */
export function parseImportOptionalFloat(value: string | null): number | null {
  if (value === null || value === '') {
    return null;
  }
  const normalized = value.trim();
  if (normalized === '' || !/^-?\d+(\.\d+)?$/.test(normalized)) {
    return null;
  }
  return Number(normalized);
}

/** Laravel ImportNdcHcpcsCrosswalk::parseInteger */
export function parseImportOptionalInteger(value: string | null): number | null {
  const numeric = parseImportOptionalFloat(value);
  return numeric === null ? null : Math.round(numeric);
}

/** PHP ctype_digit — non-empty string of ASCII digits only. */
export function isDigitsOnly(value: string): boolean {
  return value.length > 0 && /^\d+$/.test(value);
}

/** Laravel ImportCptPosRules::handle — pad CPT to 5 only when numeric-only. */
export function padCptPosCptCode(value: string): string {
  return isDigitsOnly(value) ? value.padStart(5, '0') : value;
}

/** Laravel ImportCptPosRules::handle — POS is always left-padded to 2 chars. */
export function padCptPosPosCode(value: string): string {
  return value.padStart(2, '0');
}

/** Laravel ImportCptPosRules::handle::payerId normalization. */
export function parseCptPosPayerId(value: string | null): string | null {
  const trimmed = (value ?? '').trim();
  if (trimmed === '' || trimmed === 'NULL') {
    return null;
  }
  if (isDigitsOnly(trimmed) && trimmed.length < 5) {
    return trimmed.padStart(5, '0');
  }
  return trimmed;
}

/** Laravel ImportCptPosRules::handle::isDeleted — (int) cell === 1. */
export function parseCptPosIsDeleted(value: string | null): boolean {
  if (value === null || value.trim() === '') {
    return false;
  }
  return Number(value) === 1;
}

/** Laravel ImportCptModifierRules::handle — modifier code is always left-padded to 2 chars. */
export function padCptModifierCode(value: string): string {
  return value.padStart(2, '0');
}

/** Laravel ImportCptModifierRules::handle::isAllowed — defaults true when cell absent. */
export function parseCptModifierIsAllowed(value: string | null): boolean {
  if (value === null || value.trim() === '') {
    return true;
  }
  return Number(value) === 1;
}

/** Laravel ImportCptModifierRules::handle::payerId normalization (no padding, unlike POS). */
export function parseCptModifierPayerId(value: string | null): string | null {
  const trimmed = (value ?? '').trim();
  if (trimmed === '' || trimmed === 'NULL') {
    return null;
  }
  return trimmed;
}

/** Laravel ImportZipCodes::mapColumns */
export function mapZipCodeExcelColumns(
  headers: string[],
): Partial<Record<'zip_code' | 'zip_code_type' | 'city' | 'state_name' | 'state', number>> {
  return mapExcelColumnsByAliases(headers, {
    zip_code: ['vzipcode', 'zip_code', 'zipcode', 'zip'],
    zip_code_type: ['zipcodetype', 'zip_code_type', 'ziptype', 'type'],
    city: ['vcity', 'city'],
    state_name: ['vstatename', 'state_name', 'statename'],
    state: ['vstate', 'state', 'state_code', 'statecode'],
  }) as Partial<Record<'zip_code' | 'zip_code_type' | 'city' | 'state_name' | 'state', number>>;
}

/** Laravel ImportZipCodes::normalizeZip — ZIP-5, left-padded, non-digits stripped. */
export function normalizeZip(value: string | null): string | null {
  if (value === null || value.trim() === '') {
    return null;
  }
  const digits = value.replace(/\D+/g, '');
  if (digits === '') {
    return null;
  }
  return digits.slice(0, 5).padStart(5, '0');
}

/** Laravel ImportZipCodes::normalizeZipCodeType */
export function normalizeZipCodeType(value: string | null): string | null {
  if (value === null || value.trim() === '') {
    return null;
  }
  const type = value.trim().toUpperCase();
  return type === '' ? null : type.slice(0, 5);
}

/** Laravel ImportZipCodes::normalizeState — only accepted when exactly 2 chars. */
export function normalizeZipState(value: string | null): string | null {
  if (value === null || value.trim() === '') {
    return null;
  }
  const state = value.trim().toUpperCase();
  return state.length === 2 ? state : null;
}

/** Excel serial date (epoch 1899-12-30, matches Laravel's Carbon::create(1899, 12, 30)). */
export function excelSerialToDate(serial: number): Date {
  const epoch = new Date(Date.UTC(1899, 11, 30));
  epoch.setUTCDate(epoch.getUTCDate() + Math.trunc(serial));
  return epoch;
}

/** Laravel ImportMuePractitioners::normalizeNumericCell */
export function parseMueNumericCell(value: string | number | null): string | null {
  if (value === null) {
    return null;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      return null;
    }
    const asString = String(value);
    if (/^\d+\.0+$/.test(asString)) {
      return String(Math.trunc(value));
    }
    return asString.trim();
  }
  const trimmed = value.trim();
  if (trimmed !== '' && /^\d+(\.\d+)?$/.test(trimmed)) {
    if (/^\d+\.0+$/.test(trimmed)) {
      return String(Math.trunc(Number(trimmed)));
    }
    return trimmed;
  }
  return trimmed === '' ? null : trimmed;
}

/** Laravel ImportMuePractitioners::parseEffectiveDate */
export function parseMueEffectiveDate(value: string | number | Date | null): Date | null {
  if (value === null) {
    return null;
  }
  if (value instanceof Date) {
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? excelSerialToDate(value) : null;
  }
  const trimmed = value.trim();
  if (trimmed === '') {
    return null;
  }
  // Laravel's is_numeric() check runs before the 8-digit guard, but real Excel date cells
  // arrive as DateTimeInterface there (short-circuited above) rather than literal YYYYMMDD
  // strings. loadExcelRows already stringifies Date cells to "YYYYMMDD" (see
  // excelCellToTrimmedString), so bound the serial-number branch like
  // parseCptImportEffectiveDate does to avoid misreading those 8-digit strings as serials.
  if (/^\d+(\.\d+)?$/.test(trimmed) && Number(trimmed) < 100000) {
    return excelSerialToDate(Number(trimmed));
  }
  if (/^\d{8}$/.test(trimmed)) {
    const y = Number.parseInt(trimmed.slice(0, 4), 10);
    const m = Number.parseInt(trimmed.slice(4, 6), 10);
    const d = Number.parseInt(trimmed.slice(6, 8), 10);
    const date = new Date(Date.UTC(y, m - 1, d));
    return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
      ? date
      : null;
  }
  const parsed = Date.parse(trimmed);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  const date = new Date(parsed);
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
}

/**
 * Load one worksheet by preferred name (exact match first, then substring match),
 * falling back to the active/first worksheet. Mirrors Laravel Aetna/Cigna resolveWorksheet.
 */
export async function loadExcelWorkbook(filePath: string): Promise<ExcelJS.Workbook> {
  if (isLegacyXlsPath(filePath)) {
    // Materialize BIFF `.xls` into an ExcelJS workbook so callers can keep using
    // worksheet helpers (resolveWorksheetByPreferredNames / worksheetToRows).
    const legacy = XLSX.read(readFileSync(filePath), { type: 'buffer', cellDates: true });
    const workbook = new ExcelJS.Workbook();
    for (const sheetName of legacy.SheetNames) {
      const sheet = legacy.Sheets[sheetName];
      if (!sheet) continue;
      const matrix = XLSX.utils.sheet_to_json<(string | number | Date | null | undefined)[]>(sheet, {
        header: 1,
        defval: '',
        raw: false,
      });
      const ws = workbook.addWorksheet(sheetName);
      for (const row of matrix) {
        ws.addRow(
          (row ?? []).map((value) => excelCellToTrimmedString(value === '' ? null : value)),
        );
      }
    }
    return workbook;
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  return workbook;
}

export function resolveWorksheetByPreferredNames(
  workbook: ExcelJS.Workbook,
  preferredNames: readonly string[],
): ExcelJS.Worksheet {
  for (const name of preferredNames) {
    const sheet = workbook.getWorksheet(name);
    if (sheet) {
      return sheet;
    }
  }
  for (const sheet of workbook.worksheets) {
    for (const name of preferredNames) {
      if (sheet.name.toLowerCase().includes(name.toLowerCase())) {
        return sheet;
      }
    }
  }
  return workbook.worksheets[0] as ExcelJS.Worksheet;
}

export function worksheetToRows(sheet: ExcelJS.Worksheet): string[][] {
  const rows: string[][] = [];
  sheet.eachRow((row) => {
    const values = row.values;
    if (!Array.isArray(values)) {
      return;
    }
    rows.push(values.slice(1).map((value) => excelCellToTrimmedString(value)));
  });
  return rows;
}

/** Shared Laravel Aetna/Cigna findHeaderRowIndex — matches the first column against aliases. */
export function findHeaderRowIndexByFirstColumn(rows: string[][], headerAliases: readonly string[]): number {
  const normalizedAliases = headerAliases.map((alias) => normalizeHeader(alias));
  for (let index = 0; index < rows.length; index += 1) {
    const header = normalizeHeader(String(rows[index]?.[0] ?? ''));
    if (normalizedAliases.includes(header)) {
      return index;
    }
  }
  return 0;
}

/** Laravel ImportAetnaB12Lcd/ImportAetnaFetalLcd::extractCptCodesFromSheet (also used by Cigna HCPCS sheet). */
export function extractSingleColumnCodes(
  rows: string[][],
  headerRowIndex: number,
  uppercase: boolean,
): string[] {
  const seen = new Set<string>();
  const codes: string[] = [];
  for (let i = headerRowIndex + 1; i < rows.length; i += 1) {
    const raw = (rows[i]?.[0] ?? '').trim();
    const value = uppercase ? raw.toUpperCase() : raw;
    if (value !== '' && !seen.has(value)) {
      seen.add(value);
      codes.push(value);
    }
  }
  return codes;
}

/**
 * Laravel ImportAetnaB12Lcd/ImportAetnaFetalLcd::normalizeIcdSource — spreadsheet ICD cells may
 * use commas as decimal separators; placeholder-only cells (·, ., -) are blanked.
 */
export function normalizeIcdSource(source: string): string {
  const normalized = source.replace(/,/g, '.').trim();
  if (normalized === '' || /^[\s.\-·•]+$/u.test(normalized)) {
    return '';
  }
  return normalized;
}

/** Laravel ImportAetnaB12Lcd/ImportAetnaFetalLcd/ImportCignaCptIcdCrosswalk::formatStoredIcd. */
export function formatStoredIcd(icd: string): string {
  return icd.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Laravel ImportAetnaB12Lcd/ImportAetnaFetalLcd::isValidStoredIcd */
export function isValidStoredIcd(icd: string): boolean {
  return /^[A-TV-Z][0-9][0-9A-Z]/i.test(icd);
}

/** Laravel ImportAetnaB12Lcd/ImportAetnaFetalLcd::parseIcdRange */
export function parseIcdRange(source: string): { start: string; end: string } | null {
  const parts = source.trim().split(/\s*[-–—]\s*/u);
  if (parts.length !== 2) {
    return null;
  }
  const start = (parts[0] ?? '').trim();
  const end = (parts[1] ?? '').trim();
  return start === '' || end === '' ? null : { start, end };
}

/** Laravel ImportAetnaB12Lcd/ImportAetnaFetalLcd::normalizeIcdCode (for tabular range bounds). */
export function normalizeIcdCodeForRange(code: string): string {
  return code.trim().toUpperCase().replace(/\./g, '');
}

/**
 * Laravel ImportCignaCptIcdCrosswalk::expandIcdCodesFromCell — splits on newlines/commas/
 * semicolons, then on bare dashes, validating each resulting token (no tabular range expansion).
 */
export function expandCignaIcdCell(cell: string): string[] {
  const pattern = /^[A-TV-Z][0-9][0-9A-Z](?:\.[0-9A-ZxX]{1,4})?[A-Z]?$/i;
  const codes: string[] = [];
  for (const part of cell.split(/[\r\n,;]+/)) {
    const trimmedPart = part.trim();
    if (trimmedPart === '') {
      continue;
    }
    for (const codeCandidate of trimmedPart.split(/\s*-\s*/)) {
      const code = codeCandidate.trim().toUpperCase();
      if (code !== '' && pattern.test(code)) {
        codes.push(code);
      }
    }
  }
  return codes;
}

/** Laravel ImportCignaCptIcdCrosswalk::extractCodesFromSheet header aliases. */
export const CIGNA_HCPCS_HEADER_ALIASES = ['hcpcs', 'cpt', 'cpt_code', 'code', 'procedure_code'] as const;

/** Laravel ImportCignaCptIcdCrosswalk::extractIcdCodesFromSheet header aliases. */
export const CIGNA_ICD_HEADER_ALIASES = [
  'icd',
  'icd_code',
  'icd10',
  'icd_10',
  'diagnosis',
  'covered_icd_10_codes',
] as const;

/** Laravel ImportAetnaB12Lcd/ImportAetnaFetalLcd::extractCptCodesFromSheet header aliases. */
export const AETNA_CPT_HEADER_ALIASES = ['cpt', 'cpt_code', 'hcpcs', 'hcpc', 'code', 'procedure_code'] as const;

/** Laravel ImportAetnaB12Lcd/ImportAetnaFetalLcd::extractIcdRowsFromSheet header aliases. */
export const AETNA_ICD_HEADER_ALIASES = ['code', 'icd', 'icd_code', 'icd10'] as const;

/** Laravel Aetna B12/Fetal preferred worksheet names. */
export const AETNA_CPT_SHEET_NAMES = ['CPT', 'HCPCS', 'HCPC', 'Procedure'] as const;
export const AETNA_ICD_SHEET_NAMES = ['ICDs', 'ICD', 'ICD10', 'ICD-10', 'Diagnosis'] as const;

/** Laravel ImportCignaCptIcdCrosswalk preferred worksheet names. */
export const CIGNA_CPT_SHEET_NAMES = ['HCPCS', 'CPT', 'HCPC'] as const;
export const CIGNA_ICD_SHEET_NAMES = ['ICD', 'ICD10', 'ICD-10'] as const;

/** Generic chunk helper for array batching (Laravel array_chunk equivalent). */
export function chunkArray<T>(items: readonly T[], size: number): T[][] {
  if (size <= 0) {
    return [[...items]];
  }
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push([...items.slice(i, i + size)]);
  }
  return chunks;
}

/** Laravel ImportAddOnCodes::getIntCellValue (is_numeric guard, then (int) cast — truncates). */
export function parseOptionalIntCast(value: string | null): number | null {
  if (value === null || value === '') {
    return null;
  }
  const trimmed = value.trim();
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return null;
  }
  return Math.trunc(Number(trimmed));
}

/** Laravel ImportAddOnCodes::getDateFromJulianCell — 7-digit YYYYDDD string -> date. */
export function parseJulianDateCell(value: string | null): Date | null {
  if (value === null || value === '') {
    return null;
  }
  const digits = value.replace(/\D/g, '');
  if (digits.length !== 7) {
    return null;
  }
  const year = Number.parseInt(digits.slice(0, 4), 10);
  const dayOfYear = Number.parseInt(digits.slice(4, 7), 10);
  if (year < 1900 || dayOfYear < 1 || dayOfYear > 366) {
    return null;
  }
  const date = new Date(Date.UTC(year, 0, 1));
  date.setUTCDate(date.getUTCDate() + dayOfYear - 1);
  return date;
}

/** Laravel ImportAddOnCodes — normalized AOC field keys, in fixed positional order. */
export const ADD_ON_CODE_FIELD_ORDER = [
  'primary_code',
  'aoc_edit_type',
  'add_on_code',
  'aoc_deldt',
  'primary_code_deldt',
  'aoc_edit_effdt',
  'aoc_edit_deldt',
  'special_instruction_notes',
] as const;

/**
 * Laravel ImportAddOnCodes::importFromExcelFile column mapping — match headers by normalized
 * name, default primary_code to the first column, and fall back to the fixed positional AOC
 * layout when most fields remain unmapped and the sheet has at least 8 columns.
 */
export function mapAddOnCodeExcelColumns(
  headers: string[],
): Record<(typeof ADD_ON_CODE_FIELD_ORDER)[number], number | null> {
  const fieldColumns: Record<(typeof ADD_ON_CODE_FIELD_ORDER)[number], number | null> = {
    primary_code: null,
    aoc_edit_type: null,
    add_on_code: null,
    aoc_deldt: null,
    primary_code_deldt: null,
    aoc_edit_effdt: null,
    aoc_edit_deldt: null,
    special_instruction_notes: null,
  };

  for (let index = 0; index < headers.length; index += 1) {
    const key = headers[index] as (typeof ADD_ON_CODE_FIELD_ORDER)[number] | string;
    if ((ADD_ON_CODE_FIELD_ORDER as readonly string[]).includes(key)) {
      fieldColumns[key as (typeof ADD_ON_CODE_FIELD_ORDER)[number]] = index;
    }
  }

  if (fieldColumns.primary_code === null) {
    fieldColumns.primary_code = 0;
  }

  const unmappedCount = ADD_ON_CODE_FIELD_ORDER.filter((key) => fieldColumns[key] === null).length;
  if (unmappedCount > 0 && headers.length >= 8) {
    ADD_ON_CODE_FIELD_ORDER.forEach((key, index) => {
      fieldColumns[key] = index;
    });
  }

  return fieldColumns;
}

/** Laravel ImportMcrVaccineCodes::mapExcelColumns */
export function mapMcrVaccineCodeExcelColumns(
  headers: string[],
): Partial<Record<'vaccine_code' | 'icd10_code' | 'administration_code', number>> {
  return mapExcelColumnsByAliases(headers, {
    vaccine_code: ['vaccine_codes', 'vaccine_code', 'vaccine', 'code', 'cpt', 'hcpcs'],
    icd10_code: ['icd_10_code', 'icd10_code', 'icd_10_cpde', 'icd10_cpde', 'icd10', 'icd'],
    administration_code: ['administration', 'administration_code', 'admin_code', 'admin'],
  }) as Partial<Record<'vaccine_code' | 'icd10_code' | 'administration_code', number>>;
}

/** Laravel ImportMcrVaccineCodes::resolveTypeFromSheet */
export function resolveMcrVaccineCodeType(sheetTitle: string): string | null {
  const normalized = sheetTitle.trim().toLowerCase();
  const aliases: Record<string, string> = {
    flu: 'Flu',
    influenza: 'Flu',
    pneumococcal: 'Pneumococcal',
    pneumo: 'Pneumococcal',
    hepatitis: 'Hepatitis',
    hep: 'Hepatitis',
  };
  if (aliases[normalized] !== undefined) {
    return aliases[normalized];
  }
  for (const type of ['Flu', 'Pneumococcal', 'Hepatitis']) {
    if (type.toLowerCase() === normalized) {
      return type;
    }
  }
  return null;
}

/** Laravel ImportIcd10BodySidewise::handle column mapping (1-indexed Laravel defaults -> 0-indexed here). */
export function mapIcd10BodySidewiseColumns(headers: string[]): {
  code: number;
  description: number;
  side: number;
} {
  const codeIndex = headers.indexOf('code');
  const descriptionIndex =
    headers.indexOf('long_discription') !== -1
      ? headers.indexOf('long_discription')
      : headers.indexOf('long_description');
  const sideIndex = headers.indexOf('side');

  return {
    code: codeIndex !== -1 ? codeIndex : 1,
    description: descriptionIndex !== -1 ? descriptionIndex : 2,
    side: sideIndex !== -1 ? sideIndex : 3,
  };
}

/** Laravel ImportIcd10UnacceptablePrincipalDxCodes::parseClaimType */
export function parseIcd10ClaimType(value: string | null): number | null {
  const normalized = (value ?? '').trim().toLowerCase();
  switch (normalized) {
    case '1':
    case 'professional':
    case 'prof':
      return 1;
    case '2':
    case 'institutional':
    case 'inst':
      return 2;
    default:
      return null;
  }
}

/** Laravel ImportIcd10UnacceptablePrincipalDxCodes::parseActive */
export function parseIcd10ActiveFlag(value: string | null): boolean {
  const normalized = (value ?? '').trim().toLowerCase();
  return !['0', 'false', 'inactive', 'no', 'n'].includes(normalized);
}

/** Laravel ImportNcdOtherLab/ImportNcdOtherLabCodes::normalizeCode (RichText/number handling
 * collapses to string trimming here because loadExcelRows already stringifies every cell). */
export function normalizeNcdLabCode(value: string | null): string | null {
  if (value === null) {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed === '') {
    return null;
  }
  return trimmed.length > 20 ? trimmed.slice(0, 20) : trimmed;
}

/** Laravel ImportNcdOtherLab/ImportNcdOtherLabCodes::looksLikeHeaderLabel */
export function looksLikeNcdLabHeaderLabel(code: string): boolean {
  const upper = code.toUpperCase();
  return (
    upper === 'CPT' ||
    upper === 'ICD' ||
    upper === 'ICD-10 CM' ||
    upper.includes('ICD-10') ||
    upper.includes('ICD10')
  );
}

/** Laravel ImportNcdOtherLab/ImportNcdOtherLabCodes::readCodesColumn (column A, skip header row). */
export function readNcdLabCodesColumn(rows: string[][]): string[] {
  const seen = new Set<string>();
  for (const row of rows.slice(1)) {
    const code = normalizeNcdLabCode(row[0] ?? null);
    if (code === null || looksLikeNcdLabHeaderLabel(code)) {
      continue;
    }
    seen.add(code);
  }
  return [...seen].sort();
}

/**
 * Laravel ImportNcci::parseNcciDate — '*' marks "no date"; 8-digit Ymd strings and Excel
 * serials (loadExcelRows already stringifies Date cells to "YYYYMMDD", see
 * excelCellToTrimmedString) map to UTC dates, same bounding as parseMueEffectiveDate.
 */
export function parseNcciDate(value: string | null): Date | null {
  const trimmed = (value ?? '').trim();
  if (trimmed === '' || trimmed === '*') {
    return null;
  }
  if (/^\d{8}$/.test(trimmed)) {
    const y = Number.parseInt(trimmed.slice(0, 4), 10);
    const m = Number.parseInt(trimmed.slice(4, 6), 10);
    const d = Number.parseInt(trimmed.slice(6, 8), 10);
    const date = new Date(Date.UTC(y, m - 1, d));
    return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
      ? date
      : null;
  }
  if (/^\d+(\.\d+)?$/.test(trimmed) && Number(trimmed) < 100000) {
    return excelSerialToDate(Number(trimmed));
  }
  const parsed = Date.parse(trimmed);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  const date = new Date(parsed);
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
}

/** Laravel ImportNcci::parseModifier — only 0/1/9 are valid NCCI modifier indicators. */
export function parseNcciModifier(value: string | null): number {
  const trimmed = (value ?? '').trim();
  return ['0', '1', '9'].includes(trimmed) ? Number(trimmed) : 0;
}

/** Laravel ImportNcci::handle — column 3 cell `'*'` means "in existence prior to 1996". */
export function parseNcciInExistencePriorTo1996(value: string | null): boolean {
  return (value ?? '').trim() === '*';
}

/** Laravel ImportNcci::detectSourceLabel — e.g. "ncci_2.xlsx" -> "ncci_2". */
export function detectNcciSourceLabel(filePath: string): string {
  const filename = path.basename(filePath, path.extname(filePath));
  const match = /ncci[_-]?(\d)/i.exec(filename);
  return match ? `ncci_${match[1]}` : filename;
}
