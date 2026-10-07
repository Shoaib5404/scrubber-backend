import { validateCoreCptRules } from '../../../src/modules/claim-validation/rules/cpt.rules';
import { validateIcdBodySidewise } from '../../../src/modules/claim-validation/rules/icd-body-sidewise.rules';
import { validateIcdDiagnosis } from '../../../src/modules/claim-validation/rules/icd-diagnosis.rules';
import { validateMedicareNcdIcd10 } from '../../../src/modules/claim-validation/rules/medicare-ncd-icd10.rules';
import { validateNdc } from '../../../src/modules/claim-validation/rules/ndc.rules';
import { validateNpiProvider } from '../../../src/modules/claim-validation/rules/npi-provider.rules';
import { buildNdcCrosswalkContext } from '../../../src/modules/claim-validation/support/ndc-crosswalk.context';

describe('SP-4 validation rule golden cases', () => {
  it('NPI-001: rendering last name mismatch on Medicare claim', () => {
    const issues = validateNpiProvider(
      {
        claimFilingIndicator: 'MA',
        renderingProviderNpi: '1234567893',
        renderingProviderLastName: 'SMITH',
        referringProviderNpi: null,
        referringProviderLastName: null,
        referringProviderFirstName: null,
        billingProviderNpi: '9999999999',
      },
      {
        '1234567893': { last_name: 'JONES' },
      },
    );

    expect(issues.some((i) => i.rule === 'NPI-001')).toBe(true);
  });

  it('CPT-001: unknown procedure code fails existence check', () => {
    const result = validateCoreCptRules(
      {
        billingProviderTaxonomy: '207Q00000X',
        payerId: '12345',
      },
      [{ lineNumber: 1, procedureCode: '99999' }],
      {
        cptRuleRowsByCode: {},
        activeTaxonomyCodes: { '207Q00000X': true },
      },
    );

    expect(result.cptErrors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rule: 'CPT-001',
          field: 'service_lines.1.procedure_code',
        }),
      ]),
    );
  });

  it('ICD-VAL-001: diagnosis not in billable tabular set', () => {
    const { errors } = validateIcdDiagnosis(
      { claimFilingIndicator: 'CI' },
      [{ sequence: 1, code: 'Z9999' }],
      [],
      {
        billableNormalizedCodes: {},
        notesByNormalizedCode: {},
        tobaccoCounselingApprovedIcd: {},
        unacceptablePrincipalByClaimType: {},
        icdGenderRulesByNorm: {},
        icdAgeRulesByNorm: {},
      },
    );

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rule: 'ICD-VAL-001',
          field: 'diagnoses.1.code',
        }),
      ]),
    );
  });

  it('NCD-ICD-001: denied Medicare NCD CPT×ICD pair', () => {
    const errors = validateMedicareNcdIcd10(
      [{ lineNumber: 1, procedureCode: '80048', diagnosisPointers: [1] }],
      { claimFilingIndicator: 'MA' },
      [{ sequence: 1, code: 'E11.9' }],
      {
        '80048': { E119: true },
      },
    );

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rule: 'NCD-ICD-001',
          field: 'service_lines.1.diagnosis_pointers',
        }),
      ]),
    );
  });

  it('NDC-0: invalid NDC format when NDC present', () => {
    const context = buildNdcCrosswalkContext([]);
    const [errors] = validateNdc(
      [{ lineNumber: 1, procedureCode: 'J0120', ndcCode: '123', ndcQuantity: null, ndcUnit: null }],
      context,
    );

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rule: 'NDC-0',
          field: 'service_lines.1.ndc_code',
          message: 'Invalid NDC format',
        }),
      ]),
    );
  });

  it('ICD-BS-001: laterality modifier conflicts with ICD side', () => {
    const errors = validateIcdBodySidewise(
      [
        {
          lineNumber: 1,
          procedureCode: '27447',
          modifier1: 'RT',
          diagnosisPointers: [1],
        },
      ],
      {
        diagnoses: [{ sequence: 1, code: 'M17.11' }],
      },
      {
        M1711: 'Left',
      },
    );

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rule: 'ICD-BS-001',
          field: 'service_lines.1.modifiers',
        }),
      ]),
    );
  });
});
