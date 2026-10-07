import { ClaimIssue } from '../types';

export type AgeSpecificCptRuleRow = {
  id: number;
  cpt_code: string;
  low_limit: number | null;
  high_limit: number | null;
  unit: string;
  gender: string | null;
};

export type GenderSpecificCptRuleRow = {
  id: number;
  cpt_code: string;
  gender: string;
};

export type CptAgeGenderServiceLineInput = {
  lineNumber: number;
  procedureCode: string;
  serviceDateFrom?: string | Date | null;
};

function parseDate(value: string | Date | null | undefined): Date | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatYmd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function diffParts(dob: Date, serviceDate: Date): { y: number; m: number; d: number } {
  let y = serviceDate.getUTCFullYear() - dob.getUTCFullYear();
  let m = serviceDate.getUTCMonth() - dob.getUTCMonth();
  let d = serviceDate.getUTCDate() - dob.getUTCDate();
  if (d < 0) {
    m -= 1;
    const prevMonth = new Date(Date.UTC(serviceDate.getUTCFullYear(), serviceDate.getUTCMonth(), 0));
    d += prevMonth.getUTCDate();
  }
  if (m < 0) {
    y -= 1;
    m += 12;
  }
  return { y, m, d };
}

function calculateAgeInYears(dob: Date, serviceDate: Date): number {
  const { y, m, d } = diffParts(dob, serviceDate);
  const fractionalYears = y + m / 12 + d / 365.25;
  return Math.round(fractionalYears * 100) / 100;
}

function calculateAgeInMonths(dob: Date, serviceDate: Date): number {
  const { y, m, d } = diffParts(dob, serviceDate);
  const totalMonths = y * 12 + m + d / 30.44;
  return Math.round(totalMonths * 100) / 100;
}

function calculateAgeInDays(dob: Date, serviceDate: Date): number {
  const ms = serviceDate.getTime() - dob.getTime();
  return ms / (1000 * 60 * 60 * 24);
}

function calculateAge(rule: AgeSpecificCptRuleRow, dob: Date, serviceDate: Date): number {
  if (serviceDate.getTime() < dob.getTime()) {
    return 0;
  }
  switch (rule.unit) {
    case 'months':
      return calculateAgeInMonths(dob, serviceDate);
    case 'days':
      return calculateAgeInDays(dob, serviceDate);
    case 'years':
    default:
      return calculateAgeInYears(dob, serviceDate);
  }
}

function ageLimitDisplay(rule: AgeSpecificCptRuleRow): string {
  const unit = rule.unit;
  if (rule.low_limit !== null && rule.high_limit !== null) {
    return `${rule.low_limit} - ${rule.high_limit} ${unit}`;
  }
  if (rule.low_limit !== null) {
    return `${rule.low_limit}+ ${unit}`;
  }
  if (rule.high_limit !== null) {
    return `0 - ${rule.high_limit} ${unit}`;
  }
  return 'All ages';
}

function formatAgeForDisplay(dob: Date, serviceDate: Date): string {
  const ageInYears = calculateAgeInYears(dob, serviceDate);
  if (ageInYears < 1) {
    const ageInMonths = calculateAgeInMonths(dob, serviceDate);
    return `${Math.round(ageInMonths * 10) / 10} months`;
  }
  const { y, m } = diffParts(dob, serviceDate);
  const yearLabel = y === 1 ? 'year' : 'years';
  if (m === 0) {
    return `${y} ${yearLabel}`;
  }
  const monthLabel = m === 1 ? 'month' : 'months';
  return `${y} ${yearLabel} and ${m} ${monthLabel}`;
}

function genderDisplayForAgeRule(gender: string | null): string {
  switch (gender) {
    case 'M':
      return 'Male only';
    case 'F':
      return 'Female only';
    case 'B':
      return 'Both';
    default:
      return 'Unknown';
  }
}

function genderDisplayForGenderRule(gender: string): string {
  return gender === 'M' ? 'Male Only' : gender === 'F' ? 'Female Only' : 'Unknown';
}

function isAgeValid(rule: AgeSpecificCptRuleRow, dob: Date, serviceDate: Date): boolean {
  const age = calculateAge(rule, dob, serviceDate);
  if (rule.low_limit !== null && age < rule.low_limit) {
    return false;
  }
  if (rule.high_limit !== null && age > rule.high_limit) {
    return false;
  }
  return true;
}

/** Laravel AgeSpecificCptRule::validate — mapped to AGE-* ClaimIssue rows. */
export function validateAgeRuleForLine(
  rule: AgeSpecificCptRuleRow,
  line: CptAgeGenderServiceLineInput,
  patientDob: string | Date | null | undefined,
  patientGender: string | null | undefined,
): ClaimIssue[] {
  const prefix = `service_lines.${line.lineNumber}`;
  const dob = parseDate(patientDob);

  if (!dob) {
    return [
      {
        rule: 'AGE-001',
        field: 'patient_dob',
        message: `Line ${line.lineNumber}: Patient DOB required to validate age-specific CPT ${line.procedureCode}`,
        severity: 'error',
      },
    ];
  }

  const serviceDate = parseDate(line.serviceDateFrom ?? null) ?? new Date();
  if (serviceDate.getTime() < dob.getTime()) {
    return [
      {
        rule: 'AGE-004',
        field: `${prefix}.service_date_from`,
        message: `Line ${line.lineNumber}: Service date (${formatYmd(serviceDate)}) cannot be before patient DOB (${formatYmd(dob)})`,
        severity: 'error',
      },
    ];
  }

  const errors: ClaimIssue[] = [];
  if (!isAgeValid(rule, dob, serviceDate)) {
    const actualAgeDisplay = formatAgeForDisplay(dob, serviceDate);
    errors.push({
      rule: 'AGE-002',
      field: `${prefix}.procedure_code`,
      message: `Line ${line.lineNumber}: CPT code ${rule.cpt_code} requires patient age ${ageLimitDisplay(rule)}. Patient age is ${actualAgeDisplay}.`,
      severity: 'error',
    });
  }

  if (patientGender && rule.gender && rule.gender !== 'B' && rule.gender !== patientGender) {
    errors.push({
      rule: 'AGE-003',
      field: `${prefix}.procedure_code`,
      message: `Line ${line.lineNumber}: CPT code ${rule.cpt_code} is only applicable for ${genderDisplayForAgeRule(rule.gender)}. Patient gender is ${patientGender}.`,
      severity: 'error',
    });
  }

  return errors;
}

/** Laravel GenderSpecificCptRule::validate — mapped to GEN-* ClaimIssue rows. */
export function validateGenderRuleForLine(
  rule: GenderSpecificCptRuleRow,
  line: CptAgeGenderServiceLineInput,
  patientGender: string | null | undefined,
): ClaimIssue[] {
  const prefix = `service_lines.${line.lineNumber}`;

  if (!patientGender || patientGender.trim() === '') {
    return [
      {
        rule: 'GEN-001',
        field: `${prefix}.procedure_code`,
        message: `Line ${line.lineNumber}: Patient gender is required to validate gender-specific CPT ${rule.cpt_code}`,
        severity: 'error',
      },
    ];
  }

  if (rule.gender !== patientGender) {
    const patientGenderDisplay = patientGender === 'M' ? 'Male' : 'Female';
    return [
      {
        rule: 'GEN-002',
        field: `${prefix}.procedure_code`,
        message: `Line ${line.lineNumber}: CPT code ${rule.cpt_code} is only applicable for ${genderDisplayForGenderRule(rule.gender)}. Patient gender is ${patientGenderDisplay}.`,
        severity: 'error',
      },
    ];
  }

  return [];
}

export function hydrateAgeRuleFromJoinedRow(row: {
  cpt_code: string;
  age_rule_id?: number | null;
  low_limit?: number | null;
  high_limit?: number | null;
  unit?: string | null;
  age_gender?: string | null;
}): AgeSpecificCptRuleRow | null {
  if (row.age_rule_id === null || row.age_rule_id === undefined) {
    return null;
  }
  return {
    id: row.age_rule_id,
    cpt_code: row.cpt_code,
    low_limit: row.low_limit ?? null,
    high_limit: row.high_limit ?? null,
    unit: row.unit ?? 'years',
    gender: row.age_gender ?? null,
  };
}

export function hydrateGenderRuleFromJoinedRow(row: {
  cpt_code: string;
  gender_rule_id?: number | null;
  required_gender?: string | null;
}): GenderSpecificCptRuleRow | null {
  if (row.gender_rule_id === null || row.gender_rule_id === undefined || !row.required_gender) {
    return null;
  }
  return {
    id: row.gender_rule_id,
    cpt_code: row.cpt_code,
    gender: row.required_gender,
  };
}
