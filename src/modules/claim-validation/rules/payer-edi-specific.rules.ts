import { AETNA_MEMBER_ID_PATTERNS, DOS_NOT_IN_FUTURE_RULE_CODE } from '../config/payer-edi-messages';
import { CLAIM_RULES, ClaimRuleDefinition } from '../config/claim-rules.config';
import { MEMBER_ID_FORMAT_RULES } from '../config/member-id-format-rules.config';
import { MEMBER_ID_RULES } from '../config/member-id-rules.config';
import { PLACES_OF_SERVICE } from '../config/places-of-service.config';
import {
  claimHasRelatedCausesCode,
  formatYmd,
  hasValidAdmissionDate,
  isValidAccidentDate,
  normalizePayerId,
  normalizePos,
  parseClaimDate,
  startOfLocalDay,
  digitsOnly,
} from '../support/payer-edi.helpers';
import {
  ClaimLevelDates,
  PayerEdiClaimInput,
  PayerEdiServiceLineInput,
} from '../types/payer-edi.types';
import { ClaimIssue } from '../types';
import {
  PayerEdiZipLookups,
  validateCityNameRules,
  validateZipCodeRules,
} from './payer-edi-zip-city.rules';
import {
  dispatchExtendedClaimRule,
  ExtendedClaimRuleLookups,
} from './payer-edi-claim-rules';

export { DOS_NOT_IN_FUTURE_RULE_CODE as DOS_FUT_001 };
export type { ClaimLevelDates, PayerEdiClaimInput, OtherSubscriberInput } from '../types/payer-edi.types';

export type PayerEdiLookups = PayerEdiZipLookups &
  ExtendedClaimRuleLookups & {
    /** Laravel MedicaidMemberIdFormatRepository::hasActiveFormatsForPayerId */
    medicaidAlMemberIdFormatsActive?: boolean;
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

/** Laravel PayerAndEdiSpecificRules DOS-FUT-001 (halt gate). */
export function validateDosNotInFuture(
  lines: PayerEdiServiceLineInput[],
  claimDates: ClaimLevelDates,
  today = startOfLocalDay(new Date()),
): ClaimIssue[] {
  const errors: ClaimIssue[] = [];
  const message =
    'Claim level or service line level DOS (%s) cannot be in the future.';

  for (const line of lines) {
    const from = line.serviceDateFrom;
    const to = line.serviceDateTo ?? from;
    const field =
      line.lineNumber > 0
        ? `service_lines.${line.lineNumber}.service_date_from`
        : 'service_date_from';

    if (from && to && from.getTime() > to.getTime()) {
      errors.push({
        rule: DOS_NOT_IN_FUTURE_RULE_CODE,
        field,
        message: message.replace('%s', formatYmd(from)),
        severity: 'error',
      });
    }
    if (from && from.getTime() > today.getTime()) {
      errors.push({
        rule: DOS_NOT_IN_FUTURE_RULE_CODE,
        field,
        message: message.replace('%s', formatYmd(from)),
        severity: 'error',
      });
    }
    if (to && to.getTime() > today.getTime() && (!from || to.getTime() !== from.getTime())) {
      errors.push({
        rule: DOS_NOT_IN_FUTURE_RULE_CODE,
        field:
          line.lineNumber > 0
            ? `service_lines.${line.lineNumber}.service_date_to`
            : 'service_date_to',
        message: message.replace('%s', formatYmd(to)),
        severity: 'error',
      });
    }
  }

  for (const def of CLAIM_LEVEL_DATE_FIELDS) {
    const date = claimDates[def.camel];
    if (date && date.getTime() > today.getTime()) {
      errors.push({
        rule: DOS_NOT_IN_FUTURE_RULE_CODE,
        field: def.field,
        message: message.replace('%s', formatYmd(date)),
        severity: 'error',
      });
    }
  }

  return errors;
}

/** Laravel Rules::validate — claim rules first; DOS-FUT early exit; then member/zip/city merge. */
export function validatePayerAndEdiSpecific(
  claim: PayerEdiClaimInput,
  lookups: PayerEdiLookups = {},
  today = startOfLocalDay(new Date()),
): ClaimIssue[] {
  const claimErrors = validateClaimRules(claim, lookups, today);
  if (hasDosNotInFutureFailure(claimErrors)) {
    return claimErrors;
  }

  return [
    ...validateMemberIdRules(claim, lookups),
    ...claimErrors,
    ...validateZipCodeRules(claim, lookups),
    ...validateCityNameRules(claim),
  ];
}

function hasDosNotInFutureFailure(issues: ClaimIssue[]): boolean {
  return issues.some((issue) => issue.rule === DOS_NOT_IN_FUTURE_RULE_CODE);
}

function validateClaimRules(
  claim: PayerEdiClaimInput,
  lookups: PayerEdiLookups,
  today: Date,
): ClaimIssue[] {
  const errors: ClaimIssue[] = [];
  const disabledRules = new Set<string>();

  for (const definition of CLAIM_RULES) {
    const type = definition.type;
    if (type === 'dos_not_in_future') {
      const dateErrors = validateDosNotInFuture(claim.serviceLines, claim, today);
      if (dateErrors.length > 0) {
        return dateErrors;
      }
      continue;
    }

    const issue = dispatchClaimRule(claim, definition, lookups, today);
    if (issue == null) continue;
    const batch = Array.isArray(issue) ? issue : [issue];
    if (batch.length > 0) {
      errors.push(...batch);
      const disables = (definition.disablesRules as string[] | undefined) ?? [];
      for (const code of disables) disabledRules.add(String(code));
    }
  }

  if (disabledRules.size === 0) return errors;
  return errors.filter((e) => !disabledRules.has(e.rule));
}

function dispatchClaimRule(
  claim: PayerEdiClaimInput,
  definition: ClaimRuleDefinition,
  lookups: PayerEdiLookups,
  today: Date,
): ClaimIssue | ClaimIssue[] | null {
  switch (definition.type) {
    case 'admission_date_required':
      return validateAdmissionDateRequired(claim, definition);
    case 'place_of_service_valid':
      return validatePlaceOfServiceValid(claim, definition);
    case 'uhc_pos_not_allowed':
      return validateUhcPosNotAllowed(claim, definition);
    case 'lmp_not_equal_onset_of_illness':
      return validateLmpNotEqualOnsetOfIllness(claim, definition);
    case 'lmp_requires_female_gender':
      return validateLmpRequiresFemaleGender(claim, definition);
    case 'accident_date_required':
      return validateAccidentDateRequired(claim, definition, today);
    case 'admission_date_might_not_be_required':
      return validateAdmissionDateMightNotBeRequired(claim, definition);
    default:
      return dispatchExtendedClaimRule(claim, definition, lookups, today);
  }
}
function validateAdmissionDateRequired(
  claim: PayerEdiClaimInput,
  definition: ClaimRuleDefinition,
): ClaimIssue | null {
  const pos = normalizePos(claim.placeOfService);
  const posList = (definition.placeOfService as string[] | undefined) ?? [];
  if (pos == null || !posList.includes(pos)) return null;
  if (hasValidAdmissionDate(claim.admissionDate)) return null;
  return {
    rule: definition.ruleCode,
    field: 'admission_date',
    message: definition.message,
    severity: 'error',
  };
}

function validatePlaceOfServiceValid(
  claim: PayerEdiClaimInput,
  definition: ClaimRuleDefinition,
): ClaimIssue | null {
  const rawPos = String(claim.placeOfService ?? '').trim();
  const pos = normalizePos(claim.placeOfService);
  if (pos != null && Object.prototype.hasOwnProperty.call(PLACES_OF_SERVICE, pos)) {
    return null;
  }
  return {
    rule: definition.ruleCode,
    field: 'place_of_service',
    message: definition.message.replace('%s', rawPos),
    severity: 'error',
  };
}

function validateUhcPosNotAllowed(
  claim: PayerEdiClaimInput,
  definition: ClaimRuleDefinition,
): ClaimIssue | null {
  const claimPayerId = normalizePayerId(claim.payerId);
  const expectedPayerId = normalizePayerId(String(definition.payerId ?? ''));
  if (claimPayerId === '' || claimPayerId !== expectedPayerId) return null;

  const pos = normalizePos(claim.placeOfService);
  const disallowedPos = normalizePos(String(definition.disallowedPlaceOfService ?? '02'));
  if (pos == null || disallowedPos == null || pos !== disallowedPos) return null;

  return {
    rule: definition.ruleCode,
    field: 'place_of_service',
    message: definition.message,
    severity: 'error',
  };
}

function validateLmpNotEqualOnsetOfIllness(
  claim: PayerEdiClaimInput,
  definition: ClaimRuleDefinition,
): ClaimIssue | null {
  const onset = parseClaimDate(claim.onsetOfIllnessDate);
  const lmp = parseClaimDate(claim.lastMenstrualPeriodDate);
  if (onset == null || lmp == null) return null;
  if (onset.getTime() !== lmp.getTime()) return null;
  return {
    rule: definition.ruleCode,
    field: 'last_menstrual_period_date',
    message: definition.message,
    severity: 'error',
  };
}

function validateLmpRequiresFemaleGender(
  claim: PayerEdiClaimInput,
  definition: ClaimRuleDefinition,
): ClaimIssue | null {
  const lmp = parseClaimDate(claim.lastMenstrualPeriodDate);
  if (lmp == null) return null;
  let gender = String(claim.patientGender ?? '')
    .trim()
    .toUpperCase();
  if (gender === '') {
    gender = String(claim.subscriberGender ?? '')
      .trim()
      .toUpperCase();
  }
  if (gender === 'F') return null;
  return {
    rule: definition.ruleCode,
    field: 'patient_gender',
    message: definition.message,
    severity: 'error',
  };
}

function validateAccidentDateRequired(
  claim: PayerEdiClaimInput,
  definition: ClaimRuleDefinition,
  today: Date,
): ClaimIssue | null {
  const filingIndicator = String(claim.claimFilingIndicator ?? '')
    .trim()
    .toUpperCase();
  const filingIndicators = (
    (definition.filingIndicators as string[] | undefined) ?? ['WC', 'AM']
  ).map((v) => v.toUpperCase());
  const requiresByFilingIndicator =
    filingIndicator !== '' && filingIndicators.includes(filingIndicator);

  const allowedCauses = (
    (definition.relatedCausesCodes as string[] | undefined) ?? ['AA', 'OA', 'EM']
  ).map((v) => v.toUpperCase());
  const requiresByRelatedCause = claimHasRelatedCausesCode(
    claim.relatedCausesCode,
    allowedCauses,
  );

  if (!requiresByFilingIndicator && !requiresByRelatedCause) return null;
  if (isValidAccidentDate(claim.accidentDate, today)) return null;

  return {
    rule: definition.ruleCode,
    field: 'accident_date',
    message: definition.message.replace('{FILING_INDICATOR}', filingIndicator),
    severity: 'error',
  };
}

function validateAdmissionDateMightNotBeRequired(
  claim: PayerEdiClaimInput,
  definition: ClaimRuleDefinition,
): ClaimIssue | null {
  const pos = normalizePos(claim.placeOfService);
  const posList = (definition.placeOfService as string[] | undefined) ?? [];
  if (pos == null || !posList.includes(pos)) return null;
  if (!hasValidAdmissionDate(claim.admissionDate)) return null;
  return {
    rule: definition.ruleCode,
    field: 'admission_date',
    message: definition.message.replace('%s', pos),
    severity: 'error',
  };
}

function validateMemberIdRules(
  claim: PayerEdiClaimInput,
  lookups: PayerEdiLookups,
): ClaimIssue[] {
  const payerId = normalizePayerId(claim.payerId);
  if (payerId === '') return [];

  const errors: ClaimIssue[] = [];
  const memberId = String(claim.subscriberMemberId ?? '').trim();
  const definition = MEMBER_ID_RULES[payerId];

  if (definition != null) {
    switch (definition.type) {
      case 'no_subscriber_ssn':
        errors.push(...validateNoSubscriberSsn(claim, definition));
        break;
      case 'aetna_member_id': {
        const err = validateAetnaMemberId(claim, definition);
        if (err != null) errors.push(err);
        break;
      }
      case 'medicaid_al_member_id': {
        const err = validateMedicaidAlMemberId(claim, definition, lookups);
        if (err != null) errors.push(err);
        break;
      }
      case 'ssn_or_nine_digit':
        if (memberId !== '' && !passesSsnOrNineDigit(memberId, claim)) {
          errors.push({
            rule: definition.ruleCode,
            field: 'subscriber_member_id',
            message: definition.message,
            severity: 'error',
          });
        }
        break;
      case 'regex':
        if (memberId === '' || !definition.pattern.test(memberId)) {
          errors.push({
            rule: definition.ruleCode,
            field: 'subscriber_member_id',
            message: definition.message,
            severity: 'error',
          });
        }
        break;
      default: {
        const _exhaustive: never = definition;
        return _exhaustive;
      }
    }
  }

  const formatError = validateMemberIdFormatCatalog(payerId, memberId);
  if (formatError != null) errors.push(formatError);

  return errors;
}

function validateMemberIdFormatCatalog(
  payerId: string,
  memberId: string,
): ClaimIssue | null {
  let definition = MEMBER_ID_FORMAT_RULES[payerId];
  if (definition == null) {
    definition = MEMBER_ID_FORMAT_RULES[payerId.toUpperCase()];
  }
  if (definition == null) return null;
  if (memberId !== '' && definition.pattern.test(memberId)) return null;
  return {
    rule: definition.ruleCode,
    field: 'subscriber_member_id',
    message: definition.message.replace('%s', memberId),
    severity: 'error',
  };
}

function validateMedicaidAlMemberId(
  claim: PayerEdiClaimInput,
  definition: Extract<(typeof MEMBER_ID_RULES)[string], { type: 'medicaid_al_member_id' }>,
  lookups: PayerEdiLookups,
): ClaimIssue | null {
  if (!lookups.medicaidAlMemberIdFormatsActive) return null;
  const memberId = String(claim.subscriberMemberId ?? '').trim();
  if (memberId === '') return null;
  if (definition.pattern.test(memberId)) return null;
  return {
    rule: definition.ruleCode,
    field: 'subscriber_member_id',
    message: definition.message,
    severity: 'error',
  };
}

function validateAetnaMemberId(
  claim: PayerEdiClaimInput,
  definition: Extract<(typeof MEMBER_ID_RULES)[string], { type: 'aetna_member_id' }>,
): ClaimIssue | null {
  if (String(claim.payerId ?? '').trim().toLowerCase() === 'paper') return null;
  const memberId = String(claim.subscriberMemberId ?? '').trim();
  if (memberId === '') return null;
  for (const pattern of AETNA_MEMBER_ID_PATTERNS) {
    if (pattern.test(memberId)) return null;
  }
  return {
    rule: definition.ruleCode,
    field: 'subscriber_member_id',
    message: definition.message,
    severity: 'error',
  };
}

function validateNoSubscriberSsn(
  claim: PayerEdiClaimInput,
  definition: Extract<(typeof MEMBER_ID_RULES)[string], { type: 'no_subscriber_ssn' }>,
): ClaimIssue[] {
  if (String(claim.subscriberSsn ?? '').trim() !== '') {
    return [
      {
        rule: definition.ruleCode,
        field: 'subscriber_ssn',
        message: definition.message,
        severity: 'error',
      },
    ];
  }

  const others = claim.otherSubscribers ?? [];
  for (let index = 0; index < others.length; index++) {
    const other = others[index];
    if (String(other.ssn ?? '').trim() === '') continue;
    return [
      {
        rule: definition.ruleCode,
        field: index === 0 ? 'other_subscribers' : `other_subscribers.${index}.ssn`,
        message: definition.message,
        severity: 'error',
      },
    ];
  }

  return [];
}

function passesSsnOrNineDigit(memberId: string, claim: PayerEdiClaimInput): boolean {
  const ssn = String(claim.subscriberSsn ?? '').trim();
  if (ssn !== '') {
    return digitsOnly(memberId) === digitsOnly(ssn);
  }
  return /^\d{9}$/.test(memberId);
}
