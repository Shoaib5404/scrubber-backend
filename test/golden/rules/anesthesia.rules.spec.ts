import { validateAnesthesia } from '../../../src/modules/claim-validation/rules/anesthesia.rules';

describe('AnesthesiaRules golden', () => {
  it('ANE-001 rejects non-MJ unit scale for anesthesia CPT', () => {
    const issues = validateAnesthesia(
      [
        {
          lineNumber: 1,
          procedureCode: '00100',
          units: 60,
          unitScale: 'UN',
          modifier1: null,
          modifier2: null,
          modifier3: null,
          modifier4: null,
        },
      ],
      {
        minUnitsByCode: { '00100': 15 },
        allowedModifierKeys: {},
        codesWithBillableModifierRules: {},
      },
    );

    expect(issues.some((i) => i.rule === 'ANE-001')).toBe(true);
  });
});
