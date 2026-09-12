import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchTariffsFromAneel, getLatestTariffDate } from './aneel-service';
import { cache } from './cache';

type TestRecord = Record<string, string | number | null>;

function makeRecord(overrides: TestRecord = {}): TestRecord {
  return {
    _id: 1,
    SigAgente: 'Distribuidora Teste',
    DscSubGrupo: 'B1',
    DscModalidadeTarifaria: 'Branca',
    DsClasse: 'Residencial',
    DatInicioVigencia: '2025-01-01',
    DatFimVigencia: '2026-12-31',
    VlrTE: '0,30',
    VlrTUSD: 0.2,
    DscUnidadeTerciaria: 'R$/kWh',
    NomPostoTarifario: 'Ponta',
    ...overrides,
  };
}

function mockAneelResponse(records: TestRecord[], ok = true) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok,
      status: ok ? 200 : 503,
      json: async () => ({ success: ok, result: { records, total: records.length } }),
    })
  );
}

const query = {
  distributor: 'distribuidora teste',
  subgroup: 'b1',
  tariffMode: 'branca',
  consumerClass: 'residencial',
  referenceDate: '2026-01-15',
};

beforeEach(() => {
  cache.clear();
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ANEEL tariff service', () => {
  it('fetches, filters and normalizes a matching tariff record', async () => {
    mockAneelResponse([
      makeRecord({
        VlrTE: '100',
        VlrTUSD: '50',
        DscUnidadeTerciaria: 'R$/MWh',
        NomPostoTarifario: 'Ponta',
      }),
      makeRecord({ _id: 2, DscSubGrupo: 'A4' }),
      makeRecord({ _id: 3, DatInicioVigencia: '2027-01-01' }),
    ]);

    const result = await fetchTariffsFromAneel(query);

    expect(result).toEqual(expect.objectContaining({
      distributor: 'distribuidora teste',
      subgroup: 'b1',
      tariffMode: 'branca',
      consumerClass: 'residencial',
      validFrom: '2025-01-01',
      validUntil: '2026-12-31',
      source: 'ANEEL',
    }));
    expect(result?.tariffs).toEqual({ peak: 0.15 });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(String(vi.mocked(fetch).mock.calls[0]?.[0])).toContain('datastore_search');
  });

  it('honors accessant-agent and consumer-class filters and supports alternate field names', async () => {
    const alternateRecord = makeRecord({
      Distribuidora: 'Distribuidora Teste',
      CdSubgrupo: 'B1',
      Modalidade: 'Branca',
      Classe: 'Industrial de baixa tensão',
      AGENTE_ACESSANTE: 'Rede Teste',
      DsPeriodoTarifario: 'Fora de ponta',
      VlrTE: 0.4,
      VlrTUSD: 0.1,
      DscUnidadeTerciaria: 'R$/kWh',
    });
    delete alternateRecord.SigAgente;
    delete alternateRecord.DscSubGrupo;
    delete alternateRecord.DscModalidadeTarifaria;
    delete alternateRecord.DsClasse;
    delete alternateRecord.NomPostoTarifario;

    mockAneelResponse([
      alternateRecord,
      makeRecord({ _id: 2, AGENTE_ACESSANTE: 'Outra Rede' }),
    ]);

    const result = await fetchTariffsFromAneel({
      ...query,
      consumerClass: 'industrial',
      accessantAgent: 'rede teste',
    });

    expect(result?.tariffs).toEqual({ offPeak: 0.5 });
  });

  it('returns null when the query has no valid match', async () => {
    mockAneelResponse([makeRecord({ DatInicioVigencia: '2027-01-01' })]);

    await expect(fetchTariffsFromAneel(query)).resolves.toBeNull();
  });

  it('uses the dataset cache and avoids a second ANEEL request', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, result: { records: [makeRecord()], total: 1 } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await fetchTariffsFromAneel(query);
    await fetchTariffsFromAneel({ ...query, referenceDate: '2026-02-01' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns null and logs when ANEEL responds with an error or invalid data', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mockAneelResponse([], false);

    await expect(fetchTariffsFromAneel(query)).resolves.toBeNull();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('[ANEEL] Error fetching tariffs:'), expect.any(Error));

    errorSpy.mockClear();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: false, result: null }),
    }));
    await expect(getLatestTariffDate()).resolves.toBeNull();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('[ANEEL] Error fetching latest date:'), expect.any(Error));
  });

  it('returns today when the dataset contains a currently valid tariff', async () => {
    mockAneelResponse([makeRecord({ DatInicioVigencia: '2020-01-01', DatFimVigencia: '2099-12-31' })]);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    await expect(getLatestTariffDate()).resolves.toBe(today.toISOString().split('T')[0]);
  });

  it('falls back to null when ANEEL cannot be queried for the latest date', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

    await expect(getLatestTariffDate()).resolves.toBeNull();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('[ANEEL] Error fetching latest date:'), expect.any(Error));
  });
});
