import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { readFileSync } from 'fs';
import { join } from 'path';
import { Edi837ValidationService } from '../../../src/modules/edi-structural-validation/edi837-validation.service';
import { ModelDrivenEdiParser } from '../../../src/modules/edi-parser/model-driven-edi.parser';
import { validateClaimFields } from '../../../src/modules/claim-validation/rules/claim-field.rules';
import { validateClaimFilingIndicator } from '../../../src/modules/claim-validation/rules/claim-filing-indicator.rules';
import { validateDosNotInFuture } from '../../../src/modules/claim-validation/rules/payer-edi-specific.rules';
import { validateServiceLineBasics } from '../../../src/modules/claim-validation/rules/service-line-basics.rules';
import { SegmentElementValidator } from '../../../src/modules/edi-structural-validation/support/segment-element.validator';
import { Edi837Spec } from '../../../src/modules/edi-structural-validation/edi837-spec';
import { resolve } from 'path';

describe('SP-4 EDI golden / structural', () => {
  const fixture = readFileSync(
    join(__dirname, '../fixtures/minimal-837p.edi'),
    'utf8',
  ).replace(/\r?\n/g, '');

  const emptyClaimDates = {
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

  it('registers all 39 Laravel structural rule ids', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true })],
      providers: [Edi837ValidationService],
    }).compile();
    const svc = moduleRef.get(Edi837ValidationService);
    const ids = svc.registeredRuleIds();
    expect(ids).toHaveLength(39);
    expect(ids[0]).toBe('ENV-ISA');
    expect(ids).toContain('ENV-ELEMENTS');
    expect(ids).toContain('CLM-2300-ELEMENTS');
    expect(ids).toContain('COB-STRUCT');
  });

  it('ISA pre-validator rejects truncated ISA', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true })],
      providers: [Edi837ValidationService],
    }).compile();
    const svc = moduleRef.get(Edi837ValidationService);
    const result = svc.validate('ISA*00*THIS_IS_NOT_VALID_EDI~');
    expect(result.passed).toBe(false);
    expect(result.error_count).toBeGreaterThan(0);
  });

  it('ENV-ELEMENTS loads ElementSpec and validates ISA required fields', () => {
    const spec = Edi837Spec.fromPath(resolve(process.cwd(), 'edi/837p/models'));
    const isaSpec = spec.segmentSpec('ISA');
    expect(isaSpec).toBeTruthy();
    const validator = new SegmentElementValidator();
    const issues = validator.validateSegment(
      {
        id: 'ISA',
        elements: ['ISA', '00', '', '00', '', 'ZZ', 'SUBMITTER', 'ZZ', 'RECEIVER'],
        index: 0,
        raw: 'ISA*00**00**ZZ*SUBMITTER*ZZ*RECEIVER',
      },
      'ISA',
      isaSpec as Record<string, unknown>,
      'ENV-ELEMENTS',
      'envelope',
    );
    expect(issues.some((i) => i.rule === 'ENV-ELEMENTS')).toBe(true);
    expect(issues.some((i) => (i.field ?? '').startsWith('ISA'))).toBe(true);
  });

  it('pipeline validates minimal 837P without parse failure', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true })],
      providers: [Edi837ValidationService],
    }).compile();
    const svc = moduleRef.get(Edi837ValidationService);
    const result = svc.validate(fixture);
    expect(result.issues.some((i) => i.rule === 'ENV-PARSE')).toBe(false);
    expect(svc.registeredRuleIds()).toContain('HDR-1000-ELEMENTS');
  });

  it('parses minimal 837P into one claim with diagnosis and line', () => {
    const parser = new ModelDrivenEdiParser();
    const parsed = parser.parse(fixture);
    expect(parsed.claims).toHaveLength(1);
    expect(parsed.claims[0].claimId).toBe('CLAIM001');
    expect(parsed.claims[0].diagnoses.length).toBeGreaterThanOrEqual(1);
    expect(parsed.claims[0].serviceLines.length).toBeGreaterThanOrEqual(1);
    expect(parsed.claims[0].serviceLines[0].procedureCode).toBe('99213');
  });

  it('claim field rules emit REQ-001 when billing NPI missing', () => {
    const errors = validateClaimFields({
      billingProviderNpi: null,
      subscriberMemberId: 'MEM',
      payerId: 'P',
      payerName: null,
      totalCharge: 10,
      diagnosesCount: 1,
    });
    expect(errors.some((e) => e.rule === 'REQ-001')).toBe(true);
  });

  it('SBR-001 rejects missing claim filing indicator', () => {
    const errors = validateClaimFilingIndicator({
      claimFilingIndicator: null,
      payerResponsibility: 'P',
      subscriberMemberId: 'MEM1',
      subscriberDob: null,
      patientDob: null,
      otherSubscribers: null,
      serviceDateFrom: null,
    });
    expect(errors.some((e) => e.rule === 'SBR-001')).toBe(true);
  });

  it('SBR-002 rejects dual government filing indicators', () => {
    const errors = validateClaimFilingIndicator({
      claimFilingIndicator: 'MB',
      payerResponsibility: 'P',
      subscriberMemberId: 'MEM1',
      subscriberDob: null,
      patientDob: null,
      otherSubscribers: [{ member_id: 'OTH1', claim_filing_indicator: 'MC' }],
      serviceDateFrom: null,
    });
    expect(errors.some((e) => e.rule === 'SBR-002')).toBe(true);
  });

  it('DOS-FUT-001 fires for future service date', () => {
    const future = new Date();
    future.setDate(future.getDate() + 7);
    const errors = validateDosNotInFuture(
      [{ lineNumber: 1, serviceDateFrom: future, serviceDateTo: future }],
      emptyClaimDates,
    );
    expect(errors.some((e) => e.rule === 'DOS-FUT-001')).toBe(true);
  });

  it('service line basics emit REQ-006 and BUS-005', () => {
    const { errors } = validateServiceLineBasics(
      [
        {
          lineNumber: 1,
          procedureCode: '99213',
          chargeAmount: 10,
          units: 1,
          serviceDateFrom: null,
          serviceDateTo: null,
          diagnosisPointers: [3],
        },
      ],
      1,
    );
    expect(errors.some((e) => e.rule === 'REQ-006')).toBe(true);
    expect(errors.some((e) => e.rule === 'BUS-005')).toBe(true);
  });
});
