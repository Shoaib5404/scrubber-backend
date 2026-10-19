import { effectiveEnabled } from './business-rule-effective';

describe('effectiveEnabled', () => {
  it('uses the seeded default when nobody has saved a switch', () => {
    expect(effectiveEnabled(true, undefined, undefined)).toBe(true);
  });

  it('uses the platform switch when the user has no personal row', () => {
    expect(effectiveEnabled(true, false, undefined)).toBe(false);
  });

  it('lets a personal on override a platform off', () => {
    expect(effectiveEnabled(true, false, true)).toBe(true);
  });

  it('lets a personal off override a platform on', () => {
    expect(effectiveEnabled(true, true, false)).toBe(false);
  });
});
