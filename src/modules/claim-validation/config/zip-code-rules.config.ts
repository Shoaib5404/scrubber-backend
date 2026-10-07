export const ZIP_CODE_EXACT_9_PATTERN = /^\d{9}$/;
export const ZIP_CODE_5_OR_9_PATTERN = /^\d{5}(\d{4})?$/;

export const ZIP_CODE_INVALID_OR_NOT_FOUND_MESSAGE =
  '%s zip code (%s) is invalid or not found in the USPS zip code.';

export const ZIP_STATE_MISMATCH_MESSAGE =
  '%s state (%s) does not match zip code (%s). Please verify the state abbreviation.';

export type ZipCodeRuleDefinition = {
  entity: string;
  ruleCode: string;
  stateRuleCode: string;
  cityRuleCode: string;
  pattern: RegExp;
  field: string;
  label: string;
  message: string;
  stateMessage: string;
  cityMessage: string;
  cityWarningMessage: string;
  relationshipCode?: string;
  requireEmptyRelationship?: boolean;
  requireEntity?: boolean;
};

/** Laravel Formats::ZIP_CODE_RULES (entity ZIP scrubbing). */
export const ZIP_CODE_RULES: ZipCodeRuleDefinition[] = [
  {
    entity: 'billing_provider',
    ruleCode: 'ZIP-BILL-001',
    stateRuleCode: 'ZIP-STATE-BILL-001',
    cityRuleCode: 'ZIP-CITY-BILL-001',
    pattern: ZIP_CODE_EXACT_9_PATTERN,
    field: 'billing_provider_zip',
    label: 'Billing Provider',
    message: ZIP_CODE_INVALID_OR_NOT_FOUND_MESSAGE,
    stateMessage: ZIP_STATE_MISMATCH_MESSAGE,
    cityMessage: '',
    cityWarningMessage: '',
  },
  {
    entity: 'patient',
    ruleCode: 'ZIP-PAT-001',
    stateRuleCode: 'ZIP-STATE-PAT-001',
    cityRuleCode: 'ZIP-CITY-PAT-001',
    pattern: ZIP_CODE_5_OR_9_PATTERN,
    field: 'patient_address',
    label: 'Patient',
    requireEmptyRelationship: true,
    requireEntity: true,
    message: ZIP_CODE_INVALID_OR_NOT_FOUND_MESSAGE,
    stateMessage: ZIP_STATE_MISMATCH_MESSAGE,
    cityMessage: '',
    cityWarningMessage: '',
  },
  {
    entity: 'facility',
    ruleCode: 'ZIP-FAC-001',
    stateRuleCode: 'ZIP-STATE-FAC-001',
    cityRuleCode: 'ZIP-CITY-FAC-001',
    pattern: ZIP_CODE_EXACT_9_PATTERN,
    field: 'facility_address',
    label: 'Service Facility',
    requireEntity: true,
    message: ZIP_CODE_INVALID_OR_NOT_FOUND_MESSAGE,
    stateMessage: ZIP_STATE_MISMATCH_MESSAGE,
    cityMessage: '',
    cityWarningMessage: '',
  },
  {
    entity: 'subscriber',
    ruleCode: 'ZIP-SUB-001',
    stateRuleCode: 'ZIP-STATE-SUB-001',
    cityRuleCode: 'ZIP-CITY-SUB-001',
    pattern: ZIP_CODE_5_OR_9_PATTERN,
    field: 'subscriber_address',
    label: 'Subscriber',
    relationshipCode: '18',
    message: ZIP_CODE_INVALID_OR_NOT_FOUND_MESSAGE,
    stateMessage: ZIP_STATE_MISMATCH_MESSAGE,
    cityMessage: '',
    cityWarningMessage: '',
  },
  {
    entity: 'other_subscriber',
    ruleCode: 'ZIP-OSUB-001',
    stateRuleCode: 'ZIP-STATE-OSUB-001',
    cityRuleCode: 'ZIP-CITY-OSUB-001',
    pattern: ZIP_CODE_5_OR_9_PATTERN,
    field: 'other_subscribers',
    label: 'Other Subscriber',
    relationshipCode: '18',
    message: ZIP_CODE_INVALID_OR_NOT_FOUND_MESSAGE,
    stateMessage: ZIP_STATE_MISMATCH_MESSAGE,
    cityMessage: '',
    cityWarningMessage: '',
  },
  {
    entity: 'other_patient',
    ruleCode: 'ZIP-OPAT-001',
    stateRuleCode: 'ZIP-STATE-OPAT-001',
    cityRuleCode: 'ZIP-CITY-OPAT-001',
    pattern: ZIP_CODE_5_OR_9_PATTERN,
    field: 'other_subscribers',
    label: 'Other Patient',
    requireEmptyRelationship: true,
    requireEntity: true,
    message: ZIP_CODE_INVALID_OR_NOT_FOUND_MESSAGE,
    stateMessage: ZIP_STATE_MISMATCH_MESSAGE,
    cityMessage: '',
    cityWarningMessage: '',
  },
];
