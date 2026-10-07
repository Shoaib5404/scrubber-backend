import { CITY_NAME_INVALID_MESSAGE, CITY_NAME_PATTERN } from './payer-edi-messages';

export type CityNameRuleDefinition = {
  entity: 'billing_provider' | 'subscriber' | 'facility';
  ruleCode: string;
  field: string;
  pattern: RegExp;
  message: string;
  requireEntity?: boolean;
};

/** Laravel Formats::CITY_NAME_RULES */
export const CITY_NAME_RULES: CityNameRuleDefinition[] = [
  {
    entity: 'billing_provider',
    ruleCode: 'CITY-BILL-001',
    field: 'billing_provider_city',
    pattern: CITY_NAME_PATTERN,
    message: CITY_NAME_INVALID_MESSAGE,
  },
  {
    entity: 'subscriber',
    ruleCode: 'CITY-SUB-001',
    field: 'subscriber_address',
    pattern: CITY_NAME_PATTERN,
    message: CITY_NAME_INVALID_MESSAGE,
  },
  {
    entity: 'facility',
    ruleCode: 'CITY-FAC-001',
    field: 'facility_address',
    requireEntity: true,
    pattern: CITY_NAME_PATTERN,
    message: CITY_NAME_INVALID_MESSAGE,
  },
];
