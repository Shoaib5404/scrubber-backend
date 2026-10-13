import { parseEdiDate } from './edi-date.util';

/** Normalized 2320 COB other subscriber record (snake_case keys, Laravel parity). */
export type OtherSubscriberEntry = Record<string, string | null>;

export const OTHER_SUBSCRIBER_FIELD_KEYS = [
  'payer_responsibility',
  'relationship_code',
  'group_number',
  'group_name',
  'insurance_type_code',
  'claim_filing_indicator',
  'last_name',
  'first_name',
  'middle_name',
  'member_id',
  'ssn',
  'remittance_date',
  'address_line_1',
  'address_line_2',
  'city',
  'state',
  'zip_code',
  'patient_last_name',
  'patient_first_name',
  'patient_middle_name',
  'patient_address_line_1',
  'patient_address_line_2',
  'patient_city',
  'patient_state',
  'patient_zip_code',
  'payer_name',
  'payer_id',
  'has_other_payer_nm1',
  'payer_address_line_1',
  'payer_address_line_2',
  'payer_city',
  'payer_state',
  'payer_zip_code',
  'payer_claim_control_number',
  'payer_paid_amount',
  'remaining_patient_liability',
] as const;

function normalizeEdiDateValue(value: string): string | null {
  const digits = value.replace(/\D/g, '');
  if (digits === '') {
    return null;
  }

  if (digits.length === 8) {
    return parseEdiDate(digits);
  }

  if (digits.length === 6) {
    return parseEdiDate(digits);
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  return null;
}

export function normalizeOtherSubscriberEntry(entry: Record<string, unknown>): OtherSubscriberEntry {
  const normalized: OtherSubscriberEntry = {};

  for (const key of OTHER_SUBSCRIBER_FIELD_KEYS) {
    const raw = entry[key];
    if (typeof raw !== 'string' && typeof raw !== 'number') {
      normalized[key] = null;
      continue;
    }

    let value = String(raw).trim();
    if (key === 'claim_filing_indicator') {
      value = value.toUpperCase();
    }

    if (key === 'remittance_date') {
      value = normalizeEdiDateValue(value) ?? '';
    }

    normalized[key] = value !== '' ? value : null;
  }

  return normalized;
}

export function isEmptyOtherSubscriberEntry(entry: OtherSubscriberEntry): boolean {
  for (const key of OTHER_SUBSCRIBER_FIELD_KEYS) {
    if ((entry[key] ?? null) !== null) {
      return false;
    }
  }
  return true;
}

export function normalizeOtherSubscriberList(entries: unknown): OtherSubscriberEntry[] {
  if (!Array.isArray(entries)) {
    return [];
  }

  const normalized: OtherSubscriberEntry[] = [];
  for (const entry of entries) {
    if (entry == null || typeof entry !== 'object' || Array.isArray(entry)) {
      continue;
    }
    const row = normalizeOtherSubscriberEntry(entry as Record<string, unknown>);
    if (!isEmptyOtherSubscriberEntry(row)) {
      normalized.push(row);
    }
  }
  return normalized;
}
