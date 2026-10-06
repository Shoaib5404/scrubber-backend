import { ClaimIssue } from '../types';
import { isRecognizedProcedureFormat } from '../support/procedure-code.helper';

export type ServiceLineBasicsInput = {
  lineNumber: number;
  procedureCode: string | null;
  chargeAmount: number;
  units: number;
  serviceDateFrom: Date | null;
  serviceDateTo: Date | null;
  diagnosisPointers: unknown;
};

/** Laravel ServiceLineBasicsRules — core required checks (lookup-exempt paths deferred). */
export function validateServiceLineBasics(
  lines: ServiceLineBasicsInput[],
  maxDiagnosisSequence: number | null,
): { errors: ClaimIssue[]; warnings: ClaimIssue[] } {
  const errors: ClaimIssue[] = [];
  const warnings: ClaimIssue[] = [];

  for (const line of lines) {
    const prefix = `service_lines.${line.lineNumber}`;
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

    if (line.chargeAmount <= 0) {
      errors.push({
        rule: 'REQ-008',
        field: `${prefix}.charge_amount`,
        message: `Line ${line.lineNumber}: Charge amount must be greater than zero`,
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
