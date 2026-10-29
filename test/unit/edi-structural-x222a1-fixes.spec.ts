import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { Edi837ValidationService } from '../../src/modules/edi-structural-validation/edi837-validation.service';
import { validateProcedureComposite } from '../../src/modules/edi-structural-validation/support/procedure-code.validator';

/**
 * X222A1 / Stedi correctness for the Nest structural validator
 * (claim HL boundaries, multi HL*20 roots, COB uniqueness, N4, DTP*472 RD8, SV101-7).
 */
describe('EDI structural X222A1 fixes', () => {
  let svc: Edi837ValidationService;

  const wrap = (body: string) =>
    [
      'ISA*00*          *00*          *ZZ*SENDER         *ZZ*RECEIVER       *260101*1200*^*00501*000000001*0*P*:~',
      'GS*HC*SENDER*RECEIVER*20260101*1200*1*X*005010X222A1~',
      'ST*837*0001*005010X222A1~',
      'BHT*0019*00*1*20260101*1200*CH~',
      'NM1*41*2*SUBMITTER*****46*123~',
      'NM1*40*2*RECEIVER*****46*456~',
      body,
      'SE*10*0001~',
      'GE*1*1~',
      'IEA*1*000000001~',
    ].join('');

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true })],
      providers: [Edi837ValidationService],
    }).compile();
    svc = moduleRef.get(Edi837ValidationService);
  });

  it('allows multiple billing-provider HL roots with empty HL02', () => {
    const edi = wrap(
      [
        'HL*1**20*1~',
        'NM1*85*2*PROV A*****XX*1234567890~',
        'N3*1 MAIN~',
        'N4*CITY*TX*75001~',
        'HL*2*1*22*0~',
        'SBR*P*18*******CI~',
        'NM1*IL*1*DOE*JOHN****MI*1~',
        'N3*2 MAIN~',
        'N4*CITY*TX*75001~',
        'DMG*D8*19800101*M~',
        'NM1*PR*2*PAYER*****PI*001~',
        'CLM*A1*10***11:B:1*Y*A*Y*Y~',
        'HI*ABK:J069~',
        'LX*1~',
        'SV1*HC:99213*10*UN*1***1~',
        'DTP*472*D8*20250101~',
        'HL*3**20*1~',
        'NM1*85*2*PROV B*****XX*1098765432~',
        'N3*3 MAIN~',
        'N4*CITY*TX*75001~',
        'HL*4*3*22*0~',
        'SBR*P*18*******CI~',
        'NM1*IL*1*ROE*JANE****MI*2~',
        'N3*4 MAIN~',
        'N4*CITY*TX*75001~',
        'DMG*D8*19850101*F~',
        'NM1*PR*2*PAYER*****PI*001~',
        'CLM*B1*10***11:B:1*Y*A*Y*Y~',
        'HI*ABK:J069~',
        'LX*1~',
        'SV1*HC:99213*10*UN*1***1~',
        'DTP*472*D8*20250101~',
      ].join(''),
    );

    const result = svc.validate(edi);
    expect(
      result.issues.filter(
        (i) =>
          i.rule === 'HL-HIER' &&
          i.message.includes('HL02 must reference a valid parent'),
      ),
    ).toHaveLength(0);
    expect(
      result.issues.filter(
        (i) =>
          i.rule === 'SVC-2400-ELEMENTS' &&
          (i.message.includes("NM101 '85'") || i.message.includes('Segment HL is not used')),
      ),
    ).toHaveLength(0);
  });

  it('does not invent SBR01 uniqueness from a single P then S COB pair', () => {
    const edi = wrap(
      [
        'HL*1**20*1~',
        'NM1*85*2*PROV*****XX*1234567890~',
        'N3*1 MAIN~',
        'N4*CITY*TX*75001~',
        'HL*2*1*22*0~',
        'SBR*P*18*******MB~',
        'NM1*IL*1*DOE*JOHN****MI*1~',
        'N3*2 MAIN~',
        'N4*CITY*TX*75001~',
        'DMG*D8*19800101*M~',
        'NM1*PR*2*DEST*****PI*002~',
        'CLM*C1*10***11:B:1*Y*A*Y*Y~',
        'HI*ABK:J069~',
        'SBR*P*18*******MB~',
        'OI***Y***Y~',
        'NM1*IL*1*DOE*JOHN****MI*1~',
        'N3*2 MAIN~',
        'N4*CITY*TX*75001~',
        'NM1*PR*2*MEDICARE*****PI*001~',
        'SBR*S*18*******CI~',
        'OI***Y***Y~',
        'NM1*IL*1*DOE*JOHN****MI*1~',
        'N3*2 MAIN~',
        'N4*CITY*TX*75001~',
        'NM1*PR*2*OTHER*****PI*003~',
        'LX*1~',
        'SV1*HC:99213*10*UN*1***1~',
        'DTP*472*D8*20250101~',
      ].join(''),
    );

    const result = svc.validate(edi);
    expect(
      result.issues.filter(
        (i) => i.rule === 'COB-2320-ELEMENTS' && i.message.includes('SBR01'),
      ),
    ).toHaveLength(0);
  });

  it('does not require 2330B N4 when N3 is absent', () => {
    const edi = wrap(
      [
        'HL*1**20*1~',
        'NM1*85*2*PROV*****XX*1234567890~',
        'N3*1 MAIN~',
        'N4*CITY*TX*75001~',
        'HL*2*1*22*0~',
        'SBR*S*18*******MB~',
        'NM1*IL*1*DOE*JOHN****MI*1~',
        'N3*2 MAIN~',
        'N4*CITY*TX*75001~',
        'DMG*D8*19800101*M~',
        'NM1*PR*2*DEST*****PI*002~',
        'CLM*D1*10***11:B:1*Y*A*Y*Y~',
        'HI*ABK:J069~',
        'SBR*P*18*******MB~',
        'OI***Y***Y~',
        'NM1*IL*1*DOE*JOHN****MI*1~',
        'N3*2 MAIN~',
        'N4*CITY*TX*75001~',
        'NM1*PR*2*MEDICARE*****PI*001~',
        'LX*1~',
        'SV1*HC:99213*10*UN*1***1~',
        'DTP*472*D8*20250101~',
      ].join(''),
    );

    const result = svc.validate(edi);
    expect(
      result.issues.filter(
        (i) =>
          i.rule === 'COB-2320-ELEMENTS' &&
          i.message.includes('N4 is required in loop_2330B'),
      ),
    ).toHaveLength(0);
  });

  it('requires 2330B N4 when N3 is present', () => {
    const edi = wrap(
      [
        'HL*1**20*1~',
        'NM1*85*2*PROV*****XX*1234567890~',
        'N3*1 MAIN~',
        'N4*CITY*TX*75001~',
        'HL*2*1*22*0~',
        'SBR*S*18*******MB~',
        'NM1*IL*1*DOE*JOHN****MI*1~',
        'N3*2 MAIN~',
        'N4*CITY*TX*75001~',
        'DMG*D8*19800101*M~',
        'NM1*PR*2*DEST*****PI*002~',
        'CLM*E1*10***11:B:1*Y*A*Y*Y~',
        'HI*ABK:J069~',
        'SBR*P*18*******MB~',
        'OI***Y***Y~',
        'NM1*IL*1*DOE*JOHN****MI*1~',
        'N3*2 MAIN~',
        'N4*CITY*TX*75001~',
        'NM1*PR*2*MEDICARE*****PI*001~',
        'N3*PO BOX 1~',
        'LX*1~',
        'SV1*HC:99213*10*UN*1***1~',
        'DTP*472*D8*20250101~',
      ].join(''),
    );

    const result = svc.validate(edi);
    expect(
      result.issues.some(
        (i) =>
          i.rule === 'COB-2320-ELEMENTS' &&
          i.message.includes('N4 is required in loop_2330B when N3 is present'),
      ),
    ).toBe(true);
  });

  it('accepts DTP*472 RD8 service date ranges', () => {
    const edi = wrap(
      [
        'HL*1**20*1~',
        'NM1*85*2*PROV*****XX*1234567890~',
        'N3*1 MAIN~',
        'N4*CITY*TX*75001~',
        'HL*2*1*22*0~',
        'SBR*P*18*******CI~',
        'NM1*IL*1*DOE*JOHN****MI*1~',
        'N3*2 MAIN~',
        'N4*CITY*TX*75001~',
        'DMG*D8*19800101*M~',
        'NM1*PR*2*PAYER*****PI*001~',
        'CLM*F1*10***11:B:1*Y*A*Y*Y~',
        'HI*ABK:J069~',
        'LX*1~',
        'SV1*HC:99213*10*UN*1***1~',
        'DTP*472*RD8*20250101-20250101~',
      ].join(''),
    );

    const result = svc.validate(edi);
    expect(
      result.issues.filter(
        (i) => i.rule === 'SVC-STRUCT' && i.message.includes('DTP*472'),
      ),
    ).toHaveLength(0);
  });

  it('keeps rejecting invalid SBR05 MB in loop 2320', () => {
    const edi = wrap(
      [
        'HL*1**20*1~',
        'NM1*85*2*PROV*****XX*1234567890~',
        'N3*1 MAIN~',
        'N4*CITY*TX*75001~',
        'HL*2*1*22*0~',
        'SBR*P*18*******CI~',
        'NM1*IL*1*DOE*JOHN****MI*1~',
        'N3*2 MAIN~',
        'N4*CITY*TX*75001~',
        'DMG*D8*19800101*M~',
        'NM1*PR*2*PAYER*****PI*001~',
        'CLM*G1*10***11:B:1*Y*A*Y*Y~',
        'HI*ABK:J069~',
        'SBR*S*18***MB****MB~',
        'OI***Y***Y~',
        'NM1*IL*1*DOE*JOHN****MI*1~',
        'N3*2 MAIN~',
        'N4*CITY*TX*75001~',
        'NM1*PR*2*OTHER*****PI*003~',
        'LX*1~',
        'SV1*HC:99213*10*UN*1***1~',
        'DTP*472*D8*20250101~',
      ].join(''),
    );

    const result = svc.validate(edi);
    expect(
      result.issues.some(
        (i) =>
          i.rule === 'COB-2320-ELEMENTS' &&
          i.message.includes("SBR05") &&
          i.message.includes("'MB'"),
      ),
    ).toBe(true);
  });

  it('allows SV101-7 procedure description without warning', () => {
    const findings = validateProcedureComposite(
      'HC:83986:QW::::PH BODY FLUID NOT ELSEWHERE SPECIFIED',
      ':',
    );
    expect(findings.filter((f) => f.severity === 'warning')).toHaveLength(0);
  });
});
