import {
  ZIP_CODE_RULES,
  ZIP_SUPPORTED_TYPES,
} from '../config/zip-code-rules.config';
import { CITY_NAME_RULES } from '../config/city-name-rules.config';
import {
  digitsOnly,
  extractZipDigitsFromAddress,
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

function normalizeCity(city: string | null | undefined): string {
  return String(city ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
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

function libraryRowsForState(
  digits: string,
  state: string,
  rowsByZip5: Readonly<Record<string, readonly ZipCodeLookupRow[]>>,
): ZipCodeLookupRow[] {
  const z5 = zip5(digits);
  if (z5 == null) return [];
  const stateCode = state.trim().toUpperCase();
  const rows = rowsByZip5[z5] ?? [];
  if (stateCode.length !== 2) return [...rows];
  return rows.filter((row) => String(row.state ?? '').trim().toUpperCase() === stateCode);
}

/** Laravel ZipCodeValidator::preferredCities — type P rows first, else all cities. */
function preferredCities(rows: readonly ZipCodeLookupRow[]): string[] {
  const pCities = rows
    .filter((r) => String(r.zip_code_type ?? '').toUpperCase() === 'P')
    .map((r) => normalizeCity(r.city))
    .filter(Boolean);
  const uniqueP = [...new Set(pCities)].sort();
  if (uniqueP.length) return uniqueP;
  return [...new Set(rows.map((r) => normalizeCity(r.city)).filter(Boolean))].sort();
}

/**
 * Laravel ZipCodeValidator::evaluateCity — Phase 3 city / ZIP-type evaluation.
 */
export function evaluateCity(
  digits: string,
  state: string,
  city: string,
  rowsByZip5: Readonly<Record<string, readonly ZipCodeLookupRow[]>>,
): {
  status: 'skip' | 'pass' | 'warning' | 'error';
  matched_type: string | null;
  recommended_cities: string[];
  city: string;
  zip5: string;
} {
  const z5 = zip5(digits) ?? '';
  const normalizedCity = normalizeCity(city);
  if (normalizedCity === '' || z5 === '') {
    return {
      status: 'skip',
      matched_type: null,
      recommended_cities: [],
      city: normalizedCity,
      zip5: z5,
    };
  }

  const rows = libraryRowsForState(digits, state, rowsByZip5);
  const preferred = preferredCities(rows);

  const matched = rows.find((row) => normalizeCity(row.city) === normalizedCity) ?? null;
  if (matched == null) {
    const types = [
      ...new Set(rows.map((r) => String(r.zip_code_type ?? '').trim().toUpperCase()).filter(Boolean)),
    ];
    const onlyNoRecommendTypes =
      types.length > 0 && types.every((t) => ['B', 'C', 'U', 'X'].includes(t));

    if (preferred.length === 0 && onlyNoRecommendTypes) {
      return {
        status: 'pass',
        matched_type: null,
        recommended_cities: [],
        city: normalizedCity,
        zip5: z5,
      };
    }

    return {
      status: 'error',
      matched_type: null,
      recommended_cities: preferred.length ? preferred : [...new Set(rows.map((r) => normalizeCity(r.city)).filter(Boolean))].sort(),
      city: normalizedCity,
      zip5: z5,
    };
  }

  const type = String(matched.zip_code_type ?? '').trim().toUpperCase();
  if (type === '' || !(ZIP_SUPPORTED_TYPES as readonly string[]).includes(type)) {
    return {
      status: 'error',
      matched_type: type !== '' ? type : null,
      recommended_cities: preferred.length ? preferred : [normalizedCity],
      city: normalizedCity,
      zip5: z5,
    };
  }

  if (type === 'N') {
    return {
      status: 'warning',
      matched_type: 'N',
      recommended_cities: preferred,
      city: normalizedCity,
      zip5: z5,
    };
  }

  return {
    status: 'pass',
    matched_type: type,
    recommended_cities: type === 'Z' ? preferred : [],
    city: normalizedCity,
    zip5: z5,
  };
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

function relationshipAllows(
  claim: PayerEdiClaimInput,
  definition: (typeof ZIP_CODE_RULES)[number],
): boolean {
  const rel = String(claim.subscriberRelationship ?? '').trim();
  if (definition.relationshipCode != null) {
    return rel === definition.relationshipCode;
  }
  if (definition.requireEmptyRelationship) {
    return rel === '';
  }
  return true;
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

function hasOtherPatientEntity(other: NonNullable<PayerEdiClaimInput['otherSubscribers']>[number]): boolean {
  return (
    String(other.patientLastName ?? '').trim() !== '' ||
    String(other.patientFirstName ?? '').trim() !== '' ||
    String(other.patientZipCode ?? '').trim() !== '' ||
    String(other.patientState ?? '').trim() !== '' ||
    String(other.patientAddressLine1 ?? '').trim() !== ''
  );
}

function buildZipCityIssue(
  definition: (typeof ZIP_CODE_RULES)[number],
  field: string,
  digits: string,
  stateCode: string,
  city: string,
  rowsByZip5: Readonly<Record<string, readonly ZipCodeLookupRow[]>>,
): ClaimIssue | null {
  const cityResult = evaluateCity(digits, stateCode, city, rowsByZip5);
  if (cityResult.status === 'skip' || cityResult.status === 'pass') {
    return null;
  }

  const cityList =
    cityResult.recommended_cities.length > 0
      ? cityResult.recommended_cities.join(', ')
      : '(NONE)';
  const template =
    cityResult.status === 'warning'
      ? definition.cityWarningMessage
      : definition.cityMessage;
  if (!template) return null;

  // Laravel buildZipCityIssue: city_rule_code, else definition.rule_code, else ZIP-CITY-001.
  const cityRuleCode = String(definition.cityRuleCode ?? '').trim();
  const rule =
    cityRuleCode !== ''
      ? cityRuleCode
      : String(definition.ruleCode ?? '').trim() || 'ZIP-CITY-001';

  return {
    rule,
    field,
    message: formatThreePlaceholders(
      template,
      cityResult.city,
      cityResult.zip5,
      cityList,
    ),
    severity: cityResult.status === 'warning' ? 'warning' : 'error',
  };
}

/**
 * Laravel Rules::validateOtherSubscriberZipCodeRules.
 */
function validateOtherSubscriberZipCodeRules(
  claim: PayerEdiClaimInput,
  definition: (typeof ZIP_CODE_RULES)[number],
  rowsByZip5: Readonly<Record<string, readonly ZipCodeLookupRow[]>>,
): ClaimIssue[] {
  const others = claim.otherSubscribers ?? [];
  const errors: ClaimIssue[] = [];
  const expectedRelationship = definition.relationshipCode
    ? definition.relationshipCode.trim().toUpperCase()
    : null;

  others.forEach((other, index) => {
    const relationship = String(other.relationshipCode ?? '')
      .trim()
      .toUpperCase();

    if (definition.requireEmptyRelationship && relationship !== '') {
      return;
    }
    if (expectedRelationship != null && relationship !== expectedRelationship) {
      return;
    }

    let zip = '';
    let state = '';
    let city = '';
    let field = definition.field;

    if (definition.entity === 'other_patient') {
      if (!hasOtherPatientEntity(other)) {
        return;
      }
      zip = String(other.patientZipCode ?? '').trim();
      state = String(other.patientState ?? '').trim();
      city = String(other.patientCity ?? '').trim();
      field =
        index === 0
          ? 'other_subscribers.patient_zip_code'
          : `other_subscribers.${index}.patient_zip_code`;
    } else {
      zip = String(other.zipCode ?? '').trim();
      state = String(other.state ?? '').trim();
      city = String(other.city ?? '').trim();
      field =
        index === 0
          ? 'other_subscribers.zip_code'
          : `other_subscribers.${index}.zip_code`;
    }

    const digits = digitsOnly(zip);
    if (digits === '') return;

    const label = definition.label;
    if (!definition.pattern.test(digits) || !zipExistsInLibrary(digits, rowsByZip5)) {
      errors.push({
        rule: definition.ruleCode,
        field,
        message: formatTwoPlaceholders(definition.message, label, digits),
        severity: 'error',
      });
      return;
    }

    const z5 = zip5(digits) ?? digits;
    const stateCode = state.toUpperCase();
    if (!findZipCodeInState(digits, stateCode, rowsByZip5)) {
      errors.push({
        rule: definition.stateRuleCode || definition.ruleCode,
        field,
        message: formatThreePlaceholders(definition.stateMessage, label, stateCode, z5),
        severity: 'error',
      });
      return;
    }

    const cityIssue = buildZipCityIssue(
      definition,
      field,
      digits,
      stateCode,
      city,
      rowsByZip5,
    );
    if (cityIssue) errors.push(cityIssue);
  });

  return errors;
}

/**
 * Laravel Rules::validateZipCodeRules — Phase 1 format + library, Phase 2 state, Phase 3 city/type.
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
      errors.push(...validateOtherSubscriberZipCodeRules(claim, definition, rowsByZip5));
      continue;
    }

    if (definition.requireEntity && definition.entity === 'facility' && !hasFacilityEntity(claim)) {
      continue;
    }

    if (!relationshipAllows(claim, definition)) {
      continue;
    }

    const [zip, state] = resolveEntityZipAndState(claim, definition.entity);
    const digits = digitsOnly(zip);
    if (digits === '') continue;

    const label = definition.label;
    const field = definition.field;
    const city = resolveEntityCity(claim, definition.entity);

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
      continue;
    }

    const cityIssue = buildZipCityIssue(
      definition,
      field,
      digits,
      stateCode,
      city,
      rowsByZip5,
    );
    if (cityIssue) errors.push(cityIssue);
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
  return extractZipDigitsFromAddress(address);
}
