import { validateEnm, EM_001 } from '../../../src/modules/claim-validation/rules/enm.rules';

describe('EnmRules golden', () => {
  it('EM-001 rejects denied modifier on E&M procedure code', () => {
    const { errors } = validateEnm(
      [
        {
          lineNumber: 1,
          procedureCode: '99213',
          units: 1,
          serviceDateFrom: '2026-01-15',
          modifier1: '59',
          modifier2: null,
          modifier3: null,
          modifier4: null,
        },
      ],
      [],
      { enmProcedures: { '99213': true }, enmSurgeryCodes: {} },
    );

    expect(errors.some((e) => e.rule === EM_001)).toBe(true);
  });
});
