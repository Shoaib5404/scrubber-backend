import { readFileSync } from 'fs';
import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { Edi837ValidationService } from '../../../src/modules/edi-structural-validation/edi837-validation.service';

describe('Desktop EDI structural (X222A1 / Stedi)', () => {
  let svc: Edi837ValidationService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true })],
      providers: [Edi837ValidationService],
    }).compile();
    svc = moduleRef.get(Edi837ValidationService);
  });

  it('passes structural validation: 2 claims.txt', () => {
    const result = svc.validate(
      readFileSync('C:/Users/abdul.waheed/Desktop/2 claims.txt', 'utf8'),
    );
    expect(result.passed).toBe(true);
  });

  for (const name of ['EDI - 19 claims.txt', 'Latest 19 claims.txt'] as const) {
    it(`does not invent false SBR01 uniqueness / blanket 2330B N4 errors on ${name}`, () => {
      const result = svc.validate(
        readFileSync(`C:/Users/abdul.waheed/Desktop/${name}`, 'utf8'),
      );
      const cob = result.issues.filter((i) => i.rule === 'COB-2320-ELEMENTS');
      expect(cob.some((i) => i.message.includes("SBR01 'S'"))).toBe(false);
      expect(cob.some((i) => i.message.includes("SBR01 'P'"))).toBe(false);
      expect(cob.some((i) => i.message.includes('N4 is required in loop_2330B when the loop is used'))).toBe(
        false,
      );
    });
  }

  it('Latest 19 claims.txt: SV101-7 description is allowed (no trailing-data warning)', () => {
    const result = svc.validate(
      readFileSync('C:/Users/abdul.waheed/Desktop/Latest 19 claims.txt', 'utf8'),
    );

    const svcWarn = result.issues.filter(
      (i) =>
        i.rule === 'SVC-STRUCT' &&
        i.severity === 'warning' &&
        i.message.includes('non-standard trailing data'),
    );
    expect(svcWarn.length).toBe(0);

    const beyondDesc = result.issues.filter(
      (i) =>
        i.rule === 'SVC-STRUCT' &&
        i.severity === 'warning' &&
        i.message.includes('unexpected components beyond'),
    );
    expect(beyondDesc.length).toBe(0);
  });
});
