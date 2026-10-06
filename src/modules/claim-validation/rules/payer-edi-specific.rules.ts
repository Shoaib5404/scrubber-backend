import { ClaimIssue } from '../types';

export const DOS_FUT_001 = 'DOS-FUT-001';
const MESSAGE = 'Claim level or service line level DOS (%s) cannot be in the future.';

type Line = {
  lineNumber: number;
  serviceDateFrom: Date | null;
  serviceDateTo: Date | null;
};

const CLAIM_LEVEL_DATE_FIELDS: Array<{ field: string; camel: keyof ClaimLevelDates }> = [
  { field: 'onset_of_illness_date', camel: 'onsetOfIllnessDate' },
  { field: 'last_menstrual_period_date', camel: 'lastMenstrualPeriodDate' },
  { field: 'initial_treatment_date', camel: 'initialTreatmentDate' },
  { field: 'last_seen_date', camel: 'lastSeenDate' },
  { field: 'accident_date', camel: 'accidentDate' },
  { field: 'last_xray_date', camel: 'lastXrayDate' },
  { field: 'admission_date', camel: 'admissionDate' },
  { field: 'discharge_date', camel: 'dischargeDate' },
  { field: 'hearing_vision_prescription_date', camel: 'hearingVisionPrescriptionDate' },
  { field: 'disability_start_date', camel: 'disabilityStartDate' },
  { field: 'disability_end_date', camel: 'disabilityEndDate' },
  { field: 'last_worked_date', camel: 'lastWorkedDate' },
  { field: 'authorized_return_to_work_date', camel: 'authorizedReturnToWorkDate' },
  { field: 'assumed_care_date', camel: 'assumedCareDate' },
  { field: 'relinquished_care_date', camel: 'relinquishedCareDate' },
];

export type ClaimLevelDates = {
  onsetOfIllnessDate: Date | null;
  lastMenstrualPeriodDate: Date | null;
  initialTreatmentDate: Date | null;
  lastSeenDate: Date | null;
  accidentDate: Date | null;
  lastXrayDate: Date | null;
  admissionDate: Date | null;
  dischargeDate: Date | null;
  hearingVisionPrescriptionDate: Date | null;
  disabilityStartDate: Date | null;
  disabilityEndDate: Date | null;
  lastWorkedDate: Date | null;
  authorizedReturnToWorkDate: Date | null;
  assumedCareDate: Date | null;
  relinquishedCareDate: Date | null;
};

/** Subset of Laravel PayerAndEdiSpecificRules DOS-FUT-001 (halt gate). */
export function validateDosNotInFuture(
  lines: Line[],
  claimDates: ClaimLevelDates,
  today = startOfLocalDay(new Date()),
): ClaimIssue[] {
  const errors: ClaimIssue[] = [];
  for (const line of lines) {
    const from = line.serviceDateFrom;
    const to = line.serviceDateTo ?? from;
    const field =
      line.lineNumber > 0
        ? `service_lines.${line.lineNumber}.service_date_from`
        : 'service_date_from';

    if (from && to && from.getTime() > to.getTime()) {
      errors.push({
        rule: DOS_FUT_001,
        field,
        message: MESSAGE.replace('%s', formatYmd(from)),
        severity: 'error',
      });
    }
    if (from && from.getTime() > today.getTime()) {
      errors.push({
        rule: DOS_FUT_001,
        field,
        message: MESSAGE.replace('%s', formatYmd(from)),
        severity: 'error',
      });
    }
    if (to && to.getTime() > today.getTime() && (!from || to.getTime() !== from.getTime())) {
      errors.push({
        rule: DOS_FUT_001,
        field:
          line.lineNumber > 0
            ? `service_lines.${line.lineNumber}.service_date_to`
            : 'service_date_to',
        message: MESSAGE.replace('%s', formatYmd(to)),
        severity: 'error',
      });
    }
  }

  for (const def of CLAIM_LEVEL_DATE_FIELDS) {
    const date = claimDates[def.camel];
    if (date && date.getTime() > today.getTime()) {
      errors.push({
        rule: DOS_FUT_001,
        field: def.field,
        message: MESSAGE.replace('%s', formatYmd(date)),
        severity: 'error',
      });
    }
  }

  return errors;
}

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function formatYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
