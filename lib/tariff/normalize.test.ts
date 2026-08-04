import { describe, it, expect } from 'vitest';
import {
  normalizePeriodName,
  normalizeNumber,
  normalizeDistributorName,
  convertMwhToKwh,
  normalizeUnit,
} from './normalize';

describe('normalizePeriodName', () => {
  it('normalizes ponta to peak', () => {
    expect(normalizePeriodName('Ponta')).toBe('peak');
    expect(normalizePeriodName('ponta')).toBe('peak');
    expect(normalizePeriodName('PONTA')).toBe('peak');
  });

  it('normalizes intermediária to intermediate', () => {
    expect(normalizePeriodName('Intermediária')).toBe('intermediate');
    expect(normalizePeriodName('Intermediário')).toBe('intermediate');
    expect(normalizePeriodName('intermediária')).toBe('intermediate');
  });

  it('normalizes fora ponta variants to offPeak', () => {
    expect(normalizePeriodName('Fora ponta')).toBe('offPeak');
    expect(normalizePeriodName('Fora de ponta')).toBe('offPeak');
    expect(normalizePeriodName('fora-ponta')).toBe('offPeak');
    expect(normalizePeriodName('fora-de-ponta')).toBe('offPeak');
    expect(normalizePeriodName('Fora  de  ponta')).toBe('offPeak');
  });

  it('normalizes convencional to conventional', () => {
    expect(normalizePeriodName('Convencional')).toBe('conventional');
    expect(normalizePeriodName('convencional')).toBe('conventional');
  });

  it('returns null for unknown periods', () => {
    expect(normalizePeriodName('Unknown')).toBeNull();
    expect(normalizePeriodName('Pico')).toBeNull();
  });
});

describe('normalizeNumber', () => {
  it('parses string numbers with commas', () => {
    expect(normalizeNumber('1,5')).toBe(1.5);
    expect(normalizeNumber('100,99')).toBe(100.99);
  });

  it('parses string numbers with dots', () => {
    expect(normalizeNumber('1.5')).toBe(1.5);
    expect(normalizeNumber('100.99')).toBe(100.99);
  });

  it('handles numbers with spaces', () => {
    expect(normalizeNumber('1 000,5')).toBe(1000.5);
    expect(normalizeNumber('1,234')).toBe(1.234);
  });

  it('passes through numeric inputs', () => {
    expect(normalizeNumber(1.5)).toBe(1.5);
    expect(normalizeNumber(0)).toBe(0);
  });

  it('returns 0 for invalid strings', () => {
    expect(normalizeNumber('abc')).toBe(0);
    expect(normalizeNumber('')).toBe(0);
  });
});

describe('normalizeDistributorName', () => {
  it('normalizes distributor names to lowercase with accents removed', () => {
    expect(normalizeDistributorName('CEMIG')).toBe('cemig');
    expect(normalizeDistributorName('AES São Paulo')).toBe('aes sao paulo');
    expect(normalizeDistributorName('Eletropaulo')).toBe('eletropaulo');
  });

  it('handles multiple spaces', () => {
    expect(normalizeDistributorName('AES  São  Paulo')).toBe('aes sao paulo');
  });
});

describe('convertMwhToKwh', () => {
  it('converts R$/MWh to R$/kWh', () => {
    expect(convertMwhToKwh(1000)).toBe(1);
    expect(convertMwhToKwh(500)).toBe(0.5);
    expect(convertMwhToKwh(1250)).toBe(1.25);
  });

  it('handles zero', () => {
    expect(convertMwhToKwh(0)).toBe(0);
  });
});

describe('normalizeUnit', () => {
  it('converts R$/MWh to R$/kWh', () => {
    const result = normalizeUnit(1000, 'R$/MWh');
    expect(result.value).toBe(1);
    expect(result.unit).toBe('r$/kwh');
  });

  it('handles unit string with spaces', () => {
    const result = normalizeUnit(1000, 'R$ / MWh');
    expect(result.value).toBe(1);
    expect(result.unit).toBe('r$/kwh');
  });

  it('preserves already-converted R$/kWh', () => {
    const result = normalizeUnit(1.5, 'R$/kWh');
    expect(result.value).toBe(1.5);
    expect(result.unit).toBe('r$/kwh');
  });

  it('preserves other units', () => {
    const result = normalizeUnit(10, 'R$/kW');
    expect(result.value).toBe(10);
    expect(result.unit).toBe('r$/kw');
  });
});
