import { ClaimIssue } from '../types';
import { validateNpiLuhn } from '../support/npi.validator';

export type ClaimForRules = {
  billingProviderNpi: string | null;
  subscriberMemberId: string | null;
  payerId: string | null;
  payerName: string | null;
  totalCharge: number;
  diagnosesCount: number;
};

/** Laravel ClaimFieldRules */
export function validateClaimFields(claim: ClaimForRules): ClaimIssue[] {
  const errors: ClaimIssue[] = [];
  if (!claim.billingProviderNpi) {
    errors.push({ rule: 'REQ-001', field: 'billing_provider_npi', message: 'Billing Provider NPI is required' });
  }
  if (!claim.subscriberMemberId) {
    errors.push({ rule: 'REQ-002', field: 'subscriber_member_id', message: 'Subscriber Member ID is required' });
  }
  if (!claim.payerId && !claim.payerName) {
    errors.push({ rule: 'REQ-003', field: 'payer_id', message: 'Payer information is required' });
  }
  if (claim.diagnosesCount === 0) {
    errors.push({ rule: 'REQ-004', field: 'diagnoses', message: 'At least one diagnosis code is required' });
  }
  if (claim.totalCharge <= 0) {
    errors.push({ rule: 'REQ-005', field: 'total_charge', message: 'Total charge must be greater than zero' });
  }
  if (claim.billingProviderNpi && !/^\d{10}$/.test(claim.billingProviderNpi)) {
    errors.push({ rule: 'FMT-001', field: 'billing_provider_npi', message: 'Billing Provider NPI must be exactly 10 digits' });
  }
  if (claim.billingProviderNpi && /^\d{10}$/.test(claim.billingProviderNpi) && !validateNpiLuhn(claim.billingProviderNpi)) {
    errors.push({ rule: 'FMT-002', field: 'billing_provider_npi', message: 'Billing Provider NPI fails Luhn check validation' });
  }
  return errors;
}
