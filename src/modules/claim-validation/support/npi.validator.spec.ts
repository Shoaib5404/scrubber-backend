import { validateNpiLuhn } from './npi.validator';

describe('validateNpiLuhn', () => {
  it('accepts a known valid CMS NPI (Laravel parity)', () => {
    expect(validateNpiLuhn('1144790163')).toBe(true);
  });

  it('rejects invalid check digit', () => {
    expect(validateNpiLuhn('1144790164')).toBe(false);
  });

  it('rejects non-10-digit input', () => {
    expect(validateNpiLuhn('123')).toBe(false);
  });
});
