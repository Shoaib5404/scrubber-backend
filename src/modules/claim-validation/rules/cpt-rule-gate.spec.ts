import { validateCoreCptRules } from './cpt.rules';

describe('validateCoreCptRules switches', () => {
  const lookups = {
    cptRuleRowsByCode: {},
    activeTaxonomyCodes: {},
  };

  it('keeps an unknown procedure out of later lines when CPT-001 is on', () => {
    const result = validateCoreCptRules(
      { payerId: '1' },
      [{ lineNumber: 1, procedureCode: '99999' }],
      lookups,
    );
    expect(result.validLines).toHaveLength(0);
    expect(result.cptErrors.map((issue) => issue.rule)).toContain('CPT-001');
  });

  it('lets an unknown procedure continue when CPT-001 is off', () => {
    const result = validateCoreCptRules(
      { payerId: '1' },
      [{ lineNumber: 1, procedureCode: '99999' }],
      lookups,
      { cpt001Enabled: false },
    );
    expect(result.validLines.map((line) => line.lineNumber)).toEqual([1]);
    expect(result.cptErrors.map((issue) => issue.rule)).not.toContain('CPT-001');
  });

  it('lets a line with no procedure continue when REQ-007 is off', () => {
    const result = validateCoreCptRules(
      { payerId: '1' },
      [{ lineNumber: 2, procedureCode: '  ' }],
      lookups,
      { req007Enabled: false },
    );
    expect(result.validLines.map((line) => line.lineNumber)).toEqual([2]);
    expect(result.cptErrors.map((issue) => issue.rule)).not.toContain('REQ-007');
  });
});
