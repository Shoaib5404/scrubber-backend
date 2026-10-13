import { readFileSync } from 'fs';
import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { Edi837ValidationService } from '../../../src/modules/edi-structural-validation/edi837-validation.service';

describe('Desktop EDI structural (Laravel COB-2320 parity)', () => {
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
    it(`rejects ${name} with COB-2320-ELEMENTS (Laravel parity)`, () => {
      const result = svc.validate(
        readFileSync(`C:/Users/abdul.waheed/Desktop/${name}`, 'utf8'),
      );
      expect(result.passed).toBe(false);
      const cob = result.issues.filter((i) => i.rule === 'COB-2320-ELEMENTS');
      expect(cob.length).toBeGreaterThan(0);
      expect(
        cob.some((i) => i.message.includes('SBR01') || i.message.includes('N4 is required')),
      ).toBe(true);
    });
  }

  it('Latest 19 claims.txt matches Laravel COB/SVC issue counts', () => {
    const result = svc.validate(
      readFileSync('C:/Users/abdul.waheed/Desktop/Latest 19 claims.txt', 'utf8'),
    );
    expect(result.passed).toBe(false);
    expect(result.error_count).toBe(10);
    expect(result.warning_count).toBe(1);

    const cob = result.issues.filter((i) => i.rule === 'COB-2320-ELEMENTS');
    const byMsg = (needle: string) => cob.filter((i) => i.message.includes(needle)).length;
    expect(byMsg('N4 is required')).toBe(7);
    expect(byMsg("SBR01 'S'")).toBe(2);
    expect(byMsg("SBR01 'P'")).toBe(1);

    const svcWarn = result.issues.filter(
      (i) =>
        i.rule === 'SVC-STRUCT' &&
        i.severity === 'warning' &&
        i.message.includes('non-standard trailing data'),
    );
    expect(svcWarn.length).toBe(1);
  });
});
