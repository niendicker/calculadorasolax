import { describe, expect, it } from 'vitest';
import { ACCOUNT_LIMITS, isLimitError, limitReachedMessage } from './limits';

describe('limitReachedMessage', () => {
  it('formats a message with the resource name and limit', () => {
    expect(limitReachedMessage('projetos salvos', 15)).toBe('Limite de 15 projetos salvos atingido.');
  });
});

describe('isLimitError', () => {
  it('matches an Error whose message was produced by limitReachedMessage', () => {
    expect(isLimitError(new Error(limitReachedMessage('projetos salvos', 15)))).toBe(true);
  });

  it('rejects an Error with an unrelated message', () => {
    expect(isLimitError(new Error('network error'))).toBe(false);
  });

  it('rejects non-Error values', () => {
    expect(isLimitError('Limite de 15 projetos salvos atingido.')).toBe(false);
    expect(isLimitError(null)).toBe(false);
    expect(isLimitError(undefined)).toBe(false);
  });
});

describe('ACCOUNT_LIMITS', () => {
  it('has the agreed values for each resource', () => {
    expect(ACCOUNT_LIMITS).toEqual({
      projects: 15,
      userLoadCatalog: 20,
      userStockItems: 20,
      loadsPerProject: 20,
      clients: 50,
      userPresets: 3,
      userServices: 10,
    });
  });
});
