import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CkanDatastoreRecord } from '@/lib/tariff/aneel-service';
import { GET as getDistributors } from './distributors/route';
import { GET as getAccessantAgents } from './accessant-agents/route';

const fetchDatasetMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/tariff/aneel-service', () => ({ fetchAneelDataset: fetchDatasetMock }));

function record(overrides: Record<string, string | number | null> = {}): CkanDatastoreRecord {
  return {
    _id: 1,
    SigAgente: 'Distribuidora A',
    SigAgenteAcessante: 'Consumidor 1',
    ...overrides,
  };
}

beforeEach(() => {
  fetchDatasetMock.mockReset();
});

describe('tariff catalog routes', () => {
  it('returns sorted unique distributors using alternate field casing', async () => {
    fetchDatasetMock.mockResolvedValue([
      record({ _id: 1, SigAgente: 'Zeta' }),
      record({ _id: 2, DsDistribuidora: 'Alfa', SigAgente: null }),
      record({ _id: 3, SigAgente: 'Zeta' }),
    ]);

    const response = await getDistributors();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ distributors: ['Alfa', 'Zeta'] });
    expect(fetchDatasetMock).toHaveBeenCalledOnce();
  });

  it('returns a gateway error when distributor data cannot be loaded', async () => {
    fetchDatasetMock.mockRejectedValue(new Error('ANEEL unavailable'));

    const response = await getDistributors();

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'Erro ao consultar distribuidoras da ANEEL' });
  });

  it('requires a distributor before querying accessant agents', async () => {
    const response = await getAccessantAgents(new Request('https://example.test/api/tariffs/accessant-agents'));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Parâmetro obrigatório: distributor' });
    expect(fetchDatasetMock).not.toHaveBeenCalled();
  });

  it('filters generators and non-applicable accessants and sorts the result', async () => {
    fetchDatasetMock.mockResolvedValue([
      record({ _id: 1, SigAgente: 'Distribuidora A', SigAgenteAcessante: 'Zeta' }),
      record({ _id: 2, SigAgente: 'distribuidora a', SigAgenteAcessante: 'Alpha' }),
      record({ _id: 3, SigAgente: 'Distribuidora A', SigAgenteAcessante: 'UFV Solar' }),
      record({ _id: 4, SigAgente: 'Distribuidora A', SigAgenteAcessante: 'Não se aplica' }),
      record({ _id: 5, SigAgente: 'Outra', SigAgenteAcessante: 'Beta' }),
      record({ _id: 6, SigAgente: 'Distribuidora A', SigAgenteAcessante: 'Zeta' }),
    ]);

    const response = await getAccessantAgents(
      new Request('https://example.test/api/tariffs/accessant-agents?distributor=distribuidora%20a')
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ accessantAgents: ['Alpha', 'Zeta'] });
  });

  it('returns a gateway error when accessant data cannot be loaded', async () => {
    fetchDatasetMock.mockRejectedValue(new Error('ANEEL unavailable'));

    const response = await getAccessantAgents(new Request('https://example.test/api/tariffs/accessant-agents?distributor=A'));

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'Erro ao consultar agentes acessantes' });
  });
});
