import { ClaimIssue } from '../types';

/** Laravel IcdDiagnosisRules::TOBACCO_COUNSELING_RULE_CODE */
export const ICD_TC_001 = 'ICD-TC-001';

/** Laravel DescriptionType values used by tabular note validation */
export const ICD_DESC_EXCLUDE1 = 4;
export const ICD_DESC_EXCLUDE2 = 5;
export const ICD_DESC_ADDITIONAL_CODE = 3;
export const ICD_DESC_CODE_FIRST = 10;

const MEDICARE_FILING_INDICATORS: readonly string[] = ['MA', 'MB'];
const TOBACCO_COUNSELING_CPTS: readonly string[] = ['99406', '99407'];

export type IcdDiagnosisInput = {
  sequence: number;
  code: string | null;
  type?: string | null;
};

export type IcdDiagnosisServiceLineInput = {
  lineNumber: number;
  procedureCode: string | null;
  diagnosisPointers?: readonly (number | string)[];
  serviceDateFrom?: string | Date | null;
};

export type IcdDiagnosisClaimInput = {
  claimFilingIndicator: string | null;
  batchGsVersionCode?: string | null;
  patientDob?: string | Date | null;
  subscriberDob?: string | Date | null;
  patientGender?: string | null;
  subscriberGender?: string | null;
};

export type IcdGenderSpecificRuleRow = {
  id: number;
  icd_code: string;
  gender: string;
};

export type IcdAgeSpecificRuleRow = {
  id: number;
  icd_code: string;
  low_limit: number | null;
  upper_limit: number | null;
  unit: string;
};

/** Tabular instructional notes keyed by normalized ICD, then description_type int. */
export type IcdTabularNotesByCode = Readonly<
  Record<string, Readonly<Record<number, readonly string[]>> | undefined>
>;

export type IcdDiagnosisLookups = {
  /** Normalized billable codes present in icd10_tabular_codes */
  billableNormalizedCodes: Readonly<Record<string, true>>;
  notesByNormalizedCode: IcdTabularNotesByCode;
  /** indicator=true rows from tobacco_counseling_icd_rules for claim candidate ICDs */
  tobaccoCounselingApprovedIcd: Readonly<Record<string, true>>;
  /** Map from claim_type key to unacceptable principal code set (uppercase keys) */
  unacceptablePrincipalByClaimType: Readonly<Record<string, Readonly<Record<string, true>>>>;
  icdGenderRulesByNorm: Readonly<Record<string, IcdGenderSpecificRuleRow | undefined>>;
  icdAgeRulesByNorm: Readonly<Record<string, IcdAgeSpecificRuleRow | undefined>>;
};

export type IcdDiagnosisValidationResult = {
  errors: ClaimIssue[];
  warnings: ClaimIssue[];
};

/** Laravel Icd10UnacceptablePrincipalDiagnoseCode::resolveClaimTypeFromBatchVersion */
export function resolveClaimTypeFromBatchVersion(gsVersionCode: string | null | undefined): number {
  const version = String(gsVersionCode ?? '')
    .trim()
    .toUpperCase();
  if (version.includes('X223')) {
    return 2;
  }
  return 1;
}

/** Laravel IcdDiagnosisRules::validate */
export function validateIcdDiagnosis(
  claim: IcdDiagnosisClaimInput,
  diagnoses: readonly IcdDiagnosisInput[],
  serviceLines: readonly IcdDiagnosisServiceLineInput[],
  lookups: IcdDiagnosisLookups,
): IcdDiagnosisValidationResult {
  const filledDiagnoses = diagnoses.filter((d) => filled(d.code));

  let errors = validateTobaccoCounseling(claim, serviceLines, filledDiagnoses, lookups.tobaccoCounselingApprovedIcd);
  const warnings: ClaimIssue[] = [];

  if (filledDiagnoses.length === 0) {
    return { errors, warnings };
  }

  const existingNormalized = lookups.billableNormalizedCodes;

  for (const diagnosis of filledDiagnoses) {
    const norm = normalizeIcdCode(String(diagnosis.code));
    if (norm !== '' && !existingNormalized[norm]) {
      const seq = diagnosis.sequence ?? 0;
      errors.push({
        rule: 'ICD-VAL-001',
        field: seq > 0 ? `diagnoses.${seq}.code` : 'diagnoses',
        message: `Diagnosis code '${diagnosis.code}' is not valid, not found, or not billable in ICD-10-CM tabular data.`,
        severity: 'error',
      });
    }
  }

  const diagnosesForConventions = filledDiagnoses.filter((diagnosis) => {
    const norm = normalizeIcdCode(String(diagnosis.code));
    return norm !== '' && existingNormalized[norm] === true;
  });

  errors = [
    ...errors,
    ...validateUnacceptablePrincipal(filledDiagnoses, claim, lookups),
    ...validateGenderSpecific(diagnosesForConventions, claim, lookups.icdGenderRulesByNorm),
    ...validateAgeSpecific(diagnosesForConventions, claim, serviceLines, lookups.icdAgeRulesByNorm),
  ];

  if (diagnosesForConventions.length === 0) {
    return { errors, warnings };
  }

  const normalizedToDiagnoses: Record<string, IcdDiagnosisInput[]> = {};
  for (const diagnosis of diagnosesForConventions) {
    const norm = normalizeIcdCode(String(diagnosis.code));
    normalizedToDiagnoses[norm] ??= [];
    normalizedToDiagnoses[norm].push(diagnosis);
  }

  const emitted: Record<string, true> = {};

  for (const diagnosis of diagnosesForConventions) {
    const diagnosisCode = String(diagnosis.code);
    const diagnosisNorm = normalizeIcdCode(diagnosisCode);
    const diagnosisSeq = diagnosis.sequence ?? 0;
    const notes = lookups.notesByNormalizedCode[diagnosisNorm] ?? {};

    if (Object.keys(notes).length === 0) {
      continue;
    }

    const exclude1Notes = notes[ICD_DESC_EXCLUDE1] ?? [];
    for (const noteLine of exclude1Notes) {
      for (const pattern of extractCodePatterns(noteLine)) {
        for (const matched of findMatches(normalizedToDiagnoses, pattern, diagnosisNorm)) {
          const key = `ex1|${diagnosisNorm}|${normalizeIcdCode(String(matched.code))}`;
          if (emitted[key]) {
            continue;
          }
          emitted[key] = true;
          errors.push({
            rule: 'ICD-EX1-001',
            field: 'diagnoses',
            message: `Excludes1 conflict: ${diagnosisCode} cannot be reported with ${matched.code} on the same claim.`,
            severity: 'error',
          });
        }
      }
    }

    const exclude2Notes = notes[ICD_DESC_EXCLUDE2] ?? [];
    for (const noteLine of exclude2Notes) {
      for (const pattern of extractCodePatterns(noteLine)) {
        for (const matched of findMatches(normalizedToDiagnoses, pattern, diagnosisNorm)) {
          const key = `ex2|${diagnosisNorm}|${normalizeIcdCode(String(matched.code))}`;
          if (emitted[key]) {
            continue;
          }
          emitted[key] = true;
          warnings.push({
            rule: 'ICD-EX2-001',
            field: 'diagnoses',
            message: `Excludes2 pair present: ${diagnosisCode} with ${matched.code}. Verify documentation supports coexistence.`,
            severity: 'warning',
          });
        }
      }
    }

    const codeFirstNotes = notes[ICD_DESC_CODE_FIRST] ?? [];
    for (const noteLine of codeFirstNotes) {
      for (const pattern of extractCodePatterns(noteLine)) {
        const matches = findMatches(normalizedToDiagnoses, pattern, diagnosisNorm);
        if (matches.length === 0) {
          const key = `cf-miss|${diagnosisNorm}|${pattern.raw}`;
          if (!emitted[key]) {
            emitted[key] = true;
            errors.push({
              rule: 'ICD-CF-001',
              field: 'diagnoses',
              message: `Code First rule: ${diagnosisCode} requires an underlying etiology code (${pattern.raw}) before it.`,
              severity: 'error',
            });
          }
          continue;
        }

        const earliestSeq = Math.min(...matches.map((d) => d.sequence ?? 0));
        if (earliestSeq > diagnosisSeq) {
          const key = `cf-order|${diagnosisNorm}|${pattern.raw}`;
          if (!emitted[key]) {
            emitted[key] = true;
            errors.push({
              rule: 'ICD-CF-002',
              field: 'diagnoses',
              message: `Code First sequencing error: underlying code (${pattern.raw}) must be listed before ${diagnosisCode}.`,
              severity: 'error',
            });
          }
        }
      }
    }

    const additionalCodeNotes = notes[ICD_DESC_ADDITIONAL_CODE] ?? [];
    for (const noteLine of additionalCodeNotes) {
      for (const pattern of extractCodePatterns(noteLine)) {
        const matches = findMatches(normalizedToDiagnoses, pattern, diagnosisNorm);
        if (matches.length !== 0) {
          continue;
        }

        const key = `add-miss|${diagnosisNorm}|${pattern.raw}`;
        if (emitted[key]) {
          continue;
        }
        emitted[key] = true;

        const isHard =
          String(claim.claimFilingIndicator ?? '')
            .trim()
            .toUpperCase() === 'MA';
        const entry: ClaimIssue = {
          rule: 'ICD-ADD-001',
          field: 'diagnoses',
          message: `Use Additional Code note: ${diagnosisCode} may require an accompanying code (${pattern.raw}).`,
          severity: isHard ? 'error' : 'warning',
        };

        if (isHard) {
          errors.push(entry);
        } else {
          warnings.push(entry);
        }
      }
    }
  }

  return { errors, warnings };
}

function validateTobaccoCounseling(
  claim: IcdDiagnosisClaimInput,
  serviceLines: readonly IcdDiagnosisServiceLineInput[],
  diagnoses: readonly IcdDiagnosisInput[],
  approvedIcdLookup: Readonly<Record<string, true>>,
): ClaimIssue[] {
  const filingIndicator = String(claim.claimFilingIndicator ?? '')
    .trim()
    .toUpperCase();
  if (MEDICARE_FILING_INDICATORS.includes(filingIndicator)) {
    return [];
  }

  const triggerLines = serviceLines.filter((line) => {
    const code = String(line.procedureCode ?? '')
      .trim()
      .toUpperCase();
    return TOBACCO_COUNSELING_CPTS.includes(code);
  });

  if (triggerLines.length === 0) {
    return [];
  }

  const diagnosesBySequence = new Map<number, IcdDiagnosisInput>();
  for (const d of diagnoses) {
    diagnosesBySequence.set(d.sequence, d);
  }

  const errors: ClaimIssue[] = [];

  for (const line of triggerLines) {
    const cptCode = String(line.procedureCode ?? '')
      .trim()
      .toUpperCase();
    if (
      !lineHasSupportiveTobaccoCounselingIcd(line.diagnosisPointers ?? [], diagnosesBySequence, approvedIcdLookup)
    ) {
      errors.push({
        rule: ICD_TC_001,
        field: `service_lines.${line.lineNumber}.procedure_code`,
        message: `Non-supportive ICD found with smoking and tobacco use cessation counseling ${cptCode}. Please select an appropriate ICD code.`,
        severity: 'error',
      });
    }
  }

  return errors;
}

function lineHasSupportiveTobaccoCounselingIcd(
  pointers: readonly (number | string)[],
  diagnosesBySequence: Map<number, IcdDiagnosisInput>,
  approvedIcdLookup: Readonly<Record<string, true>>,
): boolean {
  if (pointers.length === 0) {
    return false;
  }

  for (const pointer of pointers) {
    const diagnosis = diagnosesBySequence.get(Number(pointer));
    if (!diagnosis || !filled(diagnosis.code)) {
      continue;
    }

    const norm = normalizeIcdCode(String(diagnosis.code));
    if (norm !== '' && approvedIcdLookup[norm] === true) {
      return true;
    }
  }

  return false;
}

function validateUnacceptablePrincipal(
  diagnoses: readonly IcdDiagnosisInput[],
  claim: IcdDiagnosisClaimInput,
  lookups: IcdDiagnosisLookups,
): ClaimIssue[] {
  const principal =
    diagnoses.find((d) => d.type === 'principal') ?? diagnoses[0] ?? null;
  if (!principal || !filled(principal.code)) {
    return [];
  }

  const diagnosisCode = String(principal.code);
  const norm = normalizeIcdCode(diagnosisCode);
  if (norm === '') {
    return [];
  }

  const claimType = resolveClaimTypeFromBatchVersion(claim.batchGsVersionCode);
  const unacceptableCodes = lookups.unacceptablePrincipalByClaimType[String(claimType)] ?? {};

  const candidateCodes = [...new Set([norm, withDot(norm), diagnosisCode])];
  let isUnacceptable = false;
  for (const candidate of candidateCodes) {
    if (unacceptableCodes[String(candidate).trim().toUpperCase()] === true) {
      isUnacceptable = true;
      break;
    }
  }

  if (!isUnacceptable) {
    return [];
  }

  const diagnosisSeq = principal.sequence ?? 0;
  const field = diagnosisSeq > 0 ? `diagnoses.${diagnosisSeq}.code` : 'diagnoses';

  return [
    {
      rule: 'ICD-UPD-001',
      field,
      message: `ICD code ${diagnosisCode} cannot be used as the primary listed principal diagnosis code.`,
      severity: 'error',
    },
  ];
}

function validateGenderSpecific(
  diagnoses: readonly IcdDiagnosisInput[],
  claim: IcdDiagnosisClaimInput,
  rulesByNormalizedCode: Readonly<Record<string, IcdGenderSpecificRuleRow | undefined>>,
): ClaimIssue[] {
  if (diagnoses.length === 0) {
    return [];
  }

  const patientGender = claim.patientGender ?? claim.subscriberGender;
  const errors: ClaimIssue[] = [];

  for (const diagnosis of diagnoses) {
    const norm = normalizeIcdCode(String(diagnosis.code));
    const rule = rulesByNormalizedCode[norm];
    if (!rule) {
      continue;
    }

    const diagnosisCode = String(diagnosis.code);
    const diagnosisSeq = diagnosis.sequence ?? 0;
    const field = diagnosisSeq > 0 ? `diagnoses.${diagnosisSeq}.code` : 'diagnoses';

    for (const error of validateIcdGenderRule(rule, patientGender, diagnosisCode)) {
      const ruleCode = error.type === 'gender_missing' ? 'ICD-GEN-001' : 'ICD-GEN-002';
      errors.push({
        rule: ruleCode,
        field,
        message: error.message,
        severity: 'error',
      });
    }
  }

  return errors;
}

function validateAgeSpecific(
  diagnoses: readonly IcdDiagnosisInput[],
  claim: IcdDiagnosisClaimInput,
  serviceLines: readonly IcdDiagnosisServiceLineInput[],
  rulesByNormalizedCode: Readonly<Record<string, IcdAgeSpecificRuleRow | undefined>>,
): ClaimIssue[] {
  if (diagnoses.length === 0) {
    return [];
  }

  const patientDob = claim.patientDob ?? claim.subscriberDob;
  const dateOfBirth = parseDate(patientDob);
  const serviceDate = earliestServiceDate(serviceLines);

  const errors: ClaimIssue[] = [];

  for (const diagnosis of diagnoses) {
    const norm = normalizeIcdCode(String(diagnosis.code));
    const rule = rulesByNormalizedCode[norm];
    if (!rule) {
      continue;
    }

    const diagnosisCode = String(diagnosis.code);
    const diagnosisSeq = diagnosis.sequence ?? 0;
    const field = diagnosisSeq > 0 ? `diagnoses.${diagnosisSeq}.code` : 'diagnoses';

    for (const error of validateIcdAgeRule(rule, dateOfBirth, serviceDate, diagnosisCode)) {
      let ruleCode: string;
      switch (error.type) {
        case 'dob_missing':
          ruleCode = 'ICD-AGE-001';
          break;
        case 'dos_missing':
          ruleCode = 'ICD-AGE-002';
          break;
        case 'service_before_dob':
          ruleCode = 'ICD-AGE-003';
          break;
        default:
          ruleCode = 'ICD-AGE-004';
          break;
      }

      let errorField = field;
      if (ruleCode === 'ICD-AGE-001' || ruleCode === 'ICD-AGE-003') {
        errorField = 'patient_dob';
      } else if (ruleCode === 'ICD-AGE-002') {
        errorField = 'service_lines';
      }

      errors.push({
        rule: ruleCode,
        field: errorField,
        message: error.message,
        severity: 'error',
      });
    }
  }

  return errors;
}

function validateIcdGenderRule(
  rule: IcdGenderSpecificRuleRow,
  patientGender: string | null | undefined,
  reportedIcdCode: string,
): { type: string; message: string }[] {
  const displayCode = reportedIcdCode;
  const genderDisplay = rule.gender === 'M' ? 'Male Only' : rule.gender === 'F' ? 'Female Only' : 'Unknown';

  if (patientGender !== 'M' && patientGender !== 'F') {
    return [
      {
        type: 'gender_missing',
        message: `Patient gender is required to validate gender-specific ICD ${displayCode}`,
      },
    ];
  }

  if (rule.gender !== patientGender) {
    return [
      {
        type: 'gender_mismatch',
        message: `ICD code ${displayCode} is inconsistent with patient gender.`,
      },
    ];
  }

  return [];
}

function validateIcdAgeRule(
  rule: IcdAgeSpecificRuleRow,
  dateOfBirth: Date | null,
  serviceDate: Date | null,
  reportedIcdCode: string,
): { type: string; message: string }[] {
  const displayCode = reportedIcdCode;

  if (!dateOfBirth) {
    return [
      {
        type: 'dob_missing',
        message: `Patient DOB is required to validate age-specific ICD ${displayCode}`,
      },
    ];
  }

  if (!serviceDate) {
    return [
      {
        type: 'dos_missing',
        message: `Date of service is required to validate age-specific ICD ${displayCode}`,
      },
    ];
  }

  if (serviceDate.getTime() < dateOfBirth.getTime()) {
    return [
      {
        type: 'service_before_dob',
        message: `Service date (${formatYmd(serviceDate)}) cannot be before patient DOB (${formatYmd(dateOfBirth)})`,
      },
    ];
  }

  if (!isIcdAgeValid(rule, dateOfBirth, serviceDate)) {
    return [
      {
        type: 'age_mismatch',
        message: `ICD code ${displayCode} is inconsistent with the patient's age.`,
      },
    ];
  }

  return [];
}

function isIcdAgeValid(rule: IcdAgeSpecificRuleRow, dob: Date, serviceDate: Date): boolean {
  const age = calculateIcdAge(rule, dob, serviceDate);
  if (rule.low_limit !== null && age < rule.low_limit) {
    return false;
  }
  if (rule.upper_limit !== null && age > rule.upper_limit) {
    return false;
  }
  return true;
}

function calculateIcdAge(rule: IcdAgeSpecificRuleRow, dob: Date, serviceDate: Date): number {
  if (serviceDate.getTime() < dob.getTime()) {
    return 0;
  }
  switch (rule.unit) {
    case 'months':
      return calculateAgeInMonths(dob, serviceDate);
    case 'days':
      return (serviceDate.getTime() - dob.getTime()) / (1000 * 60 * 60 * 24);
    case 'years':
    default:
      return calculateAgeInYears(dob, serviceDate);
  }
}

function calculateAgeInYears(dob: Date, serviceDate: Date): number {
  const { y, m, d } = diffParts(dob, serviceDate);
  const fractionalYears = y + m / 12 + d / 365.25;
  return Math.round(fractionalYears * 10) / 10;
}

function calculateAgeInMonths(dob: Date, serviceDate: Date): number {
  const { y, m, d } = diffParts(dob, serviceDate);
  const totalMonths = y * 12 + m + d / 30.44;
  return Math.round(totalMonths * 10) / 10;
}

type CodePattern = { type: 'range' | 'prefix' | 'exact'; raw: string; value: string; end?: string };

function extractCodePatterns(text: string): CodePattern[] {
  const patterns: CodePattern[] = [];

  const rangeRe = /\b([A-TV-Z][0-9][0-9A-Z](?:\.[0-9A-Z]{1,4})?)\s*-\s*([A-TV-Z][0-9][0-9A-Z](?:\.[0-9A-Z]{1,4})?)\b/gi;
  let m: RegExpExecArray | null;
  while ((m = rangeRe.exec(text)) !== null) {
    const start = normalizeIcdCode(m[1]);
    const end = normalizeIcdCode(m[2]);
    if (start !== '' && end !== '') {
      patterns.push({ type: 'range', raw: `${m[1]}-${m[2]}`, value: start, end });
    }
  }

  const prefixRe = /\b([A-TV-Z][0-9][0-9A-Z])\.-\b/gi;
  while ((m = prefixRe.exec(text)) !== null) {
    const prefix = normalizeIcdCode(m[1]);
    if (prefix !== '') {
      patterns.push({ type: 'prefix', raw: `${m[1]}.-`, value: prefix });
    }
  }

  const exactRe = /\b([A-TV-Z][0-9][0-9A-Z](?:\.[0-9A-Z]{1,4})?)\b/gi;
  while ((m = exactRe.exec(text)) !== null) {
    const value = normalizeIcdCode(m[1]);
    if (value !== '') {
      patterns.push({ type: 'exact', raw: m[1], value });
    }
  }

  const dedup: Record<string, CodePattern> = {};
  for (const pattern of patterns) {
    dedup[`${pattern.type}|${pattern.raw}`] = pattern;
  }

  return Object.values(dedup);
}

function findMatches(
  normalizedToDiagnoses: Record<string, IcdDiagnosisInput[]>,
  pattern: CodePattern,
  excludeNorm: string,
): IcdDiagnosisInput[] {
  const matches: IcdDiagnosisInput[] = [];
  for (const [normCode, diagnosisRows] of Object.entries(normalizedToDiagnoses)) {
    if (normCode === excludeNorm) {
      continue;
    }
    if (!matchesPattern(normCode, pattern)) {
      continue;
    }
    matches.push(...diagnosisRows);
  }
  return matches;
}

function matchesPattern(normalizedCode: string, pattern: CodePattern): boolean {
  if (pattern.type === 'prefix') {
    return normalizedCode.startsWith(pattern.value);
  }
  if (pattern.type === 'range') {
    const end = pattern.end ?? '';
    if (end === '') {
      return false;
    }
    return normalizedCode >= pattern.value && normalizedCode <= end;
  }
  return normalizedCode === pattern.value;
}

function normalizeIcdCode(code: string): string {
  return code.toUpperCase().replace(/\./g, '').trim();
}

function withDot(normalizedCode: string): string {
  if (normalizedCode.length <= 3) {
    return normalizedCode;
  }
  return `${normalizedCode.slice(0, 3)}.${normalizedCode.slice(3)}`;
}

function filled(value: string | null | undefined): boolean {
  return value !== null && value !== undefined && String(value).trim() !== '';
}

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

function earliestServiceDate(lines: readonly IcdDiagnosisServiceLineInput[]): Date | null {
  let min: Date | null = null;
  for (const line of lines) {
    const d = parseDate(line.serviceDateFrom ?? null);
    if (!d) {
      continue;
    }
    if (!min || d.getTime() < min.getTime()) {
      min = d;
    }
  }
  return min;
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
