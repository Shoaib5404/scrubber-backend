import { validateICode, HCPCS_I_001 } from '../../../src/modules/claim-validation/rules/icode.rules';
import {
  validateUhc87726Pos,
  UHC_POS_001,
} from '../../../src/modules/claim-validation/rules/uhc-87726-pos.rules';
import {
  validateMueUhcOxford,
  MUE_UHC_001,
} from '../../../src/modules/claim-validation/rules/mue-uhc-oxford.rules';
import {
  validateRadiologyTcModifier,
  RAD_TC_001,
} from '../../../src/modules/claim-validation/rules/radiology-tc-modifier.rules';
import {
  isApplicableCigna62308,
  validateCigna62308,
  CIGNA_ICD_001,
} from '../../../src/modules/claim-validation/rules/cigna-62308.rules';
import {
  isApplicableAetnaLcd,
  validateAetnaLcd,
  AETNA_FETAL_001,
  AETNA_B12_001,
} from '../../../src/modules/claim-validation/rules/aetna-lcd.rules';
import {
  isApplicableModifierSequence,
  MOD_SEQ_001,
} from '../../../src/modules/claim-validation/rules/modifier-sequence.rules';
import { validateBcbsClaimRouting, BCBS_001 } from '../../../src/modules/claim-validation/rules/bcbs-claim-routing.rules';

describe('SP-4 claim golden / specialized families', () => {
  it('HCPCS-I-001 rejects Medicare status-I code', () => {
    const errors = validateICode(
      [{ lineNumber: 1, procedureCode: 'A9999' }],
      { claimFilingIndicator: 'MB' },
      { A9999: true },
    );
    expect(errors.some((e) => e.rule === HCPCS_I_001)).toBe(true);
  });

  it('UHC-POS-001 rejects disallowed POS for 87726', () => {
    const errors = validateUhc87726Pos(
      [{ lineNumber: 1, procedureCode: '99213', placeOfService: '11' }],
      { payerId: '87726', placeOfService: null },
      { '99213': ['22'] },
    );
    expect(errors.some((e) => e.rule === UHC_POS_001)).toBe(true);
  });

  it('MUE-UHC-001 rejects units outside min/max', () => {
    const errors = validateMueUhcOxford(
      [{ lineNumber: 1, procedureCode: '99213', units: 9 }],
      { payerId: '87726' },
      { '99213': { min: 1, max: 2 } },
    );
    expect(errors.some((e) => e.rule === MUE_UHC_001)).toBe(true);
  });

  it('RAD-TC-001 rejects TC on facility radiology', () => {
    const errors = validateRadiologyTcModifier(
      [
        {
          lineNumber: 1,
          procedureCode: '71046',
          placeOfService: '22',
          modifier1: 'TC',
          modifier2: null,
          modifier3: null,
          modifier4: null,
        },
      ],
      { placeOfService: null },
      { '71046': true },
    );
    expect(errors.some((e) => e.rule === RAD_TC_001)).toBe(true);
  });

  it('CIGNA-ICD-001 applies for payer 62308 adult', () => {
    expect(
      isApplicableCigna62308(
        {
          payerId: '62308',
          patientDob: new Date('1980-01-01'),
          subscriberDob: null,
        },
        [{ serviceDateFrom: new Date('2024-01-01') }],
      ),
    ).toBe(true);
    expect(CIGNA_ICD_001).toBe('CIGNA-ICD-001');
  });

  it('AETNA LCD applicable for payer 60054', () => {
    expect(isApplicableAetnaLcd({ payerId: '60054' })).toBe(true);
    expect(AETNA_FETAL_001).toBe('AETNA-FETAL-001');
  });

  it('CIGNA-ICD-001 rejects unsupported ICD and attaches details_url', () => {
    const errors = validateCigna62308(
      [
        {
          lineNumber: 1,
          procedureCode: '93303',
          diagnosisPointers: [1],
          serviceDateFrom: new Date('2024-01-01'),
        },
      ],
      [{ sequence: 1, code: 'Z00.00' }],
      {
        payerId: '62308',
        patientDob: new Date('1980-01-01'),
        subscriberDob: null,
      },
      { '93303': { A1884: true } },
    );
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rule: CIGNA_ICD_001,
          cpt_code: '93303',
          icd_code: 'Z00.00',
          details_url: '/dashboard/references/cigna-cpt-icd-crosswalk?search=93303&cpt_code=93303',
        }),
      ]),
    );
  });

  it('AETNA-B12-001 rejects unsupported ICD and attaches details_url', () => {
    const errors = validateAetnaLcd(
      [{ lineNumber: 1, procedureCode: '83090', diagnosisPointers: [1] }],
      [{ sequence: 1, code: 'Z00.00' }],
      { payerId: '60054' },
      [],
      {},
      { '83090': { B700: true } },
    );
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rule: AETNA_B12_001,
          cpt_code: '83090',
          icd_code: 'Z00.00',
          details_url: '/dashboard/references/aetna-b12-lcd?search=83090&cpt=83090',
        }),
      ]),
    );
  });

  it('MOD-SEQ-001 applicable for Medicare filing', () => {
    expect(isApplicableModifierSequence({ claimFilingIndicator: 'MB' })).toBe(true);
    expect(MOD_SEQ_001).toBe('MOD-SEQ-001');
  });

  it('BCBS-001 emits when prefix routes to different payer', async () => {
    const prisma = {
      bcbsClaimRouting: {
        findMany: async () => [{ payerId: 'SB560', prefix: 'XYZ', isActive: true }],
      },
    } as Parameters<typeof validateBcbsClaimRouting>[0];
    const errors = await validateBcbsClaimRouting(prisma, {
      subscriberMemberId: 'XYZ12345',
      payerId: 'WRONG',
    });
    expect(errors.some((e) => e.rule === BCBS_001)).toBe(true);
  });
});
