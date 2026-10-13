import {
  DOS_FUT_001,
  validateDosNotInFuture,
  validatePayerAndEdiSpecific,
} from '../../../src/modules/claim-validation/rules/payer-edi-specific.rules';
import { PayerEdiClaimInput } from '../../../src/modules/claim-validation/types/payer-edi.types';

const emptyDates = {
  onsetOfIllnessDate: null,
  lastMenstrualPeriodDate: null,
  initialTreatmentDate: null,
  lastSeenDate: null,
  accidentDate: null,
  lastXrayDate: null,
  admissionDate: null,
  dischargeDate: null,
  hearingVisionPrescriptionDate: null,
  disabilityStartDate: null,
  disabilityEndDate: null,
  lastWorkedDate: null,
  authorizedReturnToWorkDate: null,
  assumedCareDate: null,
  relinquishedCareDate: null,
};

function baseClaim(overrides: Partial<PayerEdiClaimInput> = {}): PayerEdiClaimInput {
  return {
    ...emptyDates,
    payerId: '12345',
    subscriberMemberId: 'ABC123456',
    subscriberSsn: null,
    claimFilingIndicator: 'CI',
    placeOfService: '11',
    relatedCausesCode: null,
    patientGender: 'M',
    subscriberGender: 'M',
    billingProviderCity: null,
    subscriberAddress: null,
    patientAddress: null,
    facilityName: null,
    facilityNpi: null,
    facilityAddress: null,
    billingProviderZip: null,
    billingProviderState: null,
    patientState: null,
    subscriberState: null,
    facilityState: null,
    otherSubscribers: [],
    serviceLines: [{ lineNumber: 1, serviceDateFrom: new Date('2020-01-01'), serviceDateTo: null }],
    ...overrides,
  };
}

describe('payer-edi-specific golden rules', () => {
  const today = new Date('2026-01-15T12:00:00');

  it('validateDosNotInFuture flags future service line DOS', () => {
    const issues = validateDosNotInFuture(
      [{ lineNumber: 1, serviceDateFrom: new Date('2027-01-01'), serviceDateTo: null }],
      emptyDates,
      today,
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].rule).toBe(DOS_FUT_001);
  });

  it('DOS-FUT-001 halts further payer-EDI rules', () => {
    const issues = validatePayerAndEdiSpecific(
      baseClaim({
        placeOfService: '99',
        subscriberMemberId: '',
        payerId: '05047',
        serviceLines: [
          { lineNumber: 1, serviceDateFrom: new Date('2027-01-01'), serviceDateTo: null },
        ],
      }),
      {},
      today,
    );
    expect(issues.every((i) => i.rule === DOS_FUT_001)).toBe(true);
  });

  it('ADM-POS-001 requires admission date for inpatient POS 21', () => {
    const issues = validatePayerAndEdiSpecific(
      baseClaim({ placeOfService: '21', admissionDate: null }),
      {},
      today,
    );
    expect(issues.some((i) => i.rule === 'ADM-POS-001')).toBe(true);
  });

  it('POS-001 rejects unknown place of service', () => {
    const issues = validatePayerAndEdiSpecific(
      baseClaim({ placeOfService: '88' }),
      {},
      today,
    );
    expect(issues.some((i) => i.rule === 'POS-001')).toBe(true);
  });

  it('DTP-ACC-REQ-001 requires accident date for WC filing indicator', () => {
    const issues = validatePayerAndEdiSpecific(
      baseClaim({ claimFilingIndicator: 'WC', accidentDate: null }),
      {},
      today,
    );
    expect(issues.some((i) => i.rule === 'DTP-ACC-REQ-001')).toBe(true);
  });

  it('DTP-LMP-002 requires female gender when LMP present', () => {
    const issues = validatePayerAndEdiSpecific(
      baseClaim({
        lastMenstrualPeriodDate: new Date('2020-06-01'),
        patientGender: 'M',
      }),
      {},
      today,
    );
    expect(issues.some((i) => i.rule === 'DTP-LMP-002')).toBe(true);
  });

  it('MID-05047 member ID format catalog', () => {
    const issues = validatePayerAndEdiSpecific(
      baseClaim({ payerId: '05047', subscriberMemberId: 'ABC' }),
      {},
      today,
    );
    expect(issues.some((i) => i.rule === 'MID-05047')).toBe(true);
  });

  it('ADDR-001 rejects billing PO BOX address', () => {
    const issues = validatePayerAndEdiSpecific(
      baseClaim({ billingProviderAddressLine1: 'PO BOX 123' }),
      {},
      today,
    );
    expect(issues.some((i) => i.rule === 'ADDR-001')).toBe(true);
  });

  it('AARP-PRI-001 rejects AARP as primary', () => {
    const issues = validatePayerAndEdiSpecific(
      baseClaim({ payerId: '36273', payerResponsibility: 'P' }),
      {},
      today,
    );
    expect(issues.some((i) => i.rule === 'AARP-PRI-001')).toBe(true);
  });

  it('ZIP-BILL-001 uses zip lookup rows when provided', () => {
    const issues = validatePayerAndEdiSpecific(
      baseClaim({
        billingProviderZip: '99999',
        billingProviderState: 'GA',
        billingProviderCity: 'Atlanta',
      }),
      {
        zipCodeRowsByZip5: {
          '30301': [{ city: 'Atlanta', state: 'GA', zip_code_type: 'S' }],
        },
      },
      today,
    );
    expect(issues.some((i) => i.rule === 'ZIP-BILL-001')).toBe(true);
  });

  it('ZIP-OSUB-001 validates other subscriber zip when relationship is self (18)', () => {
    const issues = validatePayerAndEdiSpecific(
      baseClaim({
        otherSubscribers: [
          {
            relationshipCode: '18',
            zipCode: '99999',
            state: 'GA',
            city: 'Atlanta',
          },
        ],
      }),
      {
        zipCodeRowsByZip5: {
          '30301': [{ city: 'Atlanta', state: 'GA', zip_code_type: 'P' }],
        },
      },
      today,
    );
    expect(issues.some((i) => i.rule === 'ZIP-OSUB-001')).toBe(true);
  });

  it('ZIP-OPAT-001 validates other patient zip when relationship empty', () => {
    const issues = validatePayerAndEdiSpecific(
      baseClaim({
        otherSubscribers: [
          {
            relationshipCode: '',
            patientLastName: 'DOE',
            patientZipCode: '99999',
            patientState: 'GA',
            patientCity: 'Atlanta',
          },
        ],
      }),
      {
        zipCodeRowsByZip5: {
          '30301': [{ city: 'Atlanta', state: 'GA', zip_code_type: 'P' }],
        },
      },
      today,
    );
    expect(issues.some((i) => i.rule === 'ZIP-OPAT-001')).toBe(true);
  });

  it('medicaid AL member ID skipped when formats inactive', () => {
    const issues = validatePayerAndEdiSpecific(
      baseClaim({ payerId: '271510177', subscriberMemberId: '123' }),
      { medicaidAlMemberIdFormatsActive: false },
      today,
    );
    expect(issues.some((i) => i.rule === 'MID-AL-001')).toBe(false);
  });

  it('medicaid AL member ID fires when formats active', () => {
    const issues = validatePayerAndEdiSpecific(
      baseClaim({ payerId: '271510177', subscriberMemberId: '123' }),
      { medicaidAlMemberIdFormatsActive: true },
      today,
    );
    expect(issues.some((i) => i.rule === 'MID-AL-001')).toBe(true);
  });

  it('COB-BCBS-001 waits 30 days after Medicare remittance for BL secondary', () => {
    const issues = validatePayerAndEdiSpecific(
      baseClaim({
        claimFilingIndicator: 'BL',
        otherSubscribers: [
          {
            payerResponsibility: 'P',
            claimFilingIndicator: 'MB',
            remittanceDate: '2026-01-01',
          },
        ],
      }),
      {},
      today,
    );
    expect(issues.some((i) => i.rule === 'COB-BCBS-001')).toBe(true);
  });

  it('MID-SUB-001 requires subscriber member ID when subscriber entity present', () => {
    const issues = validatePayerAndEdiSpecific(
      baseClaim({
        subscriberLastName: 'DOE',
        subscriberFirstName: 'JOHN',
        subscriberMemberId: '',
      }),
      {},
      today,
    );
    expect(issues.some((i) => i.rule === 'MID-SUB-001')).toBe(true);
  });

  it('ICD-SEQ-001 rejects sequela principal for listed payers', () => {
    const issues = validatePayerAndEdiSpecific(
      baseClaim({
        payerId: '87726',
        diagnoses: [{ sequence: 1, code: 'S72001S', type: 'principal', qualifier: 'ABK' }],
      }),
      {},
      today,
    );
    expect(issues.some((i) => i.rule === 'ICD-SEQ-001')).toBe(true);
  });

  it('COB-AMT-001 rejects negative COB paid amount', () => {
    const issues = validatePayerAndEdiSpecific(
      baseClaim({
        otherSubscribers: [{ paidAmount: -1 }],
      }),
      {},
      today,
    );
    expect(issues.some((i) => i.rule === 'COB-AMT-001')).toBe(true);
  });

  it('CONSULT-REF-001 requires referring provider for consultation CPT', () => {
    const issues = validatePayerAndEdiSpecific(
      baseClaim({
        serviceLines: [
          {
            lineNumber: 1,
            serviceDateFrom: new Date('2020-01-01'),
            serviceDateTo: null,
            procedureCode: '99242',
          },
        ],
      }),
      { consultationProcedureSet: { '99242': true } },
      today,
    );
    expect(issues.some((i) => i.rule === 'CONSULT-REF-001')).toBe(true);
  });

  it('DTP-ITD-REQ-001 requires initial treatment date for chiro taxonomy + MB', () => {
    const issues = validatePayerAndEdiSpecific(
      baseClaim({
        claimFilingIndicator: 'MB',
        billingProviderTaxonomy: '111N00000X',
        initialTreatmentDate: null,
        serviceLines: [
          { lineNumber: 1, serviceDateFrom: new Date('2020-01-01'), serviceDateTo: null },
        ],
      }),
      {},
      today,
    );
    expect(issues.some((i) => i.rule === 'DTP-ITD-REQ-001')).toBe(true);
  });

  it('WELL-VISIT-003 blocks well-visit CPT for MB', () => {
    const issues = validatePayerAndEdiSpecific(
      baseClaim({
        claimFilingIndicator: 'MB',
        serviceLines: [
          {
            lineNumber: 1,
            serviceDateFrom: new Date('2020-01-01'),
            serviceDateTo: null,
            procedureCode: '99391',
          },
        ],
      }),
      {},
      today,
    );
    expect(issues.some((i) => i.rule === 'WELL-VISIT-003')).toBe(true);
  });

  it('CPT-DC-001 requires discharge date for 99238', () => {
    const issues = validatePayerAndEdiSpecific(
      baseClaim({
        dischargeDate: null,
        serviceLines: [
          {
            lineNumber: 1,
            serviceDateFrom: new Date('2020-01-01'),
            serviceDateTo: new Date('2020-01-01'),
            procedureCode: '99238',
            units: 1,
          },
        ],
      }),
      {},
      today,
    );
    expect(issues.some((i) => i.rule === 'CPT-DC-001')).toBe(true);
  });

  it('LAB-CLIA-001 requires CLIA for lab codes on MB', () => {
    const issues = validatePayerAndEdiSpecific(
      baseClaim({
        claimFilingIndicator: 'MB',
        cliaNumber: null,
        serviceLines: [
          {
            lineNumber: 1,
            serviceDateFrom: new Date('2020-01-01'),
            serviceDateTo: null,
            procedureCode: '80053',
          },
        ],
      }),
      { labCodeModifiersByHcpcs: { '80053': {} } },
      today,
    );
    expect(issues.some((i) => i.rule === 'LAB-CLIA-001')).toBe(true);
  });

  it('DTP-DOS-BHT-001 rejects DOS after transaction set creation date', () => {
    const issues = validatePayerAndEdiSpecific(
      baseClaim({
        transactionSetCreationDate: new Date('2020-01-01'),
        serviceLines: [
          {
            lineNumber: 1,
            serviceDateFrom: new Date('2020-01-02'),
            serviceDateTo: null,
          },
        ],
      }),
      {},
      today,
    );
    expect(issues.some((i) => i.rule === 'DTP-DOS-BHT-001')).toBe(true);
  });
});
