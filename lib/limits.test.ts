import { describe, expect, it } from 'vitest';
import { ACCOUNT_LIMITS, limitReachedMessage } from './limits';

describe('limitReachedMessage', () => {
  it('formats a message with the resource name and limit', () => {
    expect(limitReachedMessage('projetos salvos', 15)).toBe('Limite de 15 projetos salvos atingido.');
  });
});

describe('ACCOUNT_LIMITS', () => {
  it('has the agreed values for each resource', () => {
    expect(ACCOUNT_LIMITS).toEqual({
      projects: 15,
      userLoadCatalog: 20,
      userStockItems: 10,
      loadsPerProject: 20,
      clients: 50,
      userPresets: 3,
    });
  });
});
