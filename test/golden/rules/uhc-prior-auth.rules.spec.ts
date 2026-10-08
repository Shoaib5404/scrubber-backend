import {
  UHC_PA_001,
  validateUhcPriorAuthRules,
  type UhcAuthorizationParsedRule,
} from '../../../src/modules/claim-validation/rules/cpt.rules';
import {
  parseUhcIcdLookup,
  parseUhcPosList,
  toUhcAuthorizationParsedRule,
} from '../../../src/modules/claim-validation/support/uhc-prior-auth.parse';

function alwaysRule(cptIgnored?: never): UhcAuthorizationParsedRule {
  void cptIgnored;
  return {
    id: 1,
    condition: 'always',
    parsed: { pos: [], icd: {}, charge: null },
  };
}

describe('UHC prior-auth parse helpers', () => {
  it('parseUhcPosList pads and dedupes', () => {
    expect(parseUhcPosList('11, 2,11')).toEqual(['11', '02']);
  });

  it('parseUhcIcdLookup strips dots', () => {
    expect(parseUhcIcdLookup('E11.9, e66.01')).toEqual({ E119: true, E6601: true });
  });

  it('toUhcAuthorizationParsedRule parses numeric charge', () => {
    const rule = toUhcAuthorizationParsedRule({
      id: 9,
      condition: 'charge_gt',
      conditionValues: '500.00',
    });
    expect(rule.parsed.charge).toBe(500);
  });
});

describe('SP-4 claim golden / UHC prior-auth (UHC-PA-001)', () => {
  const claimBase = {
    payerId: '87726',
    placeOfService: '11',
    priorAuthNumber: null as string | null,
    diagnoses: [{ sequence: 1, code: 'E11.9' }],
  };

  const line = {
    lineNumber: 1,
    procedureCode: '99213',
    chargeAmount: 100,
    placeOfService: '11' as string | null,
    diagnosisPointers: [1],
  };

  it('no-ops when rulesByCpt is empty (pre-C3 bug shape)', () => {
    const { errors } = validateUhcPriorAuthRules(claimBase, [line], {});
    expect(errors).toEqual([]);
  });

  it('no-ops for non-UHC payer', () => {
    const { errors } = validateUhcPriorAuthRules(
      { ...claimBase, payerId: '00000' },
      [line],
      { '99213': [alwaysRule()] },
    );
    expect(errors).toEqual([]);
  });

  it('ALWAYS requires prior auth when missing', () => {
    const { errors } = validateUhcPriorAuthRules(claimBase, [line], {
      '99213': [alwaysRule()],
    });
    expect(errors.some((e) => e.rule === UHC_PA_001)).toBe(true);
  });

  it('ALWAYS passes when priorAuthNumber present', () => {
    const { errors } = validateUhcPriorAuthRules(
      { ...claimBase, priorAuthNumber: 'PA-123' },
      [line],
      { '99213': [alwaysRule()] },
    );
    expect(errors).toEqual([]);
  });

  it('CHARGE_GT requires PA only when charge exceeds threshold', () => {
    const rule: UhcAuthorizationParsedRule = {
      id: 2,
      condition: 'charge_gt',
      parsed: { pos: [], icd: {}, charge: 50 },
    };
    expect(
      validateUhcPriorAuthRules(claimBase, [{ ...line, chargeAmount: 100 }], {
        '99213': [rule],
      }).errors.some((e) => e.rule === UHC_PA_001),
    ).toBe(true);
    expect(
      validateUhcPriorAuthRules(claimBase, [{ ...line, chargeAmount: 10 }], {
        '99213': [rule],
      }).errors,
    ).toEqual([]);
  });

  it('POS_IN requires PA when POS matches', () => {
    const rule: UhcAuthorizationParsedRule = {
      id: 3,
      condition: 'pos_in',
      parsed: { pos: ['11'], icd: {}, charge: null },
    };
    expect(
      validateUhcPriorAuthRules(claimBase, [line], { '99213': [rule] }).errors.some(
        (e) => e.rule === UHC_PA_001,
      ),
    ).toBe(true);
  });

  it('MANDATORY_WITH_ICDS requires PA when pointer ICD matches', () => {
    const rule: UhcAuthorizationParsedRule = {
      id: 4,
      condition: 'mandatory_with_icds',
      parsed: { pos: [], icd: { E119: true }, charge: null },
    };
    expect(
      validateUhcPriorAuthRules(claimBase, [line], { '99213': [rule] }).errors.some(
        (e) => e.rule === UHC_PA_001,
      ),
    ).toBe(true);
  });

  it('NOT_REQUIRED_WITH_ICDS skips PA when ICD matches', () => {
    const rule: UhcAuthorizationParsedRule = {
      id: 5,
      condition: 'not_required_with_icds',
      parsed: { pos: [], icd: { E119: true }, charge: null },
    };
    expect(validateUhcPriorAuthRules(claimBase, [line], { '99213': [rule] }).errors).toEqual([]);
  });
});
