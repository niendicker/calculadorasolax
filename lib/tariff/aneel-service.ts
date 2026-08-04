import { normalizePeriodName, normalizeNumber, normalizeUnit } from './normalize';
import { cache } from './cache';

export interface CkanRecord {
  [key: string]: string | number | null;
}

export interface AneelTariffQuery {
  distributor: string;
  subgroup: string;
  tariffMode: string;
  consumerClass?: string;
  accessantAgent?: string;
  referenceDate: string;
}

export interface EnergyTariffResult {
  distributor: string;
  subgroup: string;
  tariffMode: string;
  consumerClass?: string;
  validFrom: string;
  validUntil?: string;
  source: 'ANEEL';
  fetchedAt: string;
  tariffs: {
    peak?: number;
    intermediate?: number;
    offPeak?: number;
    conventional?: number;
  };
}

const ANEEL_CKAN_API = 'https://dadosabertos.aneel.gov.br/api/3/action';
const DEFAULT_RESOURCE_ID = process.env.ANEEL_TARIFF_RESOURCE_ID || 'fcf2906c-7c32-4b9b-a637-054e7a5234f4';

interface CkanDatastoreRecord {
  _id: number;
  [key: string]: string | number | null;
}

interface CkanDatastoreResponse {
  success: boolean;
  result: {
    records: CkanDatastoreRecord[];
    total: number;
  };
}

export async function fetchTariffsFromAneel(query: AneelTariffQuery): Promise<EnergyTariffResult | null> {
  try {
    const records = await queryAneelDatastore();
    if (records.length === 0) return null;

    const updatedQuery = { ...query };
    if (!updatedQuery.referenceDate || updatedQuery.referenceDate === '') {
      updatedQuery.referenceDate = new Date().toISOString().split('T')[0];
    }

    const filtered = filterRecordsByQuery(records, updatedQuery);
    if (filtered.length === 0) return null;

    const selected = selectBestRecord(filtered);
    if (!selected) return null;

    return buildTariffResult(selected, updatedQuery);
  } catch (error) {
    console.error('[ANEEL] Error fetching tariffs:', error);
    return null;
  }
}

export async function getLatestTariffDate(): Promise<string | null> {
  try {
    const records = await queryAneelDatastore();
    if (records.length === 0) return null;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let hasValidDataToday = false;
    let latestValidDate: Date | null = null;

    for (const record of records) {
      const startField = findField(record, ['DatInicioVigencia', 'DtInicialVigencia', 'DataInicial', 'DATA_INICIAL']);
      const endField = findField(record, ['DatFimVigencia', 'DtFinalVigencia', 'DataFinal', 'DATA_FINAL']);

      if (!startField) continue;

      const startDateStr = String(record[startField]);
      const startDate = parseDate(startDateStr);

      if (!startDate || startDate > today) continue;

      let isValid = true;
      if (endField && record[endField]) {
        const endDateStr = String(record[endField]);
        const endDate = parseDate(endDateStr);
        if (endDate && endDate < today) {
          isValid = false;
        }
      }

      if (isValid) {
        hasValidDataToday = true;
        if (!latestValidDate || startDate > latestValidDate) {
          latestValidDate = startDate;
        }
      }
    }

    if (hasValidDataToday) {
      return today.toISOString().split('T')[0];
    }

    return latestValidDate ? latestValidDate.toISOString().split('T')[0] : null;
  } catch (error) {
    console.error('[ANEEL] Error fetching latest date:', error);
    return null;
  }
}

async function queryAneelDatastore(): Promise<CkanDatastoreRecord[]> {
  const cached = cache.getDataset();
  if (cached) {
    return cached;
  }

  const url = new URL(`${ANEEL_CKAN_API}/datastore_search`);
  url.searchParams.append('resource_id', DEFAULT_RESOURCE_ID);
  url.searchParams.append('limit', '10000');

  const response = await fetch(url.toString(), {
    cache: 'no-store',
    signal: AbortSignal.timeout(20_000),
  });

  if (!response.ok) {
    throw new Error(`ANEEL API responded with HTTP ${response.status}`);
  }

  const data: CkanDatastoreResponse = await response.json();
  if (!data.success || !data.result?.records) {
    throw new Error('Invalid ANEEL response structure');
  }

  const records = data.result.records;
  cache.setDataset(records);

  return records;
}

function filterRecordsByQuery(records: CkanDatastoreRecord[], query: AneelTariffQuery): CkanDatastoreRecord[] {
  const queryDate = new Date(query.referenceDate);

  return records.filter((record) => {
    const matches =
      matchesDistributor(record, query.distributor) &&
      matchesSubgroup(record, query.subgroup) &&
      matchesTariffMode(record, query.tariffMode);

    if (!matches) return false;

    if (query.accessantAgent && !matchesAccessantAgent(record, query.accessantAgent)) {
      return false;
    }

    if (query.consumerClass && !matchesConsumerClass(record, query.consumerClass)) {
      return false;
    }

    if (!isWithinValidity(record, queryDate)) {
      return false;
    }

    return true;
  });
}

function matchesDistributor(record: CkanDatastoreRecord, distributor: string): boolean {
  const field = findField(record, ['SigAgente', 'DsDistribuidora', 'Distribuidora', 'DISTRIBUIDORA']);
  if (!field) return false;

  const recordValue = String(record[field]).toLowerCase().trim();
  const queryValue = distributor.toLowerCase().trim();

  return recordValue === queryValue;
}

function matchesSubgroup(record: CkanDatastoreRecord, subgroup: string): boolean {
  const field = findField(record, ['DscSubGrupo', 'CdSubgrupo', 'Subgrupo', 'SUBGRUPO']);
  if (!field) return false;

  const recordValue = String(record[field]).toUpperCase().trim();
  const queryValue = subgroup.toUpperCase().trim();

  return recordValue === queryValue;
}

function matchesTariffMode(record: CkanDatastoreRecord, tariffMode: string): boolean {
  const field = findField(record, ['DscModalidadeTarifaria', 'DsModalidadeTarifaria', 'ModalidadeTarifaria', 'MODALIDADE']);
  if (!field) return false;

  const recordValue = String(record[field]).toLowerCase().trim();
  const queryValue = tariffMode.toLowerCase().trim();

  return recordValue === queryValue;
}

function matchesAccessantAgent(record: CkanDatastoreRecord, accessantAgent: string): boolean {
  const field = findField(record, ['SigAgenteAcessante', 'SignAccessantAgent', 'AGENTE_ACESSANTE']);
  if (!field) return false;

  const recordValue = String(record[field]).toUpperCase().trim();
  const queryValue = accessantAgent.toUpperCase().trim();

  return recordValue === queryValue;
}

function matchesConsumerClass(record: CkanDatastoreRecord, consumerClass: string): boolean {
  const field = findField(record, ['DsClasse', 'Classe', 'CLASSE']);
  if (!field) return false;

  const recordValue = String(record[field]).toLowerCase().trim();
  const queryValue = consumerClass.toLowerCase().trim();

  return recordValue.includes(queryValue) || queryValue.includes(recordValue);
}

function isWithinValidity(record: CkanDatastoreRecord, referenceDate: Date): boolean {
  const startField = findField(record, ['DatInicioVigencia', 'DtInicialVigencia', 'DataInicial', 'DATA_INICIAL']);
  if (!startField) return false;

  const startDateStr = String(record[startField]);
  const startDate = parseDate(startDateStr);
  if (!startDate || startDate > referenceDate) {
    return false;
  }

  const endField = findField(record, ['DatFimVigencia', 'DtFinalVigencia', 'DataFinal', 'DATA_FINAL']);
  if (endField) {
    const endDateStr = String(record[endField]);
    if (endDateStr && endDateStr !== '') {
      const endDate = parseDate(endDateStr);
      if (endDate && endDate < referenceDate) {
        return false;
      }
    }
  }

  return true;
}

function findField(record: CkanDatastoreRecord, possibleNames: string[]): string | null {
  for (const name of possibleNames) {
    if (name in record) return name;
  }

  const recordKeys = Object.keys(record);
  for (const key of recordKeys) {
    const lowerKey = key.toLowerCase();
    for (const name of possibleNames) {
      if (lowerKey === name.toLowerCase()) return key;
    }
  }

  return null;
}

function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null;

  const trimmed = String(dateStr).trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const date = new Date(trimmed + 'T00:00:00Z');
    return Number.isNaN(date.getTime()) ? null : date;
  }

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(trimmed)) {
    const [day, month, year] = trimmed.split('/');
    const date = new Date(`${year}-${month}-${day}T00:00:00Z`);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  return null;
}

function selectBestRecord(records: CkanDatastoreRecord[]): CkanDatastoreRecord | null {
  if (records.length === 0) return null;

  const sorted = [...records].sort((a, b) => {
    const aStartField = findField(a, ['DatInicioVigencia', 'DtInicialVigencia', 'DataInicial', 'DATA_INICIAL']);
    const bStartField = findField(b, ['DatInicioVigencia', 'DtInicialVigencia', 'DataInicial', 'DATA_INICIAL']);

    if (!aStartField || !bStartField) return 0;

    const aStart = parseDate(String(a[aStartField]));
    const bStart = parseDate(String(b[bStartField]));

    if (!aStart || !bStart) return 0;

    return bStart.getTime() - aStart.getTime();
  });

  return sorted[0];
}

function extractTariffs(record: CkanDatastoreRecord): Record<string, number | undefined> {
  const tariffs: Record<string, number | undefined> = {};

  const teField = findField(record, ['VlrTE', 'TE', 'TARIFA_ENERGIA']);
  const tusdField = findField(record, ['VlrTUSD', 'TUSD', 'TARIFA_USO']);
  const unitField = findField(record, ['DscUnidadeTerciaria', 'DsUnidade', 'Unidade', 'UNIDADE']);

  let teValue = 0;
  let tusdValue = 0;
  let unitStr = 'R$/kWh';

  if (teField && record[teField] !== null) {
    teValue = normalizeNumber(record[teField]);
  }
  if (tusdField && record[tusdField] !== null) {
    tusdValue = normalizeNumber(record[tusdField]);
  }
  if (unitField && record[unitField] !== null) {
    unitStr = String(record[unitField]);
  }

  const totalTariff = teValue + tusdValue;

  const normalized = normalizeUnit(totalTariff, unitStr);
  const tariffValue = normalized.value;
  const finalUnit = normalized.unit;

  if (finalUnit.toLowerCase() === 'r$/kwh') {
    const periodField = findField(record, ['NomPostoTarifario', 'DsPeriodoTarifario', 'Periodo', 'PERIODO']);
    if (periodField) {
      const periodName = String(record[periodField]);
      const period = normalizePeriodName(periodName);

      if (period) {
        tariffs[period] = tariffValue;
      }
    }
  }

  return tariffs;
}

function extractDate(record: CkanDatastoreRecord, possibleNames: string[]): string | null {
  const field = findField(record, possibleNames);
  if (!field) return null;

  const dateStr = String(record[field]);
  const date = parseDate(dateStr);

  if (date) {
    return date.toISOString().split('T')[0];
  }

  return null;
}

function buildTariffResult(record: CkanDatastoreRecord, query: AneelTariffQuery): EnergyTariffResult {
  const tariffs = extractTariffs(record);
  const validFrom = extractDate(record, ['DatInicioVigencia', 'DtInicialVigencia', 'DataInicial', 'DATA_INICIAL']) ?? query.referenceDate;
  const validUntil = extractDate(record, ['DatFimVigencia', 'DtFinalVigencia', 'DataFinal', 'DATA_FINAL']) || undefined;

  return {
    distributor: query.distributor,
    subgroup: query.subgroup,
    tariffMode: query.tariffMode,
    consumerClass: query.consumerClass,
    validFrom,
    validUntil,
    source: 'ANEEL',
    fetchedAt: new Date().toISOString(),
    tariffs,
  };
}
