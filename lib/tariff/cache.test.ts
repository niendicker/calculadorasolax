import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EnergyTariffResult } from './aneel-service';
import { cache } from './cache';

const tariff: EnergyTariffResult = {
  distributor: 'Distribuidora Teste',
  subgroup: 'B1',
  tariffMode: 'Branca',
  validFrom: '2026-01-01',
  source: 'ANEEL',
  fetchedAt: '2026-01-01T00:00:00.000Z',
  tariffs: { peak: 1.2 },
};

const dataset = [{ _id: 1, SigAgente: 'Distribuidora Teste' }];

beforeEach(() => {
  cache.clear();
  vi.restoreAllMocks();
});

describe('tariff cache', () => {
  it('stores and retrieves tariffs, distributors and the ANEEL dataset', () => {
    cache.setTariff('tariff-key', tariff);
    cache.setDistributors(['Distribuidora Teste']);
    cache.setDataset(dataset);

    expect(cache.getTariff('tariff-key')).toEqual(tariff);
    expect(cache.getDistributors()).toEqual(['Distribuidora Teste']);
    expect(cache.getDataset()).toEqual(dataset);
  });

  it('returns null after an entry exceeds the 24-hour TTL', () => {
    const now = 1_700_000_000_000;
    vi.spyOn(Date, 'now').mockReturnValue(now);
    cache.setTariff('tariff-key', tariff);
    cache.setDistributors(['Distribuidora Teste']);
    cache.setDataset(dataset);

    vi.spyOn(Date, 'now').mockReturnValue(now + 24 * 60 * 60 * 1000 + 1);

    expect(cache.getTariff('tariff-key')).toBeNull();
    expect(cache.getDistributors()).toBeNull();
    expect(cache.getDataset()).toBeNull();
  });

  it('clears cached values explicitly', () => {
    cache.setTariff('tariff-key', tariff);
    cache.setDistributors(['Distribuidora Teste']);
    cache.setDataset(dataset);

    cache.clear();

    expect(cache.getTariff('tariff-key')).toBeNull();
    expect(cache.getDistributors()).toBeNull();
    expect(cache.getDataset()).toBeNull();
  });
});
