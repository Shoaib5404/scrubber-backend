import { ClaimRuleDefinition } from '../config/claim-rules.config';
import {
  AETNA_CONSULTATION_CPT_RANGES,
  AETNA_CONSULTATION_MEMBER_ID_PREFIX,
  AETNA_CONSULTATION_MESSAGE,
  AFFINITY_ALPHA_MEMBER_ID_PATTERN,
  AFFINITY_MIDDLE_LETTER_MEMBER_ID_PATTERN,
  AFFINITY_NINE_DIGIT_MEMBER_ID_PATTERN,
  AFFINITY_ROUTING_MESSAGE,
  BCBS_MI_MEMBER_ID_PREFIX_PATTERN,
  BCBS_MI_ROUTING_MESSAGE,
  BCBS_NE_CONSULTATION_CPT_RANGES,
  BCBS_NE_CONSULTATION_MESSAGE,
  BCBS_NE_CONSULTATION_PAYER_ID,
  BCBS_WNY_AMERIGROUP_MEMBER_ID_PREFIX_PATTERN,
  BCBS_WNY_AMERIGROUP_MESSAGE,
  BILLING_PROVIDER_NAME_MESSAGE,
  BILLING_PROVIDER_NAME_PATTERN,
  BILLING_TAX_ID_INVALID_MESSAGE,
  BILLING_TAX_ID_MESSAGE,
  BILLING_TAX_ID_NOT_PLACEHOLDER_PATTERN,
  BILLING_TAX_ID_PATTERN,
  BLUE_CROSS_IDAHO_ALPHA_PREFIX_PATTERN,
  BLUE_CROSS_IDAHO_ROUTING_MESSAGE,
  CLAIM_LEVEL_DATE_FIELDS,
  CLAIM_LEVEL_DATE_MESSAGE,
  CLAIM_LEVEL_DATE_MIN,
  CLAIM_NUMBER_REQUIRED_WITH_REPLACEMENT_MESSAGE,
  CORRECTED_VOID_FREQUENCY_CODES,
  CORRECTED_VOID_PAPER_ONLY_MESSAGE,
  CORRECTED_VOID_PAPER_ONLY_PAYER_IDS,
  DISTINCT_PROCEDURAL_59_XEPSU_MESSAGE,
  DISTINCT_PROCEDURAL_BASE_MODIFIER,
  DISTINCT_PROCEDURAL_XEPSU_MODIFIERS,
  DOB_AFTER_DOS_MESSAGE,
  EPSDT_MEDICAID_FILING_INDICATOR,
  EPSDT_MODIFIER,
  EPSDT_NON_MEDICAID_MESSAGE,
  HOSPITAL_BENEFITS_BL_MESSAGE,
  HOSPITAL_BENEFITS_MEMBER_ID_PREFIX_PATTERN,
  HOSPICE_CARE_MODIFIER_REQUIRED_MESSAGE,
  HOSPICE_CARE_PROCEDURE_CODES,
  HOSPICE_MEDICARE_FILING_INDICATOR,
  HOSPICE_MODIFIER_NON_MEDICARE_MESSAGE,
  HOSPICE_MODIFIERS,
  MAMMOGRAPHY_CERTIFICATION_MISSING_MESSAGE,
  MAMMOGRAPHY_CPT_RANGE_END,
  MAMMOGRAPHY_CPT_RANGE_START,
  MAMMOGRAPHY_EXCLUDED_MODIFIER,
  MCD_PATIENT_ENTITY_NOT_ALLOWED_MESSAGE,
  MCD_PATIENT_RELATIONSHIP_FILING_INDICATORS,
  MCD_PATIENT_RELATIONSHIP_PAYER_IDS,
  MCD_PATIENT_RELATIONSHIP_SELF_MESSAGE,
  MEDICAID_HOME_HEALTH_CERT_FILING_INDICATOR,
  MEDICAID_HOME_HEALTH_CERT_MESSAGE,
  MEDICAID_HOME_HEALTH_CERT_PROCEDURE_CODES,
  MEDICARE_ADVANTAGE_EXPECTED_PAYER_ID,
  MEDICARE_ADVANTAGE_MEMBER_ID_PREFIXES,
  MEDICARE_ADVANTAGE_ROUTING_MESSAGE,
  MEDICARE_CONSULTATION_CPT_CODES,
  MEDICARE_CONSULTATION_CPT_MESSAGE,
  MEDICARE_CORRECTED_VOID_ELECTRONIC_MESSAGE,
  MEDICARE_CORRECTED_VOID_FILING_INDICATORS,
  MEDICARE_CORRECTED_VOID_FREQUENCY_CODES,
  MEDICARE_MBI_ALPHA_CHARS,
  MEDICARE_MBI_FILING_INDICATORS,
  MEDICARE_MBI_INVALID_MESSAGE,
  MEDICARE_MBI_LENGTH,
  MEDICARE_MEDICAID_GROUP_EXCLUDED_PAYER_ID,
  MEDICARE_MEDICAID_GROUP_NOT_ALLOWED_FILING_INDICATORS,
  MEDICARE_MEDICAID_GROUP_NOT_ALLOWED_MESSAGE,
  MEDICARE_ORIGINAL_FREQUENCY_CODE,
  MEDICARE_ORIGINAL_FREQUENCY_FILING_INDICATOR,
  MEDICARE_ORIGINAL_FREQUENCY_MESSAGE,
  MEDICARE_SECONDARY_INSURANCE_TYPE_CODE_REQUIRED_MESSAGE,
  MEDICARE_SECONDARY_TERTIARY_FILING_INDICATORS,
  MEDICARE_SECONDARY_TERTIARY_PAYER_RESPONSIBILITIES,
  MODIFIER_50_UNITS_GT_ONE_MESSAGE,
  PATIENT_FIRST_NAME_INVALID_MESSAGE,
  PATIENT_FIRST_NAME_PATTERN,
  PATIENT_LAST_NAME_INVALID_MESSAGE,
  PATIENT_LAST_NAME_PATTERN,
  REFERRING_PROVIDER_REQUIRED_WITH_REFERRAL_MESSAGE,
  REGENCE_MEMBER_ID_PREFIX_PATTERN,
  REGENCE_ROUTING_MESSAGE,
  REPLACEMENT_FREQUENCY_CODES,
  SERVICE_LOCATION_NAME_INVALID_MESSAGE,
  SERVICE_LOCATION_NAME_PATTERN,
  SERVICE_LOCATION_NAME_STARTS_WITH_NUMBER_MESSAGE,
  SSN_INVALID_MESSAGE,
  SSN_PATTERN,
  SUBSCRIBER_LAST_NAME_FORMAT_PATTERN,
  SUBSCRIBER_NAME_BLOCKLIST,
  SUBSCRIBER_NAME_PATTERN,
  SUBSCRIBER_NAME_TEST_PATIENT_MESSAGE,
  SUBSCRIBER_NAME_VALIDATE_MESSAGE,
} from '../config/payer-edi-claim-constants';
import {
  ClaimLevelDates,
  OtherSubscriberInput,
  PayerEdiClaimInput,
  PayerEdiServiceLineInput,
} from '../types/payer-edi.types';
import { ClaimIssue } from '../types';
import { normalizePayerId, parseClaimDate, startOfLocalDay } from '../support/payer-edi.helpers';
import {
  dispatchRemainingClaimRule,
  RemainingClaimRuleLookups,
} from './payer-edi-remaining-claim-rules';

type CptRange = { from: number; to: number };

export type ExtendedClaimRuleLookups = RemainingClaimRuleLookups;

/** Dispatch ported CLAIM_RULES handlers (Laravel Rules.php validateClaimRules). */
export function dispatchExtendedClaimRule(
  claim: PayerEdiClaimInput,
  definition: ClaimRuleDefinition,
  lookups: ExtendedClaimRuleLookups = {},
  today: Date = startOfLocalDay(new Date()),
): ClaimIssue | ClaimIssue[] | null {
  switch (definition.type) {
    case 'billing_provider_no_po_box':
      return validateBillingProviderNoPoBox(claim, definition);
    case 'billing_provider_tax_id_length':
      return validateBillingProviderTaxIdLength(claim, definition);
    case 'ssn_format':
      return validateSsnFormat(claim, definition);
    case 'billing_provider_name_required':
      return validateBillingProviderNameRequired(claim, definition);
    case 'service_location_name_format':
      return validateServiceLocationNameFormat(claim, definition);
    case 'billing_facility_npi_distinct':
      return validateBillingFacilityNpiDistinct(claim, definition);
    case 'billing_rendering_npi_distinct':
      return validateBillingRenderingNpiDistinct(claim, definition);
    case 'rendering_facility_npi_distinct':
      return validateRenderingFacilityNpiDistinct(claim, definition);
    case 'medicare_hcpcs_s_code_not_allowed':
      return validateMedicareHcpcsSCodeNotAllowed(claim, definition);
    case 'medicare_consultation_cpt_not_allowed':
      return validateMedicareConsultationCptNotAllowed(claim, definition);
    case 'bcbs_ne_consultation_cpt_not_allowed':
      return validateBcbsNeConsultationCptNotAllowed(claim, definition);
    case 'aetna_consultation_cpt_not_allowed':
      return validateAetnaConsultationCptNotAllowed(claim, definition);
    case 'subscriber_member_id_not_equal_group_number':
      return validateSubscriberMemberIdNotEqualGroupNumber(claim, definition);
    case 'value_options_member_id_routing':
    case 'student_resources_member_id_routing':
    case 'neighborhood_member_id_routing':
      return validateValueOptionsMemberIdRouting(claim, definition);
    case 'hospital_benefits_bl_not_allowed':
      return validateHospitalBenefitsBlNotAllowed(claim, definition);
    case 'affinity_member_id_routing':
      return validateAffinityMemberIdRouting(claim, definition);
    case 'regence_member_id_prefix_routing':
      return validateRegenceMemberIdPrefixRouting(claim, definition);
    case 'blue_cross_idaho_member_id_prefix_routing':
      return validateBlueCrossIdahoMemberIdPrefixRouting(claim, definition);
    case 'bcbs_mi_member_id_prefix_routing':
      return validateBcbsMiMemberIdPrefixRouting(claim, definition);
    case 'bcbs_wny_amerigroup_member_id_prefix':
      return validateBcbsWnyAmerigroupMemberIdPrefix(claim, definition);
    case 'medicaid_subscriber_relationship_self':
      return validateMedicaidSubscriberRelationshipSelf(claim, definition);
    case 'aarp_not_primary':
      return validateAarpNotPrimary(claim, definition);
    case 'insurance_type_code_not_allowed_non_medicare_secondary':
      return validateInsuranceTypeCodeNotAllowedNonMedicareSecondary(claim, definition);
    case 'medicare_secondary_tertiary_insurance_type_code_required':
      return validateMedicareSecondaryTertiaryInsuranceTypeCodeRequired(claim, definition);
    case 'medicare_medicaid_subscriber_group_not_allowed':
      return validateMedicareMedicaidSubscriberGroupNotAllowed(claim, definition);
    case 'upin_state_license_not_allowed_for_mb':
      return validateUpinStateLicenseNotAllowedForMb(claim, definition);
    case 'subscriber_self_name_required':
      return validateSubscriberSelfNameRequired(claim, definition);
    case 'subscriber_name_validate':
      return validateSubscriberName(claim, definition);
    case 'patient_name_required':
      return validatePatientNameRequired(claim, definition);
    case 'patient_name_format':
      return validatePatientNameFormat(claim, definition);
    case 'subscriber_dob_not_after_dos':
      return validateSubscriberDobNotAfterDos(claim, definition);
    case 'patient_dob_not_after_dos':
      return validatePatientDobNotAfterDos(claim, definition);
    case 'claim_level_dates_in_range':
      return validateClaimLevelDatesInRange(claim, definition);
    case 'referring_provider_required_with_referral_or_auth':
      return validateReferringProviderRequiredWithReferralOrAuth(claim, definition);
    case 'claim_number_required_with_replacement':
      return validateClaimNumberRequiredWithReplacement(claim, definition);
    case 'medicare_original_frequency_required':
      return validateMedicareOriginalFrequencyRequired(claim, definition);
    case 'medicare_corrected_void_not_accepted_electronically':
      return validateMedicareCorrectedVoidNotAcceptedElectronically(claim, definition);
    case 'corrected_void_not_accepted_electronically':
      return validateCorrectedVoidNotAcceptedElectronically(claim, definition);
    case 'mammography_certification_number_required':
      return validateMammographyCertificationNumberRequired(claim, definition);
    case 'mcd_patient_relationship_self':
      return validateMcdPatientRelationshipSelf(claim, definition);
    case 'medicare_advantage_member_id_routing':
      return validateMedicareAdvantageMemberIdRouting(claim, definition);
    case 'medicare_beneficiary_identifier_format':
      return validateMedicareBeneficiaryIdentifierFormat(claim, definition);
    case 'modifier_50_units_gt_one':
      return validateModifier50UnitsGtOne(claim, definition);
    case 'epsdt_modifier_requires_medicaid':
      return validateEpsdtModifierRequiresMedicaid(claim, definition);
    case 'hospice_modifier_requires_medicare':
      return validateHospiceModifierRequiresMedicare(claim, definition);
    case 'hospice_care_modifier_required':
      return validateHospiceCareModifierRequired(claim, definition);
    case 'medicaid_home_health_cert_not_covered':
      return validateMedicaidHomeHealthCertNotCovered(claim, definition);
    case 'distinct_procedural_59_xepsu_conflict':
      return validateDistinctProcedural59XepsuConflict(claim, definition);
    default:
      return dispatchRemainingClaimRule(claim, definition, lookups, today);
  }
}

function issue(
  definition: ClaimRuleDefinition,
  field: string,
  message: string,
  severity: ClaimIssue['severity'] = 'error',
  rule?: string,
): ClaimIssue {
  return {
    rule: rule ?? definition.ruleCode,
    field,
    message,
    severity,
  };
}

function otherSubscribers(claim: PayerEdiClaimInput): OtherSubscriberInput[] {
  return claim.otherSubscribers ?? [];
}

function hasBillingProviderEntity(claim: PayerEdiClaimInput): boolean {
  return (
    String(claim.billingProviderNpi ?? '').trim() !== '' ||
    String(claim.billingProviderName ?? '').trim() !== ''
  );
}

function hasRenderingProviderEntity(claim: PayerEdiClaimInput): boolean {
  return [
    claim.renderingProviderLastName,
    claim.renderingProviderFirstName,
    claim.renderingProviderMiddleName,
    claim.renderingProviderNpi,
  ].some((v) => String(v ?? '').trim() !== '');
}

function hasReferringProviderEntity(claim: PayerEdiClaimInput): boolean {
  return [
    claim.referringProviderLastName,
    claim.referringProviderFirstName,
    claim.referringProviderMiddleName,
    claim.referringProviderNpi,
  ].some((v) => String(v ?? '').trim() !== '');
}

function hasProcedureReferringProviderEntity(claim: PayerEdiClaimInput): boolean {
  for (const line of claim.serviceLines) {
    if (
      [
        line.referringProviderLastName,
        line.referringProviderFirstName,
        line.referringProviderMiddleName,
        line.referringProviderNpi,
      ].some((v) => String(v ?? '').trim() !== '')
    ) {
      return true;
    }
  }
  return false;
}

function hasPatientEntity(claim: PayerEdiClaimInput): boolean {
  return (
    String(claim.patientLastName ?? '').trim() !== '' ||
    String(claim.patientFirstName ?? '').trim() !== '' ||
    String(claim.patientRelationship ?? '').trim() !== '' ||
    String(claim.patientGender ?? '').trim() !== '' ||
    String(claim.patientAddress ?? '').trim() !== '' ||
    claim.patientDob != null
  );
}

function hasMedicareFilingIndicator(
  claim: PayerEdiClaimInput,
  filingIndicators: string[],
): boolean {
  const normalized = filingIndicators.map((v) => v.toUpperCase());
  const billing = String(claim.claimFilingIndicator ?? '')
    .trim()
    .toUpperCase();
  if (normalized.includes(billing)) return true;
  for (const other of otherSubscribers(claim)) {
    if (String(other.payerResponsibility ?? '').trim().toUpperCase() !== 'P') continue;
    const primary = String(other.claimFilingIndicator ?? '')
      .trim()
      .toUpperCase();
    if (normalized.includes(primary)) return true;
  }
  return false;
}

function normalizeModifier(raw: string | null | undefined): string {
  const mod = String(raw ?? '')
    .trim()
    .toUpperCase();
  if (mod === '') return '';
  return mod.padStart(2, '0');
}

function lineModifiers(line: PayerEdiServiceLineInput): string[] {
  return [line.modifier1, line.modifier2, line.modifier3, line.modifier4]
    .map((m) => normalizeModifier(m))
    .filter((m) => m !== '');
}

function lineHasModifier(line: PayerEdiServiceLineInput, modifier: string): boolean {
  const expected = normalizeModifier(modifier);
  return lineModifiers(line).includes(expected);
}

function lineExactModifierField(
  line: PayerEdiServiceLineInput,
  modifier: string,
): string | null {
  const expected = normalizeModifier(modifier);
  const fields = [
    ['modifier_1', line.modifier1],
    ['modifier_2', line.modifier2],
    ['modifier_3', line.modifier3],
    ['modifier_4', line.modifier4],
  ] as const;
  for (const [field, raw] of fields) {
    if (normalizeModifier(raw) === expected) return field;
  }
  return null;
}

function cptInNumericRanges(code: string, ranges: readonly CptRange[]): boolean {
  if (code === '' || !/^\d+$/.test(code)) return false;
  const value = Number(code);
  return ranges.some((r) => value >= r.from && value <= r.to);
}

function isProcedureInRange(code: string, start: number, end: number): boolean {
  if (code === '' || !/^\d+$/.test(code)) return false;
  const value = Number(code);
  return value >= start && value <= end;
}

function unitsGreaterThan(units: number | null | undefined, minExclusive: number): boolean {
  const n = Number(units);
  return Number.isFinite(n) && n > minExclusive;
}

function validateBillingProviderNoPoBox(
  claim: PayerEdiClaimInput,
  definition: ClaimRuleDefinition,
): ClaimIssue | null {
  let line1 = String(claim.billingProviderAddressLine1 ?? '').trim();
  let line2 = String(claim.billingProviderAddressLine2 ?? '').trim();
  if (line1 === '' && line2 === '' && String(claim.billingProviderAddress ?? '').trim() !== '') {
    line1 = String(claim.billingProviderAddress).trim();
  }
  if (line1 === '' && line2 === '') return null;
  if (!isPoBoxAddressLine(line1) && !isPoBoxAddressLine(line2)) return null;
  return issue(
    definition,
    isPoBoxAddressLine(line1) ? 'billing_provider_address_line_1' : 'billing_provider_address_line_2',
    definition.message ||
      'Billing Provider Address cannot be "PO BOX" address. Only physical address is allowed',
  );
}

function isPoBoxAddressLine(line: string): boolean {
  let normalized = line.toLowerCase().trim();
  normalized = normalized.replace(/p\s*\.\s*o\s*\./g, 'po');
  normalized = normalized.replace(/\s+/g, ' ').trim();
  if (normalized === '') return false;
  if (normalized.startsWith('po box')) return true;
  if (normalized.startsWith('post office') || firstWord(normalized) === 'post') return true;
  return firstWord(normalized) === 'box';
}

function firstWord(s: string): string {
  return s.split(/\s+/)[0] ?? '';
}

function validateBillingProviderTaxIdLength(
  claim: PayerEdiClaimInput,
  definition: ClaimRuleDefinition,
): ClaimIssue | null {
  if (!hasBillingProviderEntity(claim)) return null;
  const taxId = String(claim.billingProviderTaxId ?? '').trim();
  if (taxId === '') return null;
  const pattern =
    (definition.pattern as RegExp | undefined) ?? BILLING_TAX_ID_PATTERN;
  const notPlaceholder =
    (definition.notPlaceholderPattern as RegExp | undefined) ??
    BILLING_TAX_ID_NOT_PLACEHOLDER_PATTERN;
  if (!pattern.test(taxId)) {
    return issue(definition, 'billing_provider_tax_id', definition.message || BILLING_TAX_ID_MESSAGE);
  }
  if (notPlaceholder.test(taxId)) return null;
  const invalidMessage =
    String(definition.invalidMessage ?? BILLING_TAX_ID_INVALID_MESSAGE).replace('%s', taxId);
  return issue(
    definition,
    'billing_provider_tax_id',
    invalidMessage,
    'error',
    String(definition.invalidRuleCode ?? definition.ruleCode),
  );
}

function validateSsnFormat(
  claim: PayerEdiClaimInput,
  definition: ClaimRuleDefinition,
): ClaimIssue[] {
  const errors: ClaimIssue[] = [];
  const pattern = (definition.pattern as RegExp | undefined) ?? SSN_PATTERN;
  const messageTpl = definition.message || SSN_INVALID_MESSAGE;

  const subscriberSsn = String(claim.subscriberSsn ?? '').trim();
  if (subscriberSsn !== '' && !isValidSsn(subscriberSsn, pattern)) {
    errors.push(issue(definition, 'subscriber_ssn', messageTpl.replace('%s', subscriberSsn)));
  }
  otherSubscribers(claim).forEach((other, index) => {
    const ssn = String(other.ssn ?? '').trim();
    if (ssn === '' || isValidSsn(ssn, pattern)) return;
    errors.push(
      issue(
        definition,
        index === 0 ? 'other_subscribers' : `other_subscribers.${index}.ssn`,
        messageTpl.replace('%s', ssn),
      ),
    );
  });
  const billingSsn = String(claim.billingProviderSsn ?? '').trim();
  if (billingSsn !== '' && !isValidSsn(billingSsn, pattern)) {
    errors.push(issue(definition, 'billing_provider_ssn', messageTpl.replace('%s', billingSsn)));
  }
  return errors;
}

function isValidSsn(ssn: string, pattern: RegExp): boolean {
  if (!pattern.test(ssn)) return false;
  if (ssn.slice(0, 3) === '000') return false;
  if (ssn.slice(3, 5) === '00') return false;
  if (ssn.slice(5, 9) === '0000') return false;
  if (ssn === '000000000') return false;
  return true;
}

function validateBillingProviderNameRequired(
  claim: PayerEdiClaimInput,
  definition: ClaimRuleDefinition,
): ClaimIssue | null {
  const name = String(claim.billingProviderName ?? '').trim();
  const pattern =
    (definition.pattern as RegExp | undefined) ?? BILLING_PROVIDER_NAME_PATTERN;
  if (name !== '' && pattern.test(name)) return null;
  return issue(
    definition,
    'billing_provider_name',
    (definition.message || BILLING_PROVIDER_NAME_MESSAGE).replace('%s', name),
  );
}

function validateServiceLocationNameFormat(
  claim: PayerEdiClaimInput,
  definition: ClaimRuleDefinition,
): ClaimIssue | null {
  const name = String(claim.facilityName ?? '').trim();
  if (name === '') return null;
  if (/^[0-9]/.test(name)) {
    return issue(
      definition,
      'facility_name',
      definition.message || SERVICE_LOCATION_NAME_STARTS_WITH_NUMBER_MESSAGE,
    );
  }
  const pattern =
    (definition.pattern as RegExp | undefined) ?? SERVICE_LOCATION_NAME_PATTERN;
  if (pattern.test(name)) return null;
  return issue(
    definition,
    'facility_name',
    String(definition.invalidMessage ?? SERVICE_LOCATION_NAME_INVALID_MESSAGE).replace(
      '%s',
      name,
    ),
    'error',
    String(definition.invalidRuleCode ?? definition.ruleCode),
  );
}

function validateBillingFacilityNpiDistinct(
  claim: PayerEdiClaimInput,
  definition: ClaimRuleDefinition,
): ClaimIssue | null {
  if (String(claim.facilityName ?? '').trim() === '') return null;
  const facilityNpi = String(claim.facilityNpi ?? '').trim();
  const billingNpi = String(claim.billingProviderNpi ?? '').trim();
  if (facilityNpi === '' || billingNpi === '' || facilityNpi !== billingNpi) return null;
  return issue(
    definition,
    'facility_npi',
    definition.message || 'Billing NPI and Service Facility NPI cannot be the same.',
  );
}

function validateBillingRenderingNpiDistinct(
  claim: PayerEdiClaimInput,
  definition: ClaimRuleDefinition,
): ClaimIssue | null {
  if (String(claim.payerId ?? '').trim().toLowerCase() === 'paper') return null;
  if (!hasRenderingProviderEntity(claim)) return null;
  const renderingNpi = String(claim.renderingProviderNpi ?? '').trim();
  const billingNpi = String(claim.billingProviderNpi ?? '').trim();
  if (renderingNpi === '' || billingNpi === '' || renderingNpi !== billingNpi) return null;
  return issue(
    definition,
    'rendering_provider_npi',
    definition.message ||
      'Rendering Provider is only required in case different than Billing Provider.',
  );
}

function validateRenderingFacilityNpiDistinct(
  claim: PayerEdiClaimInput,
  definition: ClaimRuleDefinition,
): ClaimIssue | null {
  const facilityNpi = String(claim.facilityNpi ?? '').trim();
  const renderingNpi = String(claim.renderingProviderNpi ?? '').trim();
  if (facilityNpi === '' || renderingNpi === '' || renderingNpi !== facilityNpi) return null;
  return issue(
    definition,
    'rendering_provider_npi',
    definition.message || 'Rendering Provider and Service Location NPI cannot be the same.',
  );
}

function validateMedicareHcpcsSCodeNotAllowed(
  claim: PayerEdiClaimInput,
  definition: ClaimRuleDefinition,
): ClaimIssue[] {
  const filingIndicators = (
    (definition.filingIndicators as string[] | undefined) ?? ['MA', 'MB']
  ).map((v) => v.toUpperCase());
  if (!hasMedicareFilingIndicator(claim, filingIndicators)) return [];
  const errors: ClaimIssue[] = [];
  for (const line of claim.serviceLines) {
    const code = String(line.procedureCode ?? '').trim();
    if (code === '' || code[0].toUpperCase() !== 'S') continue;
    errors.push(
      issue(
        definition,
        `service_lines.${line.lineNumber}.procedure_code`,
        (definition.message || 'HCPCS %s is not valid for Medicare.').replace(
          '%s',
          code.toUpperCase(),
        ),
      ),
    );
  }
  return errors;
}

function validateMedicareConsultationCptNotAllowed(
  claim: PayerEdiClaimInput,
  definition: ClaimRuleDefinition,
): ClaimIssue[] {
  const memberId = String(claim.subscriberMemberId ?? '').trim();
  const prefix = String(definition.memberIdPrefix ?? 'MC');
  if (memberId === '' || prefix === '' || !memberId.startsWith(prefix)) return [];
  const claimPayerId = normalizePayerId(claim.payerId);
  const expectedPayerId = normalizePayerId(String(definition.payerId ?? '27094'));
  if (claimPayerId === '' || claimPayerId !== expectedPayerId) return [];
  const blocked = (
    (definition.codes as string[] | undefined) ?? [...MEDICARE_CONSULTATION_CPT_CODES]
  ).map((c) => c.toUpperCase());
  const errors: ClaimIssue[] = [];
  for (const line of claim.serviceLines) {
    const code = String(line.procedureCode ?? '')
      .trim()
      .toUpperCase();
    if (code === '' || !blocked.includes(code)) continue;
    errors.push(
      issue(
        definition,
        `service_lines.${line.lineNumber}.procedure_code`,
        definition.message || MEDICARE_CONSULTATION_CPT_MESSAGE,
      ),
    );
  }
  return errors;
}

function validateBcbsNeConsultationCptNotAllowed(
  claim: PayerEdiClaimInput,
  definition: ClaimRuleDefinition,
): ClaimIssue[] {
  const claimPayerId = normalizePayerId(claim.payerId);
  const expectedPayerId = normalizePayerId(
    String(definition.payerId ?? BCBS_NE_CONSULTATION_PAYER_ID),
  );
  if (claimPayerId === '' || claimPayerId !== expectedPayerId) return [];
  const ranges =
    (definition.cptRanges as CptRange[] | undefined) ?? [...BCBS_NE_CONSULTATION_CPT_RANGES];
  const errors: ClaimIssue[] = [];
  for (const line of claim.serviceLines) {
    const code = String(line.procedureCode ?? '')
      .trim()
      .toUpperCase();
    if (code === '' || !cptInNumericRanges(code, ranges)) continue;
    errors.push(
      issue(
        definition,
        `service_lines.${line.lineNumber}.procedure_code`,
        definition.message || BCBS_NE_CONSULTATION_MESSAGE,
      ),
    );
  }
  return errors;
}

function validateAetnaConsultationCptNotAllowed(
  claim: PayerEdiClaimInput,
  definition: ClaimRuleDefinition,
): ClaimIssue[] {
  const memberId = String(claim.subscriberMemberId ?? '').trim();
  const prefix = String(definition.memberIdPrefix ?? AETNA_CONSULTATION_MEMBER_ID_PREFIX);
  if (memberId === '' || prefix === '' || !memberId.startsWith(prefix)) return [];
  const ranges =
    (definition.cptRanges as CptRange[] | undefined) ?? [...AETNA_CONSULTATION_CPT_RANGES];
  const warnings: ClaimIssue[] = [];
  for (const line of claim.serviceLines) {
    const code = String(line.procedureCode ?? '')
      .trim()
      .toUpperCase();
    if (code === '' || !cptInNumericRanges(code, ranges)) continue;
    warnings.push(
      issue(
        definition,
        `service_lines.${line.lineNumber}.procedure_code`,
        (definition.message || AETNA_CONSULTATION_MESSAGE).replace('%s', code),
        'warning',
      ),
    );
  }
  return warnings;
}

function validateSubscriberMemberIdNotEqualGroupNumber(
  claim: PayerEdiClaimInput,
  definition: ClaimRuleDefinition,
): ClaimIssue | null {
  const memberId = String(claim.subscriberMemberId ?? '').trim();
  if (memberId === '') return null;
  const groups = collectGroupNumbers(claim);
  if (groups.length === 0) return null;
  if (!groups.some((g) => g !== '' && g === memberId)) return null;
  return issue(
    definition,
    'subscriber_member_id',
    definition.message ||
      'Subscriber or other subscriber member ID and group number cannot be the same.',
  );
}

function collectGroupNumbers(claim: PayerEdiClaimInput): string[] {
  const out: string[] = [];
  const subscriberGroup = String(claim.subscriberGroupNumber ?? '').trim();
  if (subscriberGroup !== '') out.push(subscriberGroup);
  for (const other of otherSubscribers(claim)) {
    const g = String(other.groupNumber ?? '').trim();
    if (g !== '') out.push(g);
  }
  return out;
}

function validateValueOptionsMemberIdRouting(
  claim: PayerEdiClaimInput,
  definition: ClaimRuleDefinition,
): ClaimIssue | null {
  const memberId = String(claim.subscriberMemberId ?? '').trim();
  if (memberId === '') return null;
  const pattern = definition.pattern as RegExp | undefined;
  if (pattern == null || !pattern.test(memberId)) return null;
  const claimPayerId = String(claim.payerId ?? '')
    .trim()
    .toUpperCase();
  const expectedPayerId = String(definition.payerId ?? '')
    .trim()
    .toUpperCase();
  if (claimPayerId === '' || claimPayerId !== expectedPayerId) return null;
  return issue(definition, 'payer_id', definition.message);
}

function validateHospitalBenefitsBlNotAllowed(
  claim: PayerEdiClaimInput,
  definition: ClaimRuleDefinition,
): ClaimIssue | null {
  const memberId = String(claim.subscriberMemberId ?? '').trim();
  if (memberId === '') return null;
  const pattern =
    (definition.pattern as RegExp | undefined) ?? HOSPITAL_BENEFITS_MEMBER_ID_PREFIX_PATTERN;
  if (!pattern.test(memberId)) return null;
  const filing = String(claim.claimFilingIndicator ?? '')
    .trim()
    .toUpperCase();
  const disallowed = String(definition.filingIndicator ?? 'BL')
    .trim()
    .toUpperCase();
  if (filing === '' || filing !== disallowed) return null;
  return issue(
    definition,
    'claim_filing_indicator',
    definition.message || HOSPITAL_BENEFITS_BL_MESSAGE,
  );
}

function validateAffinityMemberIdRouting(
  claim: PayerEdiClaimInput,
  definition: ClaimRuleDefinition,
): ClaimIssue | null {
  const memberId = String(claim.subscriberMemberId ?? '').trim();
  if (memberId === '') return null;
  const claimPayerId = normalizePayerId(claim.payerId);
  if (claimPayerId === '') return null;
  if (AFFINITY_MIDDLE_LETTER_MEMBER_ID_PATTERN.test(memberId)) {
    return affinityRoutingErrorIfNeeded(claimPayerId, '13333', ['13334', '23334'], 'MID-AFF-003', definition);
  }
  if (AFFINITY_NINE_DIGIT_MEMBER_ID_PATTERN.test(memberId)) {
    return affinityRoutingErrorIfNeeded(claimPayerId, '13334', ['23334', '13333'], 'MID-AFF-002', definition);
  }
  if (AFFINITY_ALPHA_MEMBER_ID_PATTERN.test(memberId)) {
    return affinityRoutingErrorIfNeeded(claimPayerId, '23334', ['13334', '13333'], 'MID-AFF-001', definition);
  }
  return null;
}

function affinityRoutingErrorIfNeeded(
  claimPayerId: string,
  expectedPayerId: string,
  preconditionPayerIds: string[],
  ruleCode: string,
  definition: ClaimRuleDefinition,
): ClaimIssue | null {
  const expected = normalizePayerId(expectedPayerId);
  const preconditions = preconditionPayerIds.map((p) => normalizePayerId(p));
  if (!preconditions.includes(claimPayerId)) return null;
  if (claimPayerId === expected) return null;
  return issue(
    definition,
    'payer_id',
    (definition.message || AFFINITY_ROUTING_MESSAGE).replace('%s', expected),
    'error',
    ruleCode,
  );
}

function validateRegenceMemberIdPrefixRouting(
  claim: PayerEdiClaimInput,
  definition: ClaimRuleDefinition,
): ClaimIssue | null {
  const filing = String(claim.claimFilingIndicator ?? '')
    .trim()
    .toUpperCase();
  if (filing === '' || filing !== String(definition.filingIndicator ?? 'BL').toUpperCase()) {
    return null;
  }
  const memberId = String(claim.subscriberMemberId ?? '').trim();
  if (memberId === '') return null;
  const pattern =
    (definition.pattern as RegExp | undefined) ?? REGENCE_MEMBER_ID_PREFIX_PATTERN;
  if (!pattern.test(memberId)) return null;
  const claimPayerId = normalizePayerId(claim.payerId);
  const expectedPayerId = normalizePayerId(String(definition.expectedPayerId ?? '00611'));
  if (claimPayerId !== '' && claimPayerId === expectedPayerId) return null;
  return issue(definition, 'payer_id', definition.message || REGENCE_ROUTING_MESSAGE);
}

function validateBlueCrossIdahoMemberIdPrefixRouting(
  claim: PayerEdiClaimInput,
  definition: ClaimRuleDefinition,
): ClaimIssue | null {
  const filing = String(claim.claimFilingIndicator ?? '')
    .trim()
    .toUpperCase();
  if (filing === '' || filing !== String(definition.filingIndicator ?? 'BL').toUpperCase()) {
    return null;
  }
  const memberId = String(claim.subscriberMemberId ?? '').trim();
  if (memberId === '') return null;
  const alpha =
    (definition.alphaPrefixPattern as RegExp | undefined) ?? BLUE_CROSS_IDAHO_ALPHA_PREFIX_PATTERN;
  if (!alpha.test(memberId)) return null;
  const excluded =
    (definition.excludedPrefixPattern as RegExp | undefined) ?? REGENCE_MEMBER_ID_PREFIX_PATTERN;
  if (excluded.test(memberId)) return null;
  const claimPayerId = normalizePayerId(claim.payerId).toUpperCase();
  const expectedPayerId = normalizePayerId(String(definition.expectedPayerId ?? 'BLUEC')).toUpperCase();
  if (claimPayerId !== '' && claimPayerId === expectedPayerId) return null;
  return issue(definition, 'payer_id', definition.message || BLUE_CROSS_IDAHO_ROUTING_MESSAGE);
}

function validateBcbsMiMemberIdPrefixRouting(
  claim: PayerEdiClaimInput,
  definition: ClaimRuleDefinition,
): ClaimIssue | null {
  const memberId = String(claim.subscriberMemberId ?? '').trim();
  if (memberId === '') return null;
  const pattern =
    (definition.pattern as RegExp | undefined) ?? BCBS_MI_MEMBER_ID_PREFIX_PATTERN;
  if (!pattern.test(memberId)) return null;
  const claimPayerId = normalizePayerId(claim.payerId);
  const expectedPayerId = normalizePayerId(String(definition.expectedPayerId ?? '00710'));
  const filing = String(claim.claimFilingIndicator ?? '')
    .trim()
    .toUpperCase();
  const disallowed = String(definition.disallowedFilingIndicator ?? 'MB')
    .trim()
    .toUpperCase();
  if (claimPayerId !== '' && claimPayerId === expectedPayerId && filing !== disallowed) {
    return null;
  }
  return issue(
    definition,
    'payer_id',
    (definition.message || BCBS_MI_ROUTING_MESSAGE).replace(
      '%s',
      memberId.slice(0, 3).toUpperCase(),
    ),
  );
}

function validateBcbsWnyAmerigroupMemberIdPrefix(
  claim: PayerEdiClaimInput,
  definition: ClaimRuleDefinition,
): ClaimIssue | null {
  const memberId = String(claim.subscriberMemberId ?? '').trim();
  if (memberId === '') return null;
  const pattern =
    (definition.pattern as RegExp | undefined) ?? BCBS_WNY_AMERIGROUP_MEMBER_ID_PREFIX_PATTERN;
  if (!pattern.test(memberId)) return null;
  const claimPayerId = String(claim.payerId ?? '')
    .trim()
    .toUpperCase();
  const expectedPayerId = String(definition.payerId ?? 'SB801')
    .trim()
    .toUpperCase();
  if (claimPayerId === '' || claimPayerId !== expectedPayerId) return null;
  return issue(definition, 'payer_id', definition.message || BCBS_WNY_AMERIGROUP_MESSAGE);
}

function validateMedicaidSubscriberRelationshipSelf(
  claim: PayerEdiClaimInput,
  definition: ClaimRuleDefinition,
): ClaimIssue | null {
  const filing = String(claim.claimFilingIndicator ?? '')
    .trim()
    .toUpperCase();
  if (filing !== String(definition.filingIndicator ?? 'MC').toUpperCase()) return null;
  const relationship = String(claim.subscriberRelationship ?? '')
    .trim()
    .toUpperCase();
  if (relationship === String(definition.relationshipCode ?? '18').toUpperCase()) return null;
  return issue(
    definition,
    'subscriber_relationship',
    definition.message || 'Subscriber relationship must be Self for Medicaid',
  );
}

function validateAarpNotPrimary(
  claim: PayerEdiClaimInput,
  definition: ClaimRuleDefinition,
): ClaimIssue | null {
  const claimPayerId = normalizePayerId(claim.payerId);
  const expectedPayerId = normalizePayerId(String(definition.payerId ?? '36273'));
  if (claimPayerId === '' || claimPayerId !== expectedPayerId) return null;
  const responsibility = String(claim.payerResponsibility ?? '')
    .trim()
    .toUpperCase();
  const disallowed = String(definition.disallowedPayerResponsibility ?? 'P')
    .trim()
    .toUpperCase();
  if (responsibility === '' || responsibility !== disallowed) return null;
  return issue(
    definition,
    'payer_responsibility',
    definition.message || 'AAPR (Payer ID 36273) cannot be used as primary insurance.',
  );
}

function validateInsuranceTypeCodeNotAllowedNonMedicareSecondary(
  claim: PayerEdiClaimInput,
  definition: ClaimRuleDefinition,
): ClaimIssue | null {
  const filing = String(claim.claimFilingIndicator ?? '')
    .trim()
    .toUpperCase();
  const excluded = (
    (definition.excludedFilingIndicators as string[] | undefined) ?? ['MA', 'MB']
  ).map((v) => v.toUpperCase());
  if (filing !== '' && excluded.includes(filing)) return null;
  const responsibility = String(claim.payerResponsibility ?? '')
    .trim()
    .toUpperCase();
  if (responsibility !== String(definition.payerResponsibility ?? 'S').toUpperCase()) return null;
  if (String(claim.insuranceTypeCode ?? '').trim() === '') return null;
  return issue(
    definition,
    'insurance_type_code',
    definition.message ||
      'Insurance type code is only required when secondary insurance is Medicare.',
  );
}

function validateMedicareSecondaryTertiaryInsuranceTypeCodeRequired(
  claim: PayerEdiClaimInput,
  definition: ClaimRuleDefinition,
): ClaimIssue | null {
  const filing = String(claim.claimFilingIndicator ?? '')
    .trim()
    .toUpperCase();
  const filingIndicators = (
    (definition.filingIndicators as string[] | undefined) ?? [
      ...MEDICARE_SECONDARY_TERTIARY_FILING_INDICATORS,
    ]
  ).map((v) => v.toUpperCase());
  if (filing === '' || !filingIndicators.includes(filing)) return null;
  const responsibility = String(claim.payerResponsibility ?? '')
    .trim()
    .toUpperCase();
  const responsibilities = (
    (definition.payerResponsibilities as string[] | undefined) ?? [
      ...MEDICARE_SECONDARY_TERTIARY_PAYER_RESPONSIBILITIES,
    ]
  ).map((v) => v.toUpperCase());
  if (responsibility === '' || !responsibilities.includes(responsibility)) return null;
  if (String(claim.insuranceTypeCode ?? '').trim() !== '') return null;
  return issue(
    definition,
    'insurance_type_code',
    definition.message || MEDICARE_SECONDARY_INSURANCE_TYPE_CODE_REQUIRED_MESSAGE,
  );
}

function validateMedicareMedicaidSubscriberGroupNotAllowed(
  claim: PayerEdiClaimInput,
  definition: ClaimRuleDefinition,
): ClaimIssue | null {
  const filing = String(claim.claimFilingIndicator ?? '')
    .trim()
    .toUpperCase();
  const filingIndicators = (
    (definition.filingIndicators as string[] | undefined) ?? [
      ...MEDICARE_MEDICAID_GROUP_NOT_ALLOWED_FILING_INDICATORS,
    ]
  ).map((v) => v.toUpperCase());
  if (filing === '' || !filingIndicators.includes(filing)) return null;
  const claimPayerId = normalizePayerId(claim.payerId).toUpperCase();
  const excluded = normalizePayerId(
    String(definition.excludedPayerId ?? MEDICARE_MEDICAID_GROUP_EXCLUDED_PAYER_ID),
  ).toUpperCase();
  if (excluded !== '' && claimPayerId === excluded) return null;
  const groupNumber = String(claim.subscriberGroupNumber ?? '').trim();
  const groupName = String(claim.subscriberGroupName ?? '').trim();
  if (groupNumber === '' && groupName === '') return null;
  return issue(
    definition,
    groupNumber !== '' ? 'subscriber_group_number' : 'subscriber_group_name',
    definition.message || MEDICARE_MEDICAID_GROUP_NOT_ALLOWED_MESSAGE,
  );
}

function validateUpinStateLicenseNotAllowedForMb(
  claim: PayerEdiClaimInput,
  definition: ClaimRuleDefinition,
): ClaimIssue | null {
  const filing = String(claim.claimFilingIndicator ?? '')
    .trim()
    .toUpperCase();
  if (filing !== String(definition.filingIndicator ?? 'MB').toUpperCase()) return null;
  const fields: Array<[string, string | null | undefined]> = [
    ['billing_provider_upin', claim.billingProviderUpin],
    ['billing_provider_state_license', claim.billingProviderStateLicense],
    ['rendering_provider_upin', claim.renderingProviderUpin],
    ['rendering_provider_state_license', claim.renderingProviderStateLicense],
    ['referring_provider_upin', claim.referringProviderUpin],
    ['referring_provider_state_license', claim.referringProviderStateLicense],
  ];
  for (const [field, value] of fields) {
    if (String(value ?? '').trim() === '') continue;
    return issue(
      definition,
      field,
      definition.message || 'UPIN or state license number is not allowed for MB.',
    );
  }
  return null;
}

function validateSubscriberSelfNameRequired(
  claim: PayerEdiClaimInput,
  definition: ClaimRuleDefinition,
): ClaimIssue | null {
  const relationship = String(claim.subscriberRelationship ?? '')
    .trim()
    .toUpperCase();
  if (relationship !== String(definition.relationshipCode ?? '18').toUpperCase()) return null;
  const pattern = (definition.pattern as RegExp | undefined) ?? SUBSCRIBER_NAME_PATTERN;
  const blocked = (
    (definition.blockedNames as string[] | undefined) ?? [...SUBSCRIBER_NAME_BLOCKLIST]
  ).map((n) => n.toUpperCase());
  const fields: Array<[string, string]> = [
    ['subscriber_first_name', String(claim.subscriberFirstName ?? '').trim()],
    ['subscriber_last_name', String(claim.subscriberLastName ?? '').trim()],
  ];
  for (const [field, name] of fields) {
    if (name === '' || !pattern.test(name) || blocked.includes(name.toUpperCase())) {
      return issue(
        definition,
        field,
        definition.message || SUBSCRIBER_NAME_TEST_PATIENT_MESSAGE,
      );
    }
  }
  return null;
}

function validateSubscriberName(
  claim: PayerEdiClaimInput,
  definition: ClaimRuleDefinition,
): ClaimIssue | null {
  const firstName = String(claim.subscriberFirstName ?? '')
    .trim()
    .toUpperCase();
  const lastNameRaw = String(claim.subscriberLastName ?? '').trim();
  const lastName = lastNameRaw.toUpperCase();
  const blocked = (
    (definition.blockedNames as string[] | undefined) ?? [...SUBSCRIBER_NAME_BLOCKLIST]
  ).map((n) => n.toUpperCase());
  const lastNamePattern =
    (definition.lastNamePattern as RegExp | undefined) ?? SUBSCRIBER_LAST_NAME_FORMAT_PATTERN;
  if (
    blocked.includes(firstName) ||
    blocked.includes(lastName) ||
    !lastNamePattern.test(lastNameRaw)
  ) {
    let field = 'subscriber_last_name';
    if (
      blocked.includes(firstName) &&
      !blocked.includes(lastName) &&
      lastNamePattern.test(lastNameRaw)
    ) {
      field = 'subscriber_first_name';
    }
    return issue(definition, field, definition.message || SUBSCRIBER_NAME_VALIDATE_MESSAGE);
  }
  return null;
}

function validatePatientNameRequired(
  claim: PayerEdiClaimInput,
  definition: ClaimRuleDefinition,
): ClaimIssue | null {
  if (String(claim.subscriberRelationship ?? '').trim() !== '') return null;
  if (!hasPatientEntity(claim)) return null;
  const pattern = (definition.pattern as RegExp | undefined) ?? SUBSCRIBER_NAME_PATTERN;
  const blocked = (
    (definition.blockedNames as string[] | undefined) ?? [...SUBSCRIBER_NAME_BLOCKLIST]
  ).map((n) => n.toUpperCase());
  const fields: Array<[string, string]> = [
    ['patient_first_name', String(claim.patientFirstName ?? '').trim()],
    ['patient_last_name', String(claim.patientLastName ?? '').trim()],
  ];
  for (const [field, name] of fields) {
    if (name === '' || !pattern.test(name) || blocked.includes(name.toUpperCase())) {
      return issue(
        definition,
        field,
        definition.message || SUBSCRIBER_NAME_TEST_PATIENT_MESSAGE,
      );
    }
  }
  return null;
}

function validatePatientNameFormat(
  claim: PayerEdiClaimInput,
  definition: ClaimRuleDefinition,
): ClaimIssue[] {
  if (!hasPatientEntity(claim)) return [];
  const errors: ClaimIssue[] = [];
  const lastName = String(claim.patientLastName ?? '').trim();
  const lastPattern =
    (definition.lastNamePattern as RegExp | undefined) ?? PATIENT_LAST_NAME_PATTERN;
  if (lastName === '' || !lastPattern.test(lastName)) {
    errors.push(
      issue(
        definition,
        'patient_last_name',
        String(definition.lastNameMessage ?? PATIENT_LAST_NAME_INVALID_MESSAGE).replace(
          '%s',
          lastName,
        ),
      ),
    );
  }
  const firstName = String(claim.patientFirstName ?? '').trim();
  const firstPattern =
    (definition.firstNamePattern as RegExp | undefined) ?? PATIENT_FIRST_NAME_PATTERN;
  if (firstName === '' || !firstPattern.test(firstName)) {
    errors.push(
      issue(
        definition,
        'patient_first_name',
        String(definition.firstNameMessage ?? PATIENT_FIRST_NAME_INVALID_MESSAGE).replace(
          '%s',
          firstName,
        ),
        'error',
        String(definition.firstNameRuleCode ?? 'PAT-FNAME-001'),
      ),
    );
  }
  return errors;
}

function validateSubscriberDobNotAfterDos(
  claim: PayerEdiClaimInput,
  definition: ClaimRuleDefinition,
): ClaimIssue | null {
  const relationship = String(claim.subscriberRelationship ?? '')
    .trim()
    .toUpperCase();
  if (relationship !== String(definition.relationshipCode ?? '18').toUpperCase()) return null;
  const dob = parseClaimDate(claim.subscriberDob);
  if (dob == null) return null;
  if (!dobIsAfterAnyServiceDate(claim, dob)) return null;
  return issue(definition, 'subscriber_dob', definition.message || DOB_AFTER_DOS_MESSAGE);
}

function validatePatientDobNotAfterDos(
  claim: PayerEdiClaimInput,
  definition: ClaimRuleDefinition,
): ClaimIssue | null {
  if (String(claim.patientRelationship ?? '').trim() !== '') return null;
  if (!hasPatientEntity(claim)) return null;
  const dob = parseClaimDate(claim.patientDob);
  if (dob == null) return null;
  if (!dobIsAfterAnyServiceDate(claim, dob)) return null;
  return issue(definition, 'patient_dob', definition.message || DOB_AFTER_DOS_MESSAGE);
}

function dobIsAfterAnyServiceDate(claim: PayerEdiClaimInput, dob: Date): boolean {
  for (const line of claim.serviceLines) {
    const dos = parseClaimDate(line.serviceDateFrom);
    if (dos == null) continue;
    if (dob.getTime() > dos.getTime()) return true;
  }
  return false;
}

function validateClaimLevelDatesInRange(
  claim: PayerEdiClaimInput,
  definition: ClaimRuleDefinition,
): ClaimIssue[] {
  const creationCaps = resolveCreationCapDates(claim);
  if (creationCaps.length === 0) return [];
  const minDate = parseClaimDate(
    String(definition.minDate ?? CLAIM_LEVEL_DATE_MIN),
  );
  if (minDate == null) return [];
  const earliestDos = earliestServiceDateFrom(claim);
  const errors: ClaimIssue[] = [];
  for (const fieldDef of CLAIM_LEVEL_DATE_FIELDS) {
    const date = parseClaimDate(claim[fieldDef.camel as keyof ClaimLevelDates]);
    if (date == null) continue;
    const afterCreationCap = creationCaps.some((cap) => date.getTime() > cap.getTime());
    const afterDos = earliestDos != null && date.getTime() > earliestDos.getTime();
    if (date.getTime() < minDate.getTime() || afterCreationCap || afterDos) {
      errors.push(
        issue(
          definition,
          fieldDef.field,
          (definition.message || CLAIM_LEVEL_DATE_MESSAGE).replace('%s', fieldDef.label),
          'error',
          fieldDef.ruleCode,
        ),
      );
    }
  }
  return errors;
}

function resolveCreationCapDates(claim: PayerEdiClaimInput): Date[] {
  const dates: Date[] = [];
  const isa = parseClaimDate(claim.batchIsaDate);
  if (isa != null) dates.push(isa);
  const bht = parseClaimDate(claim.transactionSetCreationDate ?? claim.batchBhtDate ?? null);
  if (bht != null) dates.push(bht);
  return dates;
}

function earliestServiceDateFrom(claim: PayerEdiClaimInput): Date | null {
  let earliest: Date | null = null;
  for (const line of claim.serviceLines) {
    const dos = parseClaimDate(line.serviceDateFrom);
    if (dos == null) continue;
    if (earliest == null || dos.getTime() < earliest.getTime()) earliest = dos;
  }
  return earliest;
}

function validateReferringProviderRequiredWithReferralOrAuth(
  claim: PayerEdiClaimInput,
  definition: ClaimRuleDefinition,
): ClaimIssue | null {
  const hasReferral = String(claim.referralNumber ?? '').trim() !== '';
  const hasAuth = String(claim.priorAuthNumber ?? '').trim() !== '';
  if (!hasReferral && !hasAuth) return null;
  if (hasReferringProviderEntity(claim) || hasProcedureReferringProviderEntity(claim)) return null;
  return issue(
    definition,
    'referring_provider_npi',
    definition.message || REFERRING_PROVIDER_REQUIRED_WITH_REFERRAL_MESSAGE,
  );
}

function validateClaimNumberRequiredWithReplacement(
  claim: PayerEdiClaimInput,
  definition: ClaimRuleDefinition,
): ClaimIssue | null {
  const frequency = String(claim.frequencyCode ?? '').trim();
  const codes = (
    (definition.frequencyCodes as string[] | undefined) ?? [...REPLACEMENT_FREQUENCY_CODES]
  ).map((c) => String(c).trim());
  if (frequency === '' || !codes.includes(frequency)) return null;
  if (String(claim.originalReferenceNumber ?? '').trim() !== '') return null;
  return issue(
    definition,
    'original_reference_number',
    definition.message || CLAIM_NUMBER_REQUIRED_WITH_REPLACEMENT_MESSAGE,
  );
}

function validateMedicareOriginalFrequencyRequired(
  claim: PayerEdiClaimInput,
  definition: ClaimRuleDefinition,
): ClaimIssue | null {
  const filing = String(claim.claimFilingIndicator ?? '')
    .trim()
    .toUpperCase();
  if (
    filing !==
    String(definition.filingIndicator ?? MEDICARE_ORIGINAL_FREQUENCY_FILING_INDICATOR).toUpperCase()
  ) {
    return null;
  }
  const frequency = String(claim.frequencyCode ?? '').trim();
  if (frequency === String(definition.frequencyCode ?? MEDICARE_ORIGINAL_FREQUENCY_CODE).trim()) {
    return null;
  }
  return issue(
    definition,
    'frequency_code',
    definition.message || MEDICARE_ORIGINAL_FREQUENCY_MESSAGE,
  );
}

function validateMedicareCorrectedVoidNotAcceptedElectronically(
  claim: PayerEdiClaimInput,
  definition: ClaimRuleDefinition,
): ClaimIssue | null {
  const filing = String(claim.claimFilingIndicator ?? '')
    .trim()
    .toUpperCase();
  const filingIndicators = (
    (definition.filingIndicators as string[] | undefined) ?? [
      ...MEDICARE_CORRECTED_VOID_FILING_INDICATORS,
    ]
  ).map((v) => v.toUpperCase());
  if (filing === '' || !filingIndicators.includes(filing)) return null;
  const frequency = String(claim.frequencyCode ?? '').trim();
  const blocked = (
    (definition.frequencyCodes as string[] | undefined) ?? [
      ...MEDICARE_CORRECTED_VOID_FREQUENCY_CODES,
    ]
  ).map((c) => String(c).trim());
  if (frequency === '' || !blocked.includes(frequency)) return null;
  return issue(
    definition,
    'frequency_code',
    definition.message || MEDICARE_CORRECTED_VOID_ELECTRONIC_MESSAGE,
  );
}

function validateCorrectedVoidNotAcceptedElectronically(
  claim: PayerEdiClaimInput,
  definition: ClaimRuleDefinition,
): ClaimIssue | null {
  const claimPayerId = normalizePayerId(claim.payerId);
  const payerIds = (
    (definition.payerIds as string[] | undefined) ?? [...CORRECTED_VOID_PAPER_ONLY_PAYER_IDS]
  ).map((id) => normalizePayerId(id));
  if (claimPayerId === '' || !payerIds.includes(claimPayerId)) return null;
  const frequency = String(claim.frequencyCode ?? '').trim();
  const blocked = (
    (definition.frequencyCodes as string[] | undefined) ?? [...CORRECTED_VOID_FREQUENCY_CODES]
  ).map((c) => String(c).trim());
  if (frequency === '' || !blocked.includes(frequency)) return null;
  return issue(
    definition,
    'frequency_code',
    definition.message || CORRECTED_VOID_PAPER_ONLY_MESSAGE,
  );
}

function validateMammographyCertificationNumberRequired(
  claim: PayerEdiClaimInput,
  definition: ClaimRuleDefinition,
): ClaimIssue[] {
  if (String(claim.mammographyCertificationNumber ?? '').trim() !== '') return [];
  const rangeStart = Number(definition.cptRangeStart ?? MAMMOGRAPHY_CPT_RANGE_START);
  const rangeEnd = Number(definition.cptRangeEnd ?? MAMMOGRAPHY_CPT_RANGE_END);
  const excluded = normalizeModifier(
    String(definition.excludedModifier ?? MAMMOGRAPHY_EXCLUDED_MODIFIER),
  );
  const errors: ClaimIssue[] = [];
  const reported = new Set<string>();
  for (const line of claim.serviceLines) {
    const code = String(line.procedureCode ?? '')
      .trim()
      .toUpperCase();
    if (code === '' || reported.has(code)) continue;
    if (!isProcedureInRange(code, rangeStart, rangeEnd)) continue;
    const mods = lineModifiers(line);
    if (mods.length === 0) continue;
    if (mods.includes(excluded)) continue;
    reported.add(code);
    errors.push(
      issue(
        definition,
        'mammography_certification_number',
        (definition.message || MAMMOGRAPHY_CERTIFICATION_MISSING_MESSAGE).replace('%s', code),
      ),
    );
  }
  return errors;
}

function validateMcdPatientRelationshipSelf(
  claim: PayerEdiClaimInput,
  definition: ClaimRuleDefinition,
): ClaimIssue[] {
  const filingIndicators = (
    (definition.filingIndicators as string[] | undefined) ?? [
      ...MCD_PATIENT_RELATIONSHIP_FILING_INDICATORS,
    ]
  ).map((v) => v.toUpperCase());
  const filing = String(claim.claimFilingIndicator ?? '')
    .trim()
    .toUpperCase();
  const payerIds = (
    (definition.payerIds as string[] | undefined) ?? [...MCD_PATIENT_RELATIONSHIP_PAYER_IDS]
  ).map((id) => normalizePayerId(id));
  const claimPayerId = normalizePayerId(claim.payerId);
  const precondition =
    (filing !== '' && filingIndicators.includes(filing)) ||
    (claimPayerId !== '' && payerIds.includes(claimPayerId));
  if (!precondition) return [];

  const expected = String(definition.relationshipCode ?? '18')
    .trim()
    .toUpperCase();
  const relationship = String(claim.subscriberRelationship ?? '')
    .trim()
    .toUpperCase();
  const errors: ClaimIssue[] = [];
  if (relationship !== expected) {
    errors.push(
      issue(
        definition,
        'subscriber_relationship',
        definition.message || MCD_PATIENT_RELATIONSHIP_SELF_MESSAGE,
      ),
    );
  }
  if (hasPatientEntity(claim)) {
    errors.push(
      issue(
        definition,
        'patient_last_name',
        String(definition.patientEntityMessage ?? MCD_PATIENT_ENTITY_NOT_ALLOWED_MESSAGE),
      ),
    );
  }
  return errors;
}

function validateMedicareAdvantageMemberIdRouting(
  claim: PayerEdiClaimInput,
  definition: ClaimRuleDefinition,
): ClaimIssue | null {
  const memberId = String(claim.subscriberMemberId ?? '').trim();
  if (memberId === '') return null;
  const claimPayerId = normalizePayerId(claim.payerId);
  const expectedPayerId = normalizePayerId(
    String(definition.expectedPayerId ?? MEDICARE_ADVANTAGE_EXPECTED_PAYER_ID),
  );
  if (claimPayerId !== '' && claimPayerId === expectedPayerId) return null;
  const prefixes = (
    (definition.prefixes as string[] | undefined) ?? [...MEDICARE_ADVANTAGE_MEMBER_ID_PREFIXES]
  ).map((p) => p.toUpperCase());
  const upper = memberId.toUpperCase();
  if (!prefixes.some((p) => p !== '' && upper.startsWith(p))) return null;
  return issue(
    definition,
    'payer_id',
    definition.message || MEDICARE_ADVANTAGE_ROUTING_MESSAGE,
  );
}

function validateMedicareBeneficiaryIdentifierFormat(
  claim: PayerEdiClaimInput,
  definition: ClaimRuleDefinition,
): ClaimIssue[] {
  const filingIndicators = (
    (definition.filingIndicators as string[] | undefined) ?? [...MEDICARE_MBI_FILING_INDICATORS]
  ).map((v) => v.toUpperCase());
  const message = definition.message || MEDICARE_MBI_INVALID_MESSAGE;
  const errors: ClaimIssue[] = [];
  const primaryFiling = String(claim.claimFilingIndicator ?? '')
    .trim()
    .toUpperCase();
  if (primaryFiling !== '' && filingIndicators.includes(primaryFiling)) {
    const memberId = String(claim.subscriberMemberId ?? '').trim();
    if (memberId !== '' && !isValidMedicareBeneficiaryIdentifier(memberId)) {
      errors.push(issue(definition, 'subscriber_member_id', message));
    }
  }
  otherSubscribers(claim).forEach((other, index) => {
    const otherFiling = String(other.claimFilingIndicator ?? '')
      .trim()
      .toUpperCase();
    if (otherFiling === '' || !filingIndicators.includes(otherFiling)) return;
    const memberId = String(other.memberId ?? '').trim();
    if (memberId === '' || isValidMedicareBeneficiaryIdentifier(memberId)) return;
    errors.push(issue(definition, `other_subscribers.${index}.member_id`, message));
  });
  return errors;
}

function isValidMedicareBeneficiaryIdentifier(memberId: string): boolean {
  if (memberId.length !== MEDICARE_MBI_LENGTH) return false;
  const alpha = MEDICARE_MBI_ALPHA_CHARS;
  const pattern = new RegExp(
    `^[0-9][${alpha}][${alpha}0-9][0-9][${alpha}][${alpha}0-9][0-9][${alpha}]{2}[0-9]{2}$`,
  );
  return pattern.test(memberId);
}

function validateModifier50UnitsGtOne(
  claim: PayerEdiClaimInput,
  definition: ClaimRuleDefinition,
): ClaimIssue[] {
  const filing = String(claim.claimFilingIndicator ?? '')
    .trim()
    .toUpperCase();
  if (filing === '' || filing !== String(definition.filingIndicator ?? 'BL').toUpperCase()) {
    return [];
  }
  const requiredModifier = String(definition.modifier ?? '50').toUpperCase();
  const minUnits = Number(definition.minUnits ?? 1);
  const errors: ClaimIssue[] = [];
  for (const line of claim.serviceLines) {
    if (!lineHasModifier(line, requiredModifier)) continue;
    if (unitsGreaterThan(line.units, minUnits)) continue;
    errors.push(
      issue(
        definition,
        `service_lines.${line.lineNumber}.units`,
        definition.message || MODIFIER_50_UNITS_GT_ONE_MESSAGE,
      ),
    );
  }
  return errors;
}

function validateEpsdtModifierRequiresMedicaid(
  claim: PayerEdiClaimInput,
  definition: ClaimRuleDefinition,
): ClaimIssue[] {
  const filing = String(claim.claimFilingIndicator ?? '')
    .trim()
    .toUpperCase();
  const medicaid = String(
    definition.medicaidFilingIndicator ?? EPSDT_MEDICAID_FILING_INDICATOR,
  ).toUpperCase();
  if (filing === '' || filing === medicaid) return [];
  const requiredModifier = String(definition.modifier ?? EPSDT_MODIFIER);
  const severity = (definition.severity as ClaimIssue['severity'] | undefined) ?? 'warning';
  const errors: ClaimIssue[] = [];
  for (const line of claim.serviceLines) {
    if (!lineHasModifier(line, requiredModifier)) continue;
    const field = lineExactModifierField(line, requiredModifier) ?? 'modifier_1';
    errors.push(
      issue(
        definition,
        `service_lines.${line.lineNumber}.${field}`,
        definition.message || EPSDT_NON_MEDICAID_MESSAGE,
        severity,
      ),
    );
  }
  return errors;
}

function validateHospiceModifierRequiresMedicare(
  claim: PayerEdiClaimInput,
  definition: ClaimRuleDefinition,
): ClaimIssue[] {
  const filing = String(claim.claimFilingIndicator ?? '')
    .trim()
    .toUpperCase();
  const medicare = String(
    definition.medicareFilingIndicator ?? HOSPICE_MEDICARE_FILING_INDICATOR,
  ).toUpperCase();
  if (filing === medicare) return [];
  const allowed = new Set(
    ((definition.modifiers as string[] | undefined) ?? [...HOSPICE_MODIFIERS]).map((m) =>
      m.trim(),
    ),
  );
  const errors: ClaimIssue[] = [];
  for (const line of claim.serviceLines) {
    const fields: Array<[string, string | null | undefined]> = [
      ['modifier_1', line.modifier1],
      ['modifier_2', line.modifier2],
      ['modifier_3', line.modifier3],
      ['modifier_4', line.modifier4],
    ];
    for (const [field, raw] of fields) {
      const modifier = String(raw ?? '').trim();
      if (modifier === '' || !allowed.has(modifier)) continue;
      errors.push(
        issue(
          definition,
          `service_lines.${line.lineNumber}.${field}`,
          (definition.message || HOSPICE_MODIFIER_NON_MEDICARE_MESSAGE).replace('%s', modifier),
        ),
      );
    }
  }
  return errors;
}

function validateHospiceCareModifierRequired(
  claim: PayerEdiClaimInput,
  definition: ClaimRuleDefinition,
): ClaimIssue[] {
  const procedureLookup = new Set(
    ((definition.procedureCodes as string[] | undefined) ?? [...HOSPICE_CARE_PROCEDURE_CODES]).map(
      (c) => c.toUpperCase(),
    ),
  );
  const allowedModifiers = new Set(
    ((definition.modifiers as string[] | undefined) ?? [...HOSPICE_MODIFIERS]).map((m) =>
      m.toUpperCase(),
    ),
  );
  const errors: ClaimIssue[] = [];
  for (const line of claim.serviceLines) {
    const code = String(line.procedureCode ?? '')
      .trim()
      .toUpperCase();
    if (code === '' || !procedureLookup.has(code)) continue;
    const modifier1 = String(line.modifier1 ?? '')
      .trim()
      .toUpperCase();
    if (modifier1 !== '' && allowedModifiers.has(modifier1)) continue;
    errors.push(
      issue(
        definition,
        `service_lines.${line.lineNumber}.modifier_1`,
        (definition.message || HOSPICE_CARE_MODIFIER_REQUIRED_MESSAGE).replace('%s', code),
      ),
    );
  }
  return errors;
}

function validateMedicaidHomeHealthCertNotCovered(
  claim: PayerEdiClaimInput,
  definition: ClaimRuleDefinition,
): ClaimIssue[] {
  const filing = String(claim.claimFilingIndicator ?? '')
    .trim()
    .toUpperCase();
  if (
    filing !==
    String(definition.filingIndicator ?? MEDICAID_HOME_HEALTH_CERT_FILING_INDICATOR).toUpperCase()
  ) {
    return [];
  }
  const procedureLookup = new Set(
    (
      (definition.procedureCodes as string[] | undefined) ?? [
        ...MEDICAID_HOME_HEALTH_CERT_PROCEDURE_CODES,
      ]
    ).map((c) => c.toUpperCase()),
  );
  const errors: ClaimIssue[] = [];
  for (const line of claim.serviceLines) {
    const code = String(line.procedureCode ?? '')
      .trim()
      .toUpperCase();
    if (code === '' || !procedureLookup.has(code)) continue;
    errors.push(
      issue(
        definition,
        `service_lines.${line.lineNumber}.procedure_code`,
        (definition.message || MEDICAID_HOME_HEALTH_CERT_MESSAGE).replace('%s', code),
      ),
    );
  }
  return errors;
}

function validateDistinctProcedural59XepsuConflict(
  claim: PayerEdiClaimInput,
  definition: ClaimRuleDefinition,
): ClaimIssue[] {
  const baseModifier = normalizeModifier(
    String(definition.baseModifier ?? DISTINCT_PROCEDURAL_BASE_MODIFIER),
  );
  const xepsu = (
    (definition.xepsuModifiers as string[] | undefined) ?? [
      ...DISTINCT_PROCEDURAL_XEPSU_MODIFIERS,
    ]
  )
    .map((m) => normalizeModifier(m))
    .filter((m) => m !== '');
  if (baseModifier === '' || xepsu.length === 0) return [];
  const message = definition.message || DISTINCT_PROCEDURAL_59_XEPSU_MESSAGE;
  const errors: ClaimIssue[] = [];
  for (const line of claim.serviceLines) {
    const mods = lineModifiers(line);
    if (mods.length === 0 || !mods.includes(baseModifier)) continue;
    const conflicting = xepsu.filter((m) => mods.includes(m));
    if (conflicting.length === 0) continue;
    const hcpcs = String(line.procedureCode ?? '')
      .trim()
      .toUpperCase();
    const field =
      lineExactModifierField(line, baseModifier) ??
      lineExactModifierField(line, conflicting[0]) ??
      'modifier_1';
    errors.push(
      issue(
        definition,
        `service_lines.${line.lineNumber}.${field}`,
        message
          .replace('%s', conflicting.join(', '))
          .replace('%s', hcpcs !== '' ? hcpcs : '(NONE)'),
      ),
    );
  }
  return errors;
}
