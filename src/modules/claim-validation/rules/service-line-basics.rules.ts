import { ClaimIssue } from '../types';
import { isRecognizedProcedureFormat } from '../support/procedure-code.helper';
import { parseClaimDate } from '../support/payer-edi.helpers';

export const AMT_ZERO_001 = 'AMT-ZERO-001';
export const AMT_ZERO_001_MESSAGE =
  'Procedure code (%s) charge amount should be greater than or equals to 0 and less than 1.';

export const UNIT_DAY_001 = 'UNIT-DAY-001';
export const UNIT_DAY_001_MESSAGE =
  'Units of CPT (%s) are missing or invalid. Units per day must be greater than 1.';

export type ServiceLineBasicsInput = {
  lineNumber: number;
  procedureCode: string | null;
  chargeAmount: number;
  units: number;
  serviceDateFrom: Date | null;
  serviceDateTo: Date | null;
  diagnosisPointers: unknown;
};

export type ServiceLineBasicsLookups = {
  /** Laravel LookupCacheService::getMany('zero_amount_procedures', codes) */
  zeroAmountProcedures?: Readonly<Record<string, true>>;
  /** Laravel LookupCacheService::existsMany('no_of_units_cpts', codes) */
  noOfUnitsCptsExempt?: Readonly<Record<string, true>>;
};

/** Laravel ServiceLineBasicsRules */
export function validateServiceLineBasics(
  lines: ServiceLineBasicsInput[],
  maxDiagnosisSequence: number | null,
  lookups: ServiceLineBasicsLookups = {},
): { errors: ClaimIssue[]; warnings: ClaimIssue[] } {
  const errors: ClaimIssue[] = [];
  const warnings: ClaimIssue[] = [];
  const zeroAmountLookup = lookups.zeroAmountProcedures ?? {};
  const noOfUnitsExemptLookup = lookups.noOfUnitsCptsExempt ?? {};

  for (const line of lines) {
    const prefix = `service_lines.${line.lineNumber}`;
    const procedureCode = String(line.procedureCode ?? '')
      .trim()
      .toUpperCase();

    if (!line.serviceDateFrom) {
      errors.push({
        rule: 'REQ-006',
        field: `${prefix}.service_date_from`,
        message: `Line ${line.lineNumber}: Service date is required`,
        severity: 'error',
      });
    }

    if (line.procedureCode && !isRecognizedProcedureFormat(line.procedureCode)) {
      warnings.push({
        rule: 'FMT-004',
        field: `${prefix}.procedure_code`,
        message: `Line ${line.lineNumber}: Procedure code '${line.procedureCode}' has non-standard format`,
        severity: 'warning',
      });
    }

    const isZeroAmountProcedure =
      procedureCode !== '' && zeroAmountLookup[procedureCode] === true;

    if (isZeroAmountProcedure) {
      if (!isZeroAmountChargeValid(line.chargeAmount)) {
        errors.push({
          rule: AMT_ZERO_001,
          field: `${prefix}.charge_amount`,
          message: AMT_ZERO_001_MESSAGE.replace('%s', procedureCode),
          severity: 'error',
        });
      }
    } else if (line.chargeAmount <= 0) {
      errors.push({
        rule: 'REQ-008',
        field: `${prefix}.charge_amount`,
        message: `Line ${line.lineNumber}: Charge amount must be greater than zero`,
        severity: 'error',
      });
    }

    if (
      procedureCode !== '' &&
      noOfUnitsExemptLookup[procedureCode] !== true &&
      line.serviceDateFrom != null &&
      !unitsCoverAtLeastOnePerDay(line)
    ) {
      errors.push({
        rule: UNIT_DAY_001,
        field: `${prefix}.units`,
        message: UNIT_DAY_001_MESSAGE.replace('%s', procedureCode),
        severity: 'error',
      });
    }

    const pointers = Array.isArray(line.diagnosisPointers)
      ? (line.diagnosisPointers as number[])
      : [];
    if (maxDiagnosisSequence != null) {
      for (const pointer of pointers) {
        if (Number(pointer) > maxDiagnosisSequence) {
          errors.push({
            rule: 'BUS-005',
            field: `${prefix}.diagnosis_pointers`,
            message: `Line ${line.lineNumber}: Diagnosis pointer ${pointer} references non-existent diagnosis`,
            severity: 'error',
          });
        }
      }
    }
  }

  return { errors, warnings };
}

function isZeroAmountChargeValid(chargeAmount: number): boolean {
  if (!Number.isFinite(chargeAmount)) return false;
  return chargeAmount >= 0 && chargeAmount < 1;
}

function unitsCoverAtLeastOnePerDay(line: ServiceLineBasicsInput): boolean {
  const from = parseClaimDate(line.serviceDateFrom);
  if (from == null) return true;

  let to = parseClaimDate(line.serviceDateTo);
  if (to == null) to = from;
  if (to.getTime() < from.getTime()) return false;

  const days = diffInDaysInclusive(from, to);
  const units = line.units;
  if (units == null || !Number.isFinite(units)) return false;
  return units >= days;
}

function diffInDaysInclusive(from: Date, to: Date): number {
  const msPerDay = 86400000;
  return Math.floor((to.getTime() - from.getTime()) / msPerDay) + 1;
}
