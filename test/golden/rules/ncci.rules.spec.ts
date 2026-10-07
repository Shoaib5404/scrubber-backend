import {
  validateNcci,
  NCCI_MODIFIER_ALLOWED,
  NCCI_MODIFIER_NOT_ALLOWED,
} from '../../../src/modules/claim-validation/rules/ncci.rules';

describe('NcciRules golden', () => {
  it('NCCI-002 when modifier allowed edit lacks bypass modifier on column 2', () => {
    const { errors } = validateNcci(
      [
        {
          lineNumber: 1,
          procedureCode: '11100',
          modifier1: null,
          modifier2: null,
          modifier3: null,
          modifier4: null,
        },
        {
          lineNumber: 2,
          procedureCode: '11101',
          modifier1: null,
          modifier2: null,
          modifier3: null,
          modifier4: null,
        },
      ],
      {
        '11100|11101': [
          {
            id: 1,
            column1: '11100',
            column2: '11101',
            modifier: NCCI_MODIFIER_ALLOWED,
          },
        ],
      },
    );

    expect(errors.some((e) => e.rule === 'NCCI-002')).toBe(true);
  });

  it('NCCI-001 when modifier-not-allowed edit has modifiers on column 2', () => {
    const { errors } = validateNcci(
      [
        {
          lineNumber: 1,
          procedureCode: '10060',
          modifier1: null,
          modifier2: null,
          modifier3: null,
          modifier4: null,
        },
        {
          lineNumber: 2,
          procedureCode: '10061',
          modifier1: '59',
          modifier2: null,
          modifier3: null,
          modifier4: null,
        },
      ],
      {
        '10060|10061': [
          {
            id: 2,
            column1: '10060',
            column2: '10061',
            modifier: NCCI_MODIFIER_NOT_ALLOWED,
          },
        ],
      },
    );

    expect(errors.some((e) => e.rule === 'NCCI-001')).toBe(true);
  });
});
