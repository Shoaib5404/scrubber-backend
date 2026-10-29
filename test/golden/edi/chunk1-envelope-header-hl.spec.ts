import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { readFileSync } from 'fs';
import { join } from 'path';
import { Edi837ValidationService } from '../../../src/modules/edi-structural-validation/edi837-validation.service';
import { FieldFormatValidator } from '../../../src/modules/edi-structural-validation/support/field-format.validator';
import { IsaPreValidator } from '../../../src/modules/edi-structural-validation/support/isa-pre.validator';
import { Edi837Spec } from '../../../src/modules/edi-structural-validation/edi837-spec';
import { resolve } from 'path';

describe('Chunk 1 envelope / header / HL parity', () => {
  const fixture = readFileSync(
    join(__dirname, '../fixtures/minimal-837p.edi'),
    'utf8',
  ).replace(/\r?\n/g, '');

  let svc: Edi837ValidationService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true })],
      providers: [Edi837ValidationService],
    }).compile();
    svc = moduleRef.get(Edi837ValidationService);
  });

  it('FieldFormat YYMMDD / D8 / amount', () => {
    expect(FieldFormatValidator.isValidYyMmDd('250101')).toBe(true);
    expect(FieldFormatValidator.isValidYyMmDd('251332')).toBe(false);
    expect(FieldFormatValidator.isValidD8('20250101')).toBe(true);
    expect(FieldFormatValidator.isValidD8('20250230')).toBe(false);
    expect(FieldFormatValidator.isValidAmount('12.5')).toBe(true);
    expect(FieldFormatValidator.isValidAmount('12.555')).toBe(false);
  });

  it('ISA-PRE rejects missing terminator after ISA16', () => {
    const spec = Edi837Spec.fromPath(resolve(process.cwd(), 'edi/837p/models'));
    const pre = new IsaPreValidator();
    // Truncate before ~ so fixed-width ISA fails terminator / ISA16 follow
    const truncated = fixture.slice(0, 100);
    const issues = pre.validate(truncated, spec);
    expect(issues.some((i) => i.rule === 'ENV-ISA-PRE')).toBe(true);
  });

  it('ENV-ISA warns when ISA06 equals ISA08', () => {
    // Build minimal valid ISA with same sender/receiver IDs (15-char padded)
    const same =
      'ISA*00*          *00*          *ZZ*SAMEID         *ZZ*SAMEID         *250101*1200*^*00501*000000001*0*P*:~' +
      fixture.slice(fixture.indexOf('GS*'));
    const result = svc.validate(same);
    expect(
      result.issues.some(
        (i) =>
          i.rule === 'ENV-ISA' &&
          i.severity === 'warning' &&
          i.message.includes('ISA06 and ISA08'),
      ),
    ).toBe(true);
  });

  it('minimal fixture passes Chunk 1 structural rules', () => {
    const result = svc.validate(fixture);
    const chunk1 = new Set([
      'ENV-ISA',
      'ENV-ELEMENTS',
      'G001',
      'G006',
      'G002',
      'G005',
      'G003',
      'G004',
      'HDR-1000-ELEMENTS',
      'HDR-STRUCT',
      'HL-HIER',
      'HL-2000A-ELEMENTS',
      'HL-2000B-ELEMENTS',
      'HL-2000C-ELEMENTS',
    ]);
    const errors = result.issues.filter(
      (i) => chunk1.has(i.rule) && (i.severity === 'error' || i.severity === 'critical'),
    );
    expect(errors).toEqual([]);
  });

  it('HDR-STRUCT requires BHT', () => {
    const noBht = fixture.replace(/BHT\*[^\n~]*~/, '');
    const result = svc.validate(noBht);
    expect(
      result.issues.some(
        (i) => i.rule === 'HDR-STRUCT' && i.message.includes('BHT'),
      ),
    ).toBe(true);
  });

  it('HL-HIER requires sequential HL01', () => {
    const bad = fixture.replace('HL*1*', 'HL*2*');
    const result = svc.validate(bad);
    expect(
      result.issues.some(
        (i) => i.rule === 'HL-HIER' && i.message.includes('sequential'),
      ),
    ).toBe(true);
  });

  it('HL-HIER allows a second billing-provider root with empty HL02', () => {
    const withSecondRoot = fixture.replace(
      /SE\*/,
      'HL*3**20*1~NM1*85*2*OTHER PROV*****XX*1098765432~N3*9 OAK~N4*TOWN*TX*75002~HL*4*3*22*0~SBR*P*18*******CI~NM1*IL*1*SMITH*ANN****MI*9~N3*8 OAK~N4*TOWN*TX*75002~DMG*D8*19900101*F~NM1*PR*2*PAYER*****PI*6400~CLM*ZZ*1***11:B:1*Y*A*Y*Y~HI*ABK:J069~LX*1~SV1*HC:99213*1*UN*1***1~DTP*472*D8*20240102~SE*',
    );
    const result = svc.validate(withSecondRoot);
    expect(
      result.issues.filter(
        (i) =>
          i.rule === 'HL-HIER' &&
          i.message.includes('HL02 must reference a valid parent'),
      ),
    ).toHaveLength(0);
  });

  it('HL-2000B-ELEMENTS requires SBR', () => {
    // Remove SBR after HL*22 — minimal fixture has patient-is-subscriber
    const withoutSbr = fixture.replace(/SBR\*[^\n~]*~/, '');
    const result = svc.validate(withoutSbr);
    expect(
      result.issues.some(
        (i) =>
          i.rule === 'HL-2000B-ELEMENTS' &&
          i.message.includes('SBR') && i.message.includes('required'),
      ),
    ).toBe(true);
  });

  it('desktop 2 claims.txt still passes', () => {
    const result = svc.validate(
      readFileSync('C:/Users/abdul.waheed/Desktop/2 claims.txt', 'utf8'),
    );
    expect(result.passed).toBe(true);
  });
});
