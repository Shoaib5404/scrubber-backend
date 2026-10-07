import { MEMBER_ID_MISSING_OR_INVALID_MESSAGE } from './payer-edi-messages';

export type MemberIdFormatRule = {
  ruleCode: string;
  pattern: RegExp;
  message: string;
};

/** Laravel Formats::MEMBER_ID_FORMAT_RULES (payer EMC catalog). */
export const MEMBER_ID_FORMAT_RULES: Record<string, MemberIdFormatRule> = {
  '13334': {
    ruleCode: 'MID-13334',
    pattern: /^[0-9]{9,11}$/i,
    message: MEMBER_ID_MISSING_OR_INVALID_MESSAGE,
  },
  '13337': {
    ruleCode: 'MID-13337',
    pattern: /^[NH]+[0-9]{7,9}$/i,
    message: MEMBER_ID_MISSING_OR_INVALID_MESSAGE,
  },
  '21313': {
    ruleCode: 'MID-21313',
    pattern: /^[0-9]{7,9}$/i,
    message: MEMBER_ID_MISSING_OR_INVALID_MESSAGE,
  },
  '22099': {
    ruleCode: 'MID-22099',
    pattern: /^[A-Z0-9]{11,15}$/i,
    message: MEMBER_ID_MISSING_OR_INVALID_MESSAGE,
  },
  '23045': {
    ruleCode: 'MID-23045',
    pattern: /^[A-Z0-9]{12,15}$/i,
    message: MEMBER_ID_MISSING_OR_INVALID_MESSAGE,
  },
  '23281': {
    ruleCode: 'MID-23281',
    pattern: /^[0-9]{9,11}$/i,
    message: MEMBER_ID_MISSING_OR_INVALID_MESSAGE,
  },
  '25133': {
    ruleCode: 'MID-25133',
    pattern: /^[A-Z0-9]{9,11}$/i,
    message: MEMBER_ID_MISSING_OR_INVALID_MESSAGE,
  },
  '25175': {
    ruleCode: 'MID-25175',
    pattern: /^[0-9]{9,10}$/i,
    message: MEMBER_ID_MISSING_OR_INVALID_MESSAGE,
  },
  '29076': {
    ruleCode: 'MID-29076',
    pattern: /^[A-Z0-9]{7,12}$/i,
    message: MEMBER_ID_MISSING_OR_INVALID_MESSAGE,
  },
  '31053': {
    ruleCode: 'MID-31053',
    pattern: /^[HC][A-Z0-9][0-9]{10}$/i,
    message: MEMBER_ID_MISSING_OR_INVALID_MESSAGE,
  },
  '31114': {
    ruleCode: 'MID-31114',
    pattern: /^[0-9]{9,12}$/i,
    message: MEMBER_ID_MISSING_OR_INVALID_MESSAGE,
  },
  '31625': {
    ruleCode: 'MID-31625',
    pattern: /^[0-9]{11}$/i,
    message: MEMBER_ID_MISSING_OR_INVALID_MESSAGE,
  },
  '38309': {
    ruleCode: 'MID-38309',
    pattern: /^[A-Z0-9]{9,12}$/i,
    message: MEMBER_ID_MISSING_OR_INVALID_MESSAGE,
  },
  '38333': {
    ruleCode: 'MID-38333',
    pattern: /^[A-Z0-9]{7,14}$/i,
    message: MEMBER_ID_MISSING_OR_INVALID_MESSAGE,
  },
  '38336': {
    ruleCode: 'MID-38336',
    pattern: /^[0-9]{9,12}$/i,
    message: MEMBER_ID_MISSING_OR_INVALID_MESSAGE,
  },
  '39026': {
    ruleCode: 'MID-39026',
    pattern: /^[0-9]{8,12}$/i,
    message: MEMBER_ID_MISSING_OR_INVALID_MESSAGE,
  },
  '44054': {
    ruleCode: 'MID-44054',
    pattern: /^[0-9]{8,9}$/i,
    message: MEMBER_ID_MISSING_OR_INVALID_MESSAGE,
  },
  '52095': {
    ruleCode: 'MID-52095',
    pattern: /^[A-Z0-9]{8,10}$/i,
    message: MEMBER_ID_MISSING_OR_INVALID_MESSAGE,
  },
  '52189': {
    ruleCode: 'MID-52189',
    pattern: /^[0-9]{11}$/i,
    message: MEMBER_ID_MISSING_OR_INVALID_MESSAGE,
  },
  '55247': {
    ruleCode: 'MID-55247',
    pattern: /^[A-Z0-9]{8,11}$/i,
    message: MEMBER_ID_MISSING_OR_INVALID_MESSAGE,
  },
  '56162': {
    ruleCode: 'MID-56162',
    pattern: /^[A-Z0-9]{9,11}$/i,
    message: MEMBER_ID_MISSING_OR_INVALID_MESSAGE,
  },
  '59274': {
    ruleCode: 'MID-59274',
    pattern: /^A[0-9]{10}$/i,
    message: MEMBER_ID_MISSING_OR_INVALID_MESSAGE,
  },
  '61101': {
    ruleCode: 'MID-61101',
    pattern: /^H[0-9]{8,10}$/i,
    message: MEMBER_ID_MISSING_OR_INVALID_MESSAGE,
  },
  '61124': {
    ruleCode: 'MID-61124',
    pattern: /^[A-Z0-9]{8,14}$/i,
    message: MEMBER_ID_MISSING_OR_INVALID_MESSAGE,
  },
  '62308': {
    ruleCode: 'MID-62308',
    pattern: /^[A-Z0-9]{8,12}$/i,
    message: MEMBER_ID_MISSING_OR_INVALID_MESSAGE,
  },
  '72467': {
    ruleCode: 'MID-72467',
    pattern: /^[0-9A-Z]{9}$/i,
    message: MEMBER_ID_MISSING_OR_INVALID_MESSAGE,
  },
  '73143': {
    ruleCode: 'MID-73143',
    pattern: /^[CN][0-9]{8,10}$/i,
    message: MEMBER_ID_MISSING_OR_INVALID_MESSAGE,
  },
  '80141': {
    ruleCode: 'MID-80141',
    pattern: /^[A-Z0-9]{8,15}$/i,
    message: MEMBER_ID_MISSING_OR_INVALID_MESSAGE,
  },
  '80142': {
    ruleCode: 'MID-80142',
    pattern: /^[0-9]{9}$/i,
    message: MEMBER_ID_MISSING_OR_INVALID_MESSAGE,
  },
  '80314': {
    ruleCode: 'MID-80314',
    pattern: /^[A-Z0-9]{9,12}$/i,
    message: MEMBER_ID_MISSING_OR_INVALID_MESSAGE,
  },
  '81400': {
    ruleCode: 'MID-81400',
    pattern: /^C[0-9]{8,10}$/i,
    message: MEMBER_ID_MISSING_OR_INVALID_MESSAGE,
  },
  '84146': {
    ruleCode: 'MID-84146',
    pattern: /^[0-9]{9,10}$/i,
    message: MEMBER_ID_MISSING_OR_INVALID_MESSAGE,
  },
  '86033': {
    ruleCode: 'MID-86033',
    pattern: /^[A-Z0-9]{9,11}$/i,
    message: MEMBER_ID_MISSING_OR_INVALID_MESSAGE,
  },
  '87815': {
    ruleCode: 'MID-87815',
    pattern: /^[0-9]{10}$/i,
    message: MEMBER_ID_MISSING_OR_INVALID_MESSAGE,
  },
  '93029': {
    ruleCode: 'MID-93029',
    pattern: /^[0-9]{9}$/i,
    message: MEMBER_ID_MISSING_OR_INVALID_MESSAGE,
  },
  '94134': {
    ruleCode: 'MID-94134',
    pattern: /^[0-9]{8,12}$/i,
    message: MEMBER_ID_MISSING_OR_INVALID_MESSAGE,
  },
  '94135': {
    ruleCode: 'MID-94135',
    pattern: /^[0-9]{8,12}$/i,
    message: MEMBER_ID_MISSING_OR_INVALID_MESSAGE,
  },
  '94316': {
    ruleCode: 'MID-94316',
    pattern: /^[A-Z0-9]{9,12}$/i,
    message: MEMBER_ID_MISSING_OR_INVALID_MESSAGE,
  },
  '95378': {
    ruleCode: 'MID-95378',
    pattern: /^[0-9]{9}$/i,
    message: MEMBER_ID_MISSING_OR_INVALID_MESSAGE,
  },
  '95567': {
    ruleCode: 'MID-95567',
    pattern: /^[A-Z0-9]{9,14}$/i,
    message: MEMBER_ID_MISSING_OR_INVALID_MESSAGE,
  },
  '05047': {
    ruleCode: 'MID-05047',
    pattern: /^[0-9]{9}$/i,
    message: MEMBER_ID_MISSING_OR_INVALID_MESSAGE,
  },
  '06105': {
    ruleCode: 'MID-06105',
    pattern: /^[0-9]{9,11}$/i,
    message: MEMBER_ID_MISSING_OR_INVALID_MESSAGE,
  },
  '06111': {
    ruleCode: 'MID-06111',
    pattern: /^[0-9]{8,10}$/i,
    message: MEMBER_ID_MISSING_OR_INVALID_MESSAGE,
  },
  '07205': {
    ruleCode: 'MID-07205',
    pattern: /^[0-9]{9,10}$/i,
    message: MEMBER_ID_MISSING_OR_INVALID_MESSAGE,
  },
  'SB690': {
    ruleCode: 'MID-SB690',
    pattern: /^[A-Z0-9]{9,14}$/i,
    message: MEMBER_ID_MISSING_OR_INVALID_MESSAGE,
  },
  'SX009': {
    ruleCode: 'MID-SX009',
    pattern: /^[0-9]{8}$/i,
    message: MEMBER_ID_MISSING_OR_INVALID_MESSAGE,
  },
  'SX065': {
    ruleCode: 'MID-SX065',
    pattern: /^[A-Z0-9]{9,11}$/i,
    message: MEMBER_ID_MISSING_OR_INVALID_MESSAGE,
  },
};
