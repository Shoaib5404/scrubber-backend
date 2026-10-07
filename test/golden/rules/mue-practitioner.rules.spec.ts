import {
  validateMuePractitioner,
  MUE_002,
} from '../../../src/modules/claim-validation/rules/mue-practitioner.rules';

describe('MuePractitionerRules golden', () => {
  it('MUE-002 rejects MAI-2 DOS sum over upper limit', () => {
    const { errors } = validateMuePractitioner(
      [
        {
          lineNumber: 1,
          procedureCode: '36415',
          units: 2,
          serviceDateFrom: '2026-04-10',
          modifier1: null,
          modifier2: null,
          modifier3: null,
          modifier4: null,
        },
        {
          lineNumber: 2,
          procedureCode: '36415',
          units: 2,
          serviceDateFrom: '2026-04-10',
          modifier1: null,
          modifier2: null,
          modifier3: null,
          modifier4: null,
        },
      ],
      { payerId: '12345' },
      {
        '36415': { upperLimit: '3', indicator: '2' },
      },
    );

    expect(errors.some((e) => e.rule === MUE_002)).toBe(true);
  });
});
