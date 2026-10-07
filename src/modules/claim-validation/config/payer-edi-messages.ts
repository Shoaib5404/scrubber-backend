/** Laravel Formats — shared payer/EDI validation messages and patterns. */

export const DOS_NOT_IN_FUTURE_RULE_CODE = 'DOS-FUT-001';
export const DOS_NOT_IN_FUTURE_MESSAGE =
  'Claim level or service line level DOS (%s) cannot be in the future.';

export const VA_FEE_BASIS_MESSAGE =
  "Member ID is invalid. Please submit member's SSN as member ID for the Department of Veterans Affairs VA Fee Basis Program";

export const MEMBER_ID_MISSING_OR_INVALID_MESSAGE =
  'Member ID (%s) is missing or invalid. Please verify the payer and member ID format.';

export const AETNA_MEMBER_ID_MESSAGE =
  'Subscriber ID missing or required, Indemnity/PPO plans – when the number is a 9-digit numeric identifier preceded by "W" (example W123456789), submit all digits including the "W". HMO – submit the 8-character alphanumeric member ID (example THR90301) if Aetna assigned ID number is not known submit SSN.';

export const ACCIDENT_RELATED_CAUSES_CODES = ['AA', 'OA', 'EM'] as const;
export const ACCIDENT_DATE_REQUIRED_FILING_INDICATORS = ['WC', 'AM'] as const;
export const ACCIDENT_DATE_REQUIRED_MESSAGE =
  'Accident Date is required for claim filing indicator {FILING_INDICATOR} or accident-related claims. Please report a valid Accident Date.';

export const ADMISSION_DATE_NOT_TYPICALLY_REQUIRED_POS = [
  '11',
  '12',
  '13',
  '22',
  '31',
  '32',
  '65',
] as const;

export const ADMISSION_DATE_MIGHT_NOT_BE_REQUIRED_MESSAGE =
  'Admission Date might not be required with POS %s';

export const PLACE_OF_SERVICE_INVALID_MESSAGE =
  'Place of Service %s is missing or invalid. Please use a valid POS code.';

export const LMP_ONSET_SAME_DATE_MESSAGE =
  'Last Menstrual Period Date and Onset of Similar Symptoms or Illness Date cannot be the same.';

export const LMP_GENDER_MESSAGE =
  'Gender is inconsistent with the billing guideline. Last Menstrual Period Date is only allowed for female patient.';

export const CITY_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 .'-]{1,29}$/;
export const CITY_NAME_INVALID_MESSAGE =
  'City name %s is invalid, must be a minimum of two characters in length.';

/** Laravel Formats::AETNA_MEMBER_ID_PATTERNS */
export const AETNA_MEMBER_ID_PATTERNS: RegExp[] = [
  /^([W][0-9]{9})+([0][0-9]{1})?$/,
  /^((?!W)[A-Z0-9]{9})+$/,
  /^((?!W)[A-Z0-9]{8})+$/,
  /^([0-9]{5,})+$/,
];
