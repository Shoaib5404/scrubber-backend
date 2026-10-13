import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { readFileSync } from 'fs';
import { Edi837ValidationService } from '../../../src/modules/edi-structural-validation/edi837-validation.service';
import { createStructuralRules } from '../../../src/modules/edi-structural-validation/rules/pipeline.rules';

describe('Chunk 4 COB / service / remaining structure', () => {
  let svc: Edi837ValidationService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true })],
      providers: [Edi837ValidationService],
    }).compile();
    svc = moduleRef.get(Edi837ValidationService);
  });

  it('registers 39 rules with Chunk 4 ids in Laravel order', () => {
    const ids = createStructuralRules().map((r) => r.id());
    expect(ids).toHaveLength(39);
    expect(ids.indexOf('COB-2320-ELEMENTS')).toBeLessThan(ids.indexOf('SVC-2400-ELEMENTS'));
    expect(ids.indexOf('SVC-2400-ELEMENTS')).toBeLessThan(ids.indexOf('CLM-STRUCT'));
    expect(ids.indexOf('CLM-STRUCT')).toBeLessThan(ids.indexOf('AMT-STRUCT'));
    expect(ids.indexOf('AMT-STRUCT')).toBeLessThan(ids.indexOf('DX-STRUCT'));
    expect(ids.indexOf('DX-STRUCT')).toBeLessThan(ids.indexOf('SVC-STRUCT'));
    expect(ids.indexOf('SVC-STRUCT')).toBeLessThan(ids.indexOf('DRUG-STRUCT'));
    expect(ids.indexOf('DRUG-STRUCT')).toBeLessThan(ids.indexOf('DATE-STRUCT'));
    expect(ids.indexOf('DATE-STRUCT')).toBeLessThan(ids.indexOf('COB-STRUCT'));
    expect(ids[ids.length - 1]).toBe('COB-STRUCT');
  });

  it('Nest≡Laravel on Desktop EDI files after Chunk 4', () => {
    const two = svc.validate(
      readFileSync('C:/Users/abdul.waheed/Desktop/2 claims.txt', 'utf8'),
    );
    expect(two.passed).toBe(true);
    expect(two.error_count).toBe(0);
    expect(two.warning_count).toBe(0);

    const nineteen = svc.validate(
      readFileSync('C:/Users/abdul.waheed/Desktop/EDI - 19 claims.txt', 'utf8'),
    );
    expect(nineteen.passed).toBe(false);
    expect(nineteen.error_count).toBe(10);
    expect(nineteen.warning_count).toBe(1);
    expect(nineteen.issues.filter((i) => i.rule === 'COB-2320-ELEMENTS')).toHaveLength(10);
    expect(
      nineteen.issues.filter((i) => i.rule === 'SVC-STRUCT' && i.severity === 'warning'),
    ).toHaveLength(1);
  });
});
