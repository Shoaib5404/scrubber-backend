import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { readFileSync } from 'fs';
import { join } from 'path';
import { Edi837ValidationService } from '../../../src/modules/edi-structural-validation/edi837-validation.service';
import { ModelDrivenEdiParser } from '../../../src/modules/edi-parser/model-driven-edi.parser';
import { validateClaimFields } from '../../../src/modules/claim-validation/rules/claim-field.rules';

describe('SP-4 EDI golden / structural', () => {
  const fixture = readFileSync(
    join(__dirname, '../fixtures/minimal-837p.edi'),
    'utf8',
  ).replace(/\r?\n/g, '');

  it('registers all 39 Laravel structural rule ids', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true })],
      providers: [Edi837ValidationService],
    }).compile();
    const svc = moduleRef.get(Edi837ValidationService);
    const ids = svc.registeredRuleIds();
    expect(ids).toHaveLength(39);
    expect(ids[0]).toBe('ENV-ISA');
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
});
