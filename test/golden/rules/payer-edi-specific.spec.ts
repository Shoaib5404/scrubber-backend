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
});
