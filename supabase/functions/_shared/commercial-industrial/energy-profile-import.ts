import { apparentKvaToActiveKw } from './ac-power.ts';
import { zonedTimeToUtcIso } from './manual-day-curve.ts';
import type { LoadCurve, LoadCurveResolutionMinutes } from './types.ts';

export type EnergyImportUnit = 'kW' | 'W' | 'MW' | 'kWh' | 'Wh' | 'MWh' | 'kVA' | 'VA' | 'MVA';
export interface EnergyImportTable { headers: string[]; rows: { cells: string[]; line: number }[]; decimalComma: boolean }
export interface EnergyImportMapping {
  /** Required for apparent-power source columns; ignored for active power/energy. */
  powerFactor?: number;
  timestamp: number;
  consumption: number | null;
  generation: number | null;
  consumptionUnit: EnergyImportUnit;
  generationUnit: EnergyImportUnit;
  resolutionMinutes: LoadCurveResolutionMinutes;
  timezone: string;
  timestampPosition?: 'start' | 'end';
}
export type EnergyImportResult = { ok: true; consumption: LoadCurve | null; generation: LoadCurve | null } | { ok: false; errors: string[] };

const normalized = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const dateHeaders = ['timestamp', 'datetime', 'date', 'data', 'datahora', 'dataehora', 'dateandtime', 'datum', 'datumzeit', 'time'];

/** Quoted delimiters, doubled quotes and UTF-8 BOM are common in simulator exports. */
function splitRow(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let cell = '', quoted = false;
  for (let index = 0; index < line.length; index++) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') { cell += '"'; index++; }
      else quoted = !quoted;
    } else if (char === delimiter && !quoted) { cells.push(cell.trim()); cell = ''; }
    else cell += char;
  }
  cells.push(cell.trim());
  return cells;
}

export function readEnergyImportTable(text: string): EnergyImportTable {
  const lines = text.replace(/^\uFEFF/, '').split(/\r\n|\n|\r/);
  let headerIndex = -1, delimiter = ',';
  for (let index = 0; index < lines.length; index++) {
    for (const separator of [';', ',', '\t']) {
      const cells = splitRow(lines[index], separator);
      if (cells.length >= 2 && cells.some((cell) => dateHeaders.includes(normalized(cell)))) {
        headerIndex = index; delimiter = separator; break;
      }
    }
    if (headerIndex >= 0) break;
  }
  if (headerIndex < 0) throw new Error('Não foi possível identificar o cabeçalho. Inclua uma coluna de data e hora (timestamp ou date).');
  const headers = splitRow(lines[headerIndex], delimiter);
  const rows = lines.slice(headerIndex + 1).map((line, index) => ({ cells: splitRow(line, delimiter), line: headerIndex + index + 2 }))
    .filter(({ cells }) => cells.some(Boolean));
  const dateIndex = headers.findIndex((value) => dateHeaders.includes(normalized(value)));
  // Skip only the simulator's optional units row; malformed data rows remain errors.
  if (rows.length && !/\d/.test(rows[0].cells[dateIndex] ?? '') && rows[0].cells.some((cell) => /^(kW|W|MW|kWh|Wh|MWh|kVA|VA|MVA)$/i.test(cell))) {
    headers.forEach((header, index) => { if (/^(kW|W|MW|kWh|Wh|MWh|kVA|VA|MVA)$/i.test(rows[0].cells[index] ?? '')) headers[index] = `${header} (${rows[0].cells[index]})`; });
    rows.shift();
  }
  return { headers, rows, decimalComma: delimiter !== ',' && rows.some(({ cells }) => cells.some((cell, index) => index !== dateIndex && /\d,\d/.test(cell))) };
}

export function suggestEnergyImportMapping(table: EnergyImportTable, timezone: string, defaultSeries: 'consumption' | 'generation' = 'consumption'): EnergyImportMapping {
  const names = table.headers.map(normalized);
  const find = (aliases: string[]) => { const index = names.findIndex((name) => aliases.some((alias) => name === alias || name === `${alias}kw` || name === `${alias}kwh` || name === `${alias}w` || name === `${alias}wh` || name === `${alias}mw` || name === `${alias}mwh` || name === `${alias}kva` || name === `${alias}va` || name === `${alias}mva`)); return index < 0 ? null : index; };
  let consumption = find(['consumption', 'consumo', 'load', 'carga', 'power', 'potencia', 'euser']);
  let generation = find(['generation', 'geracao', 'solar', 'pv', 'pvpower', 'pvgeneration', 'eavail', 'eoutinv']);
  if (defaultSeries === 'generation' && generation === null && consumption !== null && /^(power|potencia)(kw|kwh|w|wh|mw|mwh|kva|va|mva)?$/.test(names[consumption])) { generation = consumption; consumption = null; }
  const unit = (index: number | null): EnergyImportUnit => {
    const header = index === null ? '' : table.headers[index];
    const matched = header.match(/(MWh|kWh|Wh|MW|kW|W|MVA|kVA|VA)(?:\)|\]|\s)*$/i)?.[1].toLowerCase();
    return (['MWh', 'kWh', 'Wh', 'MW', 'kW', 'W', 'MVA', 'kVA', 'VA'].find((value) => value.toLowerCase() === matched) as EnergyImportUnit | undefined) ?? (index !== null && /^(euser|eavail|eoutinv)/.test(names[index]) ? 'kWh' : 'kW');
  };
  const timestamp = names.findIndex((name) => dateHeaders.includes(name));
  let resolutionMinutes: LoadCurveResolutionMinutes = 15;
  if (table.rows.length >= 2) {
    try {
      const diff = (Date.parse(parseEnergyTimestamp(table.rows[1].cells[timestamp], timezone)) - Date.parse(parseEnergyTimestamp(table.rows[0].cells[timestamp], timezone))) / 60000;
      if (diff === 15 || diff === 30 || diff === 60) resolutionMinutes = diff;
    } catch { /* Mapping preview reports the invalid date. */ }
  }
  return { timestamp, consumption, generation, consumptionUnit: unit(consumption), generationUnit: unit(generation), resolutionMinutes, timezone, timestampPosition: 'start' };
}

/** Dates without offsets use the explicitly chosen IANA timezone, never the browser timezone. */
export function parseEnergyTimestamp(value: string, timezone: string): string {
  const raw = value.trim();
  if (/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw)) {
    if (Number.isNaN(Date.parse(raw))) throw new Error('Data e hora inválidas.');
    return new Date(raw).toISOString();
  }
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{1,2}):(\d{2})(?::00)?$/);
  const local = raw.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{2}|\d{4})[ T]+(\d{1,2}):(\d{2})(?::00)?$/);
  if (!iso && !local) throw new Error('Use data/hora ISO ou DD/MM/AAAA HH:mm.');
  const year = iso ? Number(iso[1]) : Number(local![3]) + (local![3].length === 2 ? Number(local![3]) >= 70 ? 1900 : 2000 : 0);
  const month = Number(iso?.[2] ?? local![2]);
  const day = Number(iso?.[3] ?? local![1]);
  const hour = Number(iso?.[4] ?? local![4]);
  const minute = Number(iso?.[5] ?? local![5]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day || hour > 24 || minute > 59 || hour === 24 && minute !== 0) throw new Error('Data e hora inválidas.');
  return zonedTimeToUtcIso(date.toISOString().slice(0, 10), hour, minute, timezone);
}

export function importEnergyProfiles(table: EnergyImportTable, mapping: EnergyImportMapping): EnergyImportResult {
  const errors: string[] = [];
  if (mapping.consumption === null && mapping.generation === null) return { ok: false, errors: ['Selecione ao menos uma coluna de consumo ou geração.'] };
  if (mapping.consumption !== null && mapping.consumption === mapping.generation) return { ok: false, errors: ['Consumo e geração devem usar colunas diferentes.'] };
  if ([mapping.consumption, mapping.generation].includes(mapping.timestamp)) return { ok: false, errors: ['A coluna de data e hora deve ser diferente das colunas de valores.'] };
  if (![15, 30, 60].includes(mapping.resolutionMinutes)) return { ok: false, errors: ['Use intervalos de 15, 30 ou 60 minutos (mínimo de 15 minutos).'] };
  if (!table.rows.length) return { ok: false, errors: ['O arquivo não contém medições.'] };
  const power = (raw: string, unit: EnergyImportUnit) => {
    const text = table.decimalComma ? raw.replace(/\./g, '').replace(',', '.') : raw;
    const value = Number(text);
    if (!text || !Number.isFinite(value) || value < 0) throw new Error('Informe valores numéricos não negativos.');
    const factor = unit.startsWith('M') ? 1000 : unit.startsWith('k') ? 1 : 0.001;
    if (unit.endsWith('VA')) return apparentKvaToActiveKw(value * factor, mapping.powerFactor ?? NaN);
    return value * factor / (unit.endsWith('h') ? mapping.resolutionMinutes / 60 : 1);
  };
  const rows: { timestamp: string; consumption?: number; generation?: number }[] = [];
  for (const row of table.rows) {
    try {
      const timestamp = new Date(Date.parse(parseEnergyTimestamp(row.cells[mapping.timestamp] ?? '', mapping.timezone)) - (mapping.timestampPosition === 'end' ? mapping.resolutionMinutes * 60000 : 0)).toISOString();
      rows.push({ timestamp,
        consumption: mapping.consumption === null ? undefined : power(row.cells[mapping.consumption] ?? '', mapping.consumptionUnit),
        generation: mapping.generation === null ? undefined : power(row.cells[mapping.generation] ?? '', mapping.generationUnit),
      });
    } catch (error) { errors.push(`Linha ${row.line}: ${error instanceof Error ? error.message : 'Dados inválidos.'}`); }
  }
  if (errors.length) return { ok: false, errors: errors.slice(0, 8) };
  rows.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const interval = mapping.resolutionMinutes * 60000;
  if (Date.parse(rows.at(-1)!.timestamp) - Date.parse(rows[0].timestamp) + interval > 7 * 86400000 || rows.length > 7 * 1440 / mapping.resolutionMinutes) errors.push('Importe no máximo 7 dias de dados. O arquivo não foi truncado.');
  for (let index = 1; index < rows.length; index++) {
    const difference = Date.parse(rows[index].timestamp) - Date.parse(rows[index - 1].timestamp);
    if (difference !== interval) { errors.push(difference < 15 * 60000 ? 'O intervalo mínimo é de 15 minutos; remova duplicatas ou exporte outra resolução.' : 'As medições devem ser contínuas e respeitar o intervalo selecionado, sem lacunas.'); break; }
  }
  if (errors.length) return { ok: false, errors };
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: mapping.timezone, year: 'numeric', month: '2-digit', day: '2-digit' });
  const localDate = (timestamp: string) => {
    const parts = formatter.formatToParts(new Date(timestamp));
    return ['year', 'month', 'day'].map((type) => parts.find((part) => part.type === type)!.value).join('-');
  };
  const periodStart = localDate(rows[0].timestamp), periodEnd = localDate(rows.at(-1)!.timestamp);
  const curve = (kind: 'consumption' | 'generation'): LoadCurve | null => mapping[kind] === null ? null : ({
    points: rows.map((row) => ({ timestamp: row.timestamp, powerKw: row[kind]! })),
    resolutionMinutes: mapping.resolutionMinutes, timezone: mapping.timezone, profileBasis: 'representative_period', periodStart, periodEnd, source: 'csv',
  });
  return { ok: true, consumption: curve('consumption'), generation: curve('generation') };
}
