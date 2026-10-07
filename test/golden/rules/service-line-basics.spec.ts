import {
  AMT_ZERO_001,
  UNIT_DAY_001,
  validateServiceLineBasics,
} from '../../../src/modules/claim-validation/rules/service-line-basics.rules';

describe('service-line-basics golden rules', () => {
  it('AMT-ZERO-001 allows charge in [0, 1) for zero-amount procedures', () => {
    const { errors: ok } = validateServiceLineBasics(
      [
        {
          lineNumber: 1,
          procedureCode: 'G0008',
          chargeAmount: 0.5,
          units: 1,
          serviceDateFrom: new Date('2020-01-01'),
          serviceDateTo: null,
          diagnosisPointers: [],
        },
      ],
      null,
      { zeroAmountProcedures: { G0008: true } },
    );
    expect(ok).toHaveLength(0);

    const { errors: bad } = validateServiceLineBasics(
      [
        {
          lineNumber: 1,
          procedureCode: 'G0008',
          chargeAmount: 1,
          units: 1,
          serviceDateFrom: new Date('2020-01-01'),
          serviceDateTo: null,
          diagnosisPointers: [],
        },
      ],
      null,
      { zeroAmountProcedures: { G0008: true } },
    );
    expect(bad.some((e) => e.rule === AMT_ZERO_001)).toBe(true);
  });

  it('UNIT-DAY-001 requires units >= inclusive DOS days', () => {
    const { errors } = validateServiceLineBasics(
      [
        {
          lineNumber: 1,
          procedureCode: '99213',
          chargeAmount: 100,
          units: 1,
          serviceDateFrom: new Date('2020-01-01'),
          serviceDateTo: new Date('2020-01-03'),
          diagnosisPointers: [],
        },
      ],
      null,
      { noOfUnitsCptsExempt: {} },
    );
    expect(errors.some((e) => e.rule === UNIT_DAY_001)).toBe(true);
  });
});
