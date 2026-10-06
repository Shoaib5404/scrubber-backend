import { CLAIM_FILING_INDICATORS } from '../config/claim-filing-indicators';
import { ClaimIssue } from '../types';

export const SBR_001 = 'SBR-001';
export const SBR_002 = 'SBR-002';
export const SBR_003 = 'SBR-003';

type ClaimFilingInput = {
  claimFilingIndicator: string | null;
  payerResponsibility: string | null;
  subscriberMemberId: string | null;
  subscriberDob: Date | null;
  patientDob: Date | null;
  otherSubscribers: unknown;
  serviceDateFrom: Date | null;
};

/** Laravel ClaimFilingIndicatorRules */
export function validateClaimFilingIndicator(claim: ClaimFilingInput): ClaimIssue[] {
  const errors: ClaimIssue[] = [];
  const indicator = normalize(claim.claimFilingIndicator);

  if (indicator === '' || !(indicator in CLAIM_FILING_INDICATORS)) {
    errors.push({
      rule: SBR_001,
      field: 'claim_filing_indicator',
      message: 'Filing indicator is missing or invalid.',
      severity: 'error',
    });
  }

  errors.push(...validateDualGovernment(claim));
  errors.push(...validateSecondaryMedicaid(claim));
  return errors;
}

function validateDualGovernment(claim: ClaimFilingInput): ClaimIssue[] {
  if (!claim.subscriberMemberId?.trim()) return [];
  const primary = normalize(claim.claimFilingIndicator);
  if (!['MB', 'MC'].includes(primary)) return [];

  const errors: ClaimIssue[] = [];
  for (const [index, other] of otherSubscribers(claim.otherSubscribers).entries()) {
    if (!String(other.member_id ?? '').trim()) continue;
    const otherIndicator = normalize(other.claim_filing_indicator);
    if (!['MB', 'MC'].includes(otherIndicator)) continue;
    errors.push({
      rule: SBR_002,
      field: index === 0 ? 'other_subscribers' : `other_subscribers.${index}.claim_filing_indicator`,
      message:
        'Filing indicator is missing or invalid. Patient does not have two government payer filing indicator at same charge',
      severity: 'error',
    });
  }
  return errors;
}

function validateSecondaryMedicaid(claim: ClaimFilingInput): ClaimIssue[] {
  if (normalize(claim.payerResponsibility) !== 'S') return [];
  if (normalize(claim.claimFilingIndicator) !== 'MC') return [];
  if (!isAtLeast65(claim)) return [];

  const primary = findPrimaryOther(claim.otherSubscribers);
  if (!primary) return [];
  const [index, other] = primary;
  const primaryInsurance = normalize(other.claim_filing_indicator);
  if (['MB', '16'].includes(primaryInsurance)) return [];

  return [
    {
      rule: SBR_003,
      field: index === 0 ? 'other_subscribers' : `other_subscribers.${index}.claim_filing_indicator`,
      message: 'Filing indicator for primary insurance must be 16 or MB.',
      severity: 'error',
    },
  ];
}

function isAtLeast65(claim: ClaimFilingInput): boolean {
  const dob = claim.patientDob ?? claim.subscriberDob;
  if (!dob) return false;
  const service = claim.serviceDateFrom ?? new Date();
  if (service.getTime() < dob.getTime()) return false;
  let age = service.getUTCFullYear() - dob.getUTCFullYear();
  const m = service.getUTCMonth() - dob.getUTCMonth();
  if (m < 0 || (m === 0 && service.getUTCDate() < dob.getUTCDate())) age -= 1;
  return age >= 65;
}

function findPrimaryOther(
  raw: unknown,
): [number, Record<string, unknown>] | null {
  for (const [index, other] of otherSubscribers(raw).entries()) {
    if (!String(other.member_id ?? '').trim()) continue;
    if (normalize(other.payer_responsibility) !== 'P') continue;
    return [index, other];
  }
  return null;
}

function otherSubscribers(raw: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object');
}

function normalize(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toUpperCase();
}
