import {
  validateGlobalSurgicalModifier,
  SURG_MOD_001,
} from '../../../src/modules/claim-validation/rules/global-surgical-modifier.rules';

describe('GlobalSurgicalModifierRules golden', () => {
  it('SURG-MOD-001 requires 78/79 for major surgery-only CPT', () => {
    const issues = validateGlobalSurgicalModifier(
      [
        {
          lineNumber: 1,
          procedureCode: '27447',
          modifier1: null,
          modifier2: null,
          modifier3: null,
          modifier4: null,
        },
      ],
      {
        majorSurgeryCodes: { '27447': true },
        enmSurgeryCodes: {},
        enmProcedures: {},
        globalDaysSurgeries: {},
      },
    );

    expect(issues.some((i) => i.rule === SURG_MOD_001)).toBe(true);
  });
});
