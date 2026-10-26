import {
  formatNpiDescription,
  normalizeNpi,
} from './coding-reference.service';
import { validateNpiLuhn } from '../../claim-validation/support/npi.validator';

describe('coding-reference NPI helpers', () => {
  describe('normalizeNpi', () => {
    it('strips non-digits', () => {
      expect(normalizeNpi('114-479-0163')).toBe('1144790163');
      expect(normalizeNpi(' 1144790163 ')).toBe('1144790163');
    });

    it('returns null for empty / non-digit', () => {
      expect(normalizeNpi('')).toBeNull();
      expect(normalizeNpi('abc')).toBeNull();
      expect(normalizeNpi(null)).toBeNull();
    });
  });

  describe('formatNpiDescription', () => {
    it('formats LAST, FIRST', () => {
      expect(formatNpiDescription('SMITH', 'JANE')).toBe('SMITH, JANE');
    });

    it('falls back to single name', () => {
      expect(formatNpiDescription('SMITH', null)).toBe('SMITH');
      expect(formatNpiDescription(null, 'JANE')).toBe('JANE');
      expect(formatNpiDescription(null, null)).toBeNull();
    });
  });

  describe('Luhn used for formatValid', () => {
    it('accepts known valid NPI', () => {
      expect(validateNpiLuhn('1144790163')).toBe(true);
    });

    it('rejects bad checksum and short values', () => {
      expect(validateNpiLuhn('1144790164')).toBe(false);
      expect(validateNpiLuhn('123')).toBe(false);
      expect(validateNpiLuhn(normalizeNpi('abc') ?? '')).toBe(false);
    });
  });
});
