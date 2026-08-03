import type { EnergyTariffResult } from './aneel-service';

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

class SimpleCache {
  private tariffCache = new Map<string, CacheEntry<EnergyTariffResult>>();
  private distributorCache = new Map<string, CacheEntry<string[]>>();

  getTariff(key: string): EnergyTariffResult | null {
    const entry = this.tariffCache.get(key);
    if (!entry) return null;

    if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
      this.tariffCache.delete(key);
      return null;
    }

    return entry.data;
  }

  setTariff(key: string, data: EnergyTariffResult): void {
    this.tariffCache.set(key, {
      data,
      timestamp: Date.now(),
    });
  }

  getDistributors(): string[] | null {
    const entry = this.distributorCache.get('distributors');
    if (!entry) return null;

    if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
      this.distributorCache.delete('distributors');
      return null;
    }

    return entry.data;
  }

  setDistributors(data: string[]): void {
    this.distributorCache.set('distributors', {
      data,
      timestamp: Date.now(),
    });
  }

  clear(): void {
    this.tariffCache.clear();
    this.distributorCache.clear();
  }
}

export const cache = new SimpleCache();
