import {
  AETNA_MEMBER_ID_MESSAGE,
  VA_FEE_BASIS_MESSAGE,
} from './payer-edi-messages';

export type MemberIdRuleDefinition =
  | {
      type: 'regex';
      ruleCode: string;
      pattern: RegExp;
      message: string;
    }
  | { type: 'ssn_or_nine_digit'; ruleCode: string; message: string }
  | { type: 'no_subscriber_ssn'; ruleCode: string; message: string }
  | { type: 'aetna_member_id'; ruleCode: string; message: string }
  | {
      type: 'medicaid_al_member_id';
      ruleCode: string;
      pattern: RegExp;
      message: string;
    };

/** Laravel Formats::MEMBER_ID_RULES */
export const MEMBER_ID_RULES: Record<string, MemberIdRuleDefinition> = {
  MC018: {
    type: 'regex',
    ruleCode: 'MID-MC018',
    pattern: /^\d{10,}$/,
    message: 'Member ID format is not correct. Please verify Medicaid-AL member ID.',
  },
  '12115': {
    type: 'ssn_or_nine_digit',
    ruleCode: 'MID-12115',
    message: VA_FEE_BASIS_MESSAGE,
  },
  '12116': {
    type: 'ssn_or_nine_digit',
    ruleCode: 'MID-12116',
    message: VA_FEE_BASIS_MESSAGE,
  },
  '31114': {
    type: 'no_subscriber_ssn',
    ruleCode: 'CS-SSN-001',
    message: 'Carrier Source does not accept member/subscriber SSN, please make correction.',
  },
  '43146': {
    type: 'regex',
    ruleCode: 'MID-ASH-001',
    pattern: /^[A-Z]{3}H[0-9]{8}$/,
    message:
      'Member ID of "AMERICAN SPECIALTY HEALTH" should be in format AAAHNNNNNNNN, where AAA is alpha "H" and NNNNNNNN is numeric. Total member ID is: 12 digits.',
  },
  '77073': {
    type: 'regex',
    ruleCode: 'MID-VNS-001',
    pattern: /^([V]{1})+([0-9]{8})$/,
    message: 'Member ID for VNS Choice should start with "V" proceeded with 8 digits numeric.',
  },
  '60054': {
    type: 'aetna_member_id',
    ruleCode: 'MID-AETNA-001',
    message: AETNA_MEMBER_ID_MESSAGE,
  },
  '271510177': {
    type: 'medicaid_al_member_id',
    ruleCode: 'MID-AL-001',
    pattern: /^[0-9]{12,13}$/,
    message: 'Medicaid-AL member ID should always be 12 to 13 numeric digits.',
  },
};
