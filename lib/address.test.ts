import { describe, expect, it } from 'vitest';
import { addressFromJson, emptyAddress, formatAddress, isAddressEmpty } from './address';

describe('emptyAddress', () => {
  it('returns every field blank', () => {
    expect(emptyAddress()).toEqual({
      postalCode: '',
      street: '',
      number: '',
      complement: '',
      district: '',
      city: '',
      state: '',
    });
  });
});

describe('isAddressEmpty', () => {
  it('is true for a blank address', () => {
    expect(isAddressEmpty(emptyAddress())).toBe(true);
  });

  it('is false once any field has content', () => {
    expect(isAddressEmpty({ ...emptyAddress(), city: 'São Paulo' })).toBe(false);
  });

  it('treats whitespace-only fields as empty', () => {
    expect(isAddressEmpty({ ...emptyAddress(), street: '   ' })).toBe(true);
  });
});

describe('addressFromJson', () => {
  it('returns a blank address for null/undefined', () => {
    expect(addressFromJson(null)).toEqual(emptyAddress());
    expect(addressFromJson(undefined)).toEqual(emptyAddress());
  });

  it('treats a legacy plain string as the street line', () => {
    expect(addressFromJson('Rua X, 100')).toEqual({ ...emptyAddress(), street: 'Rua X, 100' });
  });

  it('treats an empty legacy string as blank', () => {
    expect(addressFromJson('')).toEqual(emptyAddress());
  });

  it('passes a structured object through, defaulting any missing field', () => {
    expect(addressFromJson({ street: 'Av. Paulista', city: 'São Paulo' })).toEqual({
      ...emptyAddress(),
      street: 'Av. Paulista',
      city: 'São Paulo',
    });
  });

  it('ignores non-string values on a malformed object', () => {
    expect(addressFromJson({ street: 123, city: 'São Paulo' })).toEqual({ ...emptyAddress(), city: 'São Paulo' });
  });
});

describe('formatAddress', () => {
  it('returns an empty string for null/undefined', () => {
    expect(formatAddress(null)).toBe('');
    expect(formatAddress(undefined)).toBe('');
  });

  it('returns an empty string for a fully blank address', () => {
    expect(formatAddress(emptyAddress())).toBe('');
  });

  it('formats a full address into a single readable line', () => {
    const address = {
      postalCode: '01310-930',
      street: 'Av. Paulista',
      number: '1000',
      complement: 'Sala 10',
      district: 'Bela Vista',
      city: 'São Paulo',
      state: 'SP',
    };
    expect(formatAddress(address)).toBe('Av. Paulista, 1000 - Sala 10 - Bela Vista - São Paulo/SP - 01310-930');
  });

  it('omits missing pieces instead of leaving stray separators', () => {
    expect(formatAddress({ ...emptyAddress(), street: 'Av. Paulista', city: 'São Paulo' })).toBe('Av. Paulista - São Paulo');
  });
});
