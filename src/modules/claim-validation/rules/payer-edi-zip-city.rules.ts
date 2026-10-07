import { CITY_NAME_RULES } from '../config/city-name-rules.config';
import { ZIP_CODE_RULES } from '../config/zip-code-rules.config';
import {
  digitsOnly,
  parseCityFromFullAddress,
} from '../support/payer-edi.helpers';
import { ClaimIssue } from '../types';
import { PayerEdiClaimInput } from '../types/payer-edi.types';

export type ZipCodeLookupRow = {
  city: string;
  zip_code_type: string;
  state: string;
};

export type PayerEdiZipLookups = {
  /** zip5 -> rows (Laravel LookupCacheService::getGroupRows('zip_codes', zip5)) */
  zipCodeRowsByZip5?: Readonly<Record<string, readonly ZipCodeLookupRow[]>>;
};

function zip5(digits: string): string | null {
  if (digits.length < 5) return null;
  return digits.slice(0, 5);
}

function zipExistsInLibrary(
  digits: string,
  rowsByZip5: Readonly<Record<string, readonly ZipCodeLookupRow[]>>,
): boolean {
  const z5 = zip5(digits);
  if (z5 == null) return false;
  const rows = rowsByZip5[z5];
  return rows != null && rows.length > 0;
}

function findZipCodeInState(
  digits: string,
  state: string,
  rowsByZip5: Readonly<Record<string, readonly ZipCodeLookupRow[]>>,
): boolean {
  const z5 = zip5(digits);
  if (z5 == null) return false;
  const stateCode = state.trim().toUpperCase();
  if (stateCode.length !== 2) return false;
  const rows = rowsByZip5[z5] ?? [];
  return rows.some((row) => String(row.state ?? '').trim().toUpperCase() === stateCode);
}

function resolveEntityCity(claim: PayerEdiClaimInput, entity: string): string {
  switch (entity) {
    case 'billing_provider':
      return String(claim.billingProviderCity ?? '').trim();
    case 'patient':
      return parseCityFromFullAddress(claim.patientAddress);
    case 'subscriber':
      return parseCityFromFullAddress(claim.subscriberAddress);
    case 'facility':
      return parseCityFromFullAddress(claim.facilityAddress);
    default:
      return '';
  }
}

function hasFacilityEntity(claim: PayerEdiClaimInput): boolean {
  return (
    String(claim.facilityName ?? '').trim() !== '' ||
    String(claim.facilityNpi ?? '').trim() !== '' ||
    String(claim.facilityAddress ?? '').trim() !== ''
  );
}

/** Laravel Rules::validateCityNameRules */
export function validateCityNameRules(claim: PayerEdiClaimInput): ClaimIssue[] {
  const errors: ClaimIssue[] = [];
  for (const definition of CITY_NAME_RULES) {
    if (definition.requireEntity && definition.entity === 'facility' && !hasFacilityEntity(claim)) {
      continue;
    }
    const city = resolveEntityCity(claim, definition.entity);
    if (city === '') continue;
    if (definition.pattern.test(city)) continue;
    errors.push({
      rule: definition.ruleCode,
      field: definition.field,
      message: definition.message.replace('%s', city),
      severity: 'error',
    });
  }
  return errors;
}

/**
 * Laravel Rules::validateZipCodeRules — Phase 1 format + library, Phase 2 state match.
 * Phase 3 city/type matching is TODO (requires full ZipCodeValidator port).
 */
export function validateZipCodeRules(
  claim: PayerEdiClaimInput,
  lookups: PayerEdiZipLookups,
): ClaimIssue[] {
  const rowsByZip5 = lookups.zipCodeRowsByZip5;
  if (rowsByZip5 == null || Object.keys(rowsByZip5).length === 0) {
    return [];
  }

  const errors: ClaimIssue[] = [];
  for (const definition of ZIP_CODE_RULES) {
    if (definition.entity === 'other_subscriber' || definition.entity === 'other_patient') {
      // TODO: other_subscriber / other_patient ZIP rules (Laravel validateOtherSubscriberZipCodeRules)
      continue;
    }

    if (definition.requireEntity && definition.entity === 'facility' && !hasFacilityEntity(claim)) {
      continue;
    }

    const [zip, state] = resolveEntityZipAndState(claim, definition.entity);
    const digits = digitsOnly(zip);
    if (digits === '') continue;

    const label = definition.label;
    const field = definition.field;

    if (!definition.pattern.test(digits) || !zipExistsInLibrary(digits, rowsByZip5)) {
      errors.push({
        rule: definition.ruleCode,
        field,
        message: formatTwoPlaceholders(definition.message, label, digits),
        severity: 'error',
      });
      continue;
    }

    const z5 = zip5(digits) ?? digits;
    const stateCode = String(state ?? '').trim().toUpperCase();
    if (!findZipCodeInState(digits, stateCode, rowsByZip5)) {
      errors.push({
        rule: definition.stateRuleCode,
        field,
        message: formatThreePlaceholders(definition.stateMessage, label, stateCode, z5),
        severity: 'error',
      });
    }
  }

  return errors;
}

function resolveEntityZipAndState(
  claim: PayerEdiClaimInput,
  entity: string,
): [string, string | null] {
  switch (entity) {
    case 'billing_provider':
      return [String(claim.billingProviderZip ?? ''), claim.billingProviderState ?? null];
    case 'patient':
      return [extractZipFromAddress(claim.patientAddress), claim.patientState ?? null];
    case 'subscriber':
      return [extractZipFromAddress(claim.subscriberAddress), claim.subscriberState ?? null];
    case 'facility':
      return [extractZipFromAddress(claim.facilityAddress), claim.facilityState ?? null];
    default:
      return ['', null];
  }
}

function formatTwoPlaceholders(template: string, a: string, b: string): string {
  return template.replace('%s', a).replace('%s', b);
}

function formatThreePlaceholders(
  template: string,
  a: string,
  b: string,
  c: string,
): string {
  return template.replace('%s', a).replace('%s', b).replace('%s', c);
}

function extractZipFromAddress(address: string | null | undefined): string {
  const raw = String(address ?? '').trim();
  if (raw === '') return '';
  const match = raw.match(/(\d{5})(\d{4})?\s*$/);
  return match ? `${match[1]}${match[2] ?? ''}` : '';
}
