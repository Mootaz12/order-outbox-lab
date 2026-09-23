import { positiveInt } from './parse';

describe('positiveInt', () => {
  it('falls back when unset or empty', () => {
    expect(positiveInt('PORT', undefined, 3000)).toBe(3000);
    expect(positiveInt('PORT', '', 3000)).toBe(3000);
  });

  it('parses a positive integer', () => {
    expect(positiveInt('PORT', '8081', 3000)).toBe(8081);
  });

  it.each(['abc', '0', '-1', '3.5'])('rejects %s at boot instead of passing NaN on', (raw) => {
    expect(() => positiveInt('PORT', raw, 3000)).toThrow(`PORT must be a positive integer, got "${raw}"`);
  });
});
