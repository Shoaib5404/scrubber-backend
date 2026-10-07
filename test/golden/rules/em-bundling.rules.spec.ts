import { validateEmBundling, EM_BDL_005 } from '../../../src/modules/claim-validation/rules/em-bundling.rules';

describe('EmBundlingRules golden', () => {
  it('EM-BDL-005 rejects new + established office E&M same DOS', () => {
    const issues = validateEmBundling(
      [
        {
          lineNumber: 1,
          procedureCode: '99203',
          serviceDateFrom: '2026-03-01',
          renderingProviderNpi: null,
          modifier1: null,
          modifier2: null,
          modifier3: null,
          modifier4: null,
        },
        {
          lineNumber: 2,
          procedureCode: '99213',
          serviceDateFrom: '2026-03-01',
          renderingProviderNpi: null,
          modifier1: null,
          modifier2: null,
          modifier3: null,
          modifier4: null,
        },
      ],
      { claimFilingIndicator: 'CI', renderingProviderNpi: null },
    );

    expect(issues.some((i) => i.rule === EM_BDL_005)).toBe(true);
  });
});
