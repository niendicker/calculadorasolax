import { describe, expect, it } from 'vitest';
import { activeKwToApparentKva, apparentKvaToActiveKw } from './ac-power';

describe('C&I AC power units', () => {
  it('converts apparent power to active power before calculating energy', () => {
    const activeKw = apparentKvaToActiveKw(100, 0.8);
    expect(activeKw).toBe(80);
    expect(activeKw * 2).toBe(160); // Two hours consume 160 kWh, not 200 kWh.
    expect(activeKwToApparentKva(activeKw, 0.8)).toBe(100);
  });

  it.each([0, 10, -10, 123.45])('preserves signed power %s through a round trip', power => {
    expect(apparentKvaToActiveKw(activeKwToApparentKva(power, 0.92), 0.92)).toBeCloseTo(power, 10);
    expect(activeKwToApparentKva(power, 1)).toBe(power);
  });

  it.each([0, -0.8, 1.01, NaN, Infinity])('rejects invalid power factor %s', factor => {
    expect(() => activeKwToApparentKva(80, factor)).toThrow('fator de potência');
    expect(() => apparentKvaToActiveKw(100, factor)).toThrow('fator de potência');
  });

  it.each([NaN, Infinity, -Infinity])('rejects nonfinite power %s', power => {
    expect(() => activeKwToApparentKva(power, 0.8)).toThrow('Potência ativa');
    expect(() => apparentKvaToActiveKw(power, 0.8)).toThrow('Potência aparente');
  });
});
