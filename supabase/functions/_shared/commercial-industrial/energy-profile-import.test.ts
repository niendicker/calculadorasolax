import { describe, expect, it } from 'vitest';
import { importEnergyProfiles, parseEnergyTimestamp, readEnergyImportTable, suggestEnergyImportMapping, type EnergyImportMapping } from './energy-profile-import';

function parse(text: string, overrides: Partial<EnergyImportMapping> = {}) {
  const table = readEnergyImportTable(text);
  return importEnergyProfiles(table, { ...suggestEnergyImportMapping(table, 'America/Sao_Paulo'), ...overrides });
}

describe('energy profile imports', () => {
  it('imports simultaneous consumption and generation without subtracting generation from gross load', () => {
    const result = parse('timestamp,consumptionKw,generationKw\n2026-01-01T12:00:00-03:00,100,60\n2026-01-01T12:15:00-03:00,120,70');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.consumption?.points.map((point) => point.powerKw)).toEqual([100, 120]);
    expect(result.generation?.points.map((point) => point.powerKw)).toEqual([60, 70]);
    expect(result.generation?.points.map((point) => point.timestamp)).toEqual(result.consumption?.points.map((point) => point.timestamp));
    expect(result.consumption?.periodStart).toBe('2026-01-01');
  });

  it('recognizes simulator metadata, quoted fields, units and decimal commas', () => {
    const result = parse('\uFEFFPVsyst simulation export\nProject;Alfa\n"date";"E_User";"E_Avail"\n;"kWh";"kWh"\n"01/01/26 12:00";"25,0";"12,5"\n"01/01/26 12:15";"30,0";"15,0"');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.consumption?.points[0]).toEqual({ timestamp: '2026-01-01T15:00:00.000Z', powerKw: 100 });
    expect(result.generation?.points[0].powerKw).toBe(50);
  });

  it('preserves dot decimals in semicolon-separated files', () => {
    const result = parse('timestamp;powerKw\n2026-01-01T00:00:00Z;12.5\n2026-01-01T00:30:00Z;13.5');
    expect(result.ok && result.consumption?.points[0].powerKw).toBe(12.5);
    expect(result.ok && result.consumption?.resolutionMinutes).toBe(30);
  });

  it.each([['W', 1000, 1], ['MW', 1, 1000], ['kWh', 25, 100], ['Wh', 25000, 100], ['MWh', 0.025, 100]] as const)('converts %s to average kW at 15 minutes', (unit, value, expected) => {
    const result = parse(`timestamp,powerKw\n2026-01-01T00:00:00Z,${value}`, { consumptionUnit: unit });
    expect(result.ok && result.consumption?.points[0].powerKw).toBe(expected);
  });

  it('accepts exactly seven full days of 15-minute data', () => {
    const rows = Array.from({ length: 672 }, (_, index) => `${new Date(Date.UTC(2026, 0, 1, 3, index * 15)).toISOString()},10,5`);
    const result = parse(['timestamp,consumptionKw,generationKw', ...rows].join('\n'));
    expect(result.ok && result.consumption?.points.length).toBe(672);
    expect(result.ok && result.generation?.periodEnd).toBe('2026-01-07');
  });

  it('rejects eight days even when the point count is below 672', () => {
    const rows = Array.from({ length: 192 }, (_, index) => `${new Date(Date.UTC(2026, 0, 1, 3 + index)).toISOString()},10`);
    const result = parse(['timestamp,powerKw', ...rows].join('\n'));
    expect(result.ok).toBe(false);
    expect(!result.ok && result.errors.join(' ')).toContain('7 dias');
  });

  it.each([1, 5, 10])('rejects intervals of %i minutes instead of silently reinterpreting them', (minutes) => {
    const result = parse(`timestamp,powerKw\n2026-01-01T00:00:00Z,10\n2026-01-01T00:${String(minutes).padStart(2, '0')}:00Z,20`);
    expect(!result.ok && result.errors.join(' ')).toContain('mínimo');
  });

  it('rejects gaps and duplicate intervals', () => {
    for (const timestamp of ['2026-01-01T01:00:00Z', '2026-01-01T00:00:00Z']) {
      const result = parse(`timestamp,powerKw\n2026-01-01T00:00:00Z,10\n${timestamp},20`, { resolutionMinutes: 15 });
      expect(result.ok).toBe(false);
    }
  });

  it('supports generation-only input without manufacturing consumption', () => {
    const result = parse('timestamp,generationKw\n2026-01-01T12:00:00-03:00,50');
    expect(result.ok && result.consumption).toBeNull();
    expect(result.ok && result.generation?.points[0].powerKw).toBe(50);
  });

  it('rejects an invalid value in either series atomically', () => {
    const result = parse('timestamp,consumptionKw,generationKw\n2026-01-01T12:00:00Z,50,-1');
    expect(result.ok).toBe(false);
    expect(!result.ok && result.errors[0]).toContain('Linha 2');
  });

  it('uses the selected timezone for dates without offsets and shifts interval-end timestamps', () => {
    expect(parseEnergyTimestamp('01/01/2026 12:15', 'America/Manaus')).toBe('2026-01-01T16:15:00.000Z');
    const result = parse('timestamp,powerKw\n01/01/2026 12:15,10', { timestampPosition: 'end' });
    expect(result.ok && result.consumption?.points[0].timestamp).toBe('2026-01-01T15:00:00.000Z');
  });

  it('does not mistake grid injection for total PV generation', () => {
    const table = readEnergyImportTable('date,E_Grid\n01/01/26 12:00,20');
    expect(suggestEnergyImportMapping(table, 'America/Sao_Paulo').generation).toBeNull();
  });

  it('rejects impossible dates and ambiguous identical columns', () => {
    expect(() => parseEnergyTimestamp('31/02/2026 12:00', 'America/Sao_Paulo')).toThrow();
    const result = parse('timestamp,powerKw\n2026-01-01T12:00:00Z,50', { generation: 1 });
    expect(!result.ok && result.errors[0]).toContain('diferentes');
  });
});


describe('rolling periods and unit suffixes', () => {
  it('accepts 168 hours starting at midday even when the period touches eight calendar dates', () => {
    const rows = Array.from({ length: 672 }, (_, index) => `${new Date(Date.UTC(2026, 0, 1, 15, index * 15)).toISOString()},10`);
    expect(parse(['timestamp,powerKw', ...rows].join('\n')).ok).toBe(true);
  });

  it('detects energy and power units from column-name suffixes', () => {
    const result = parse('timestamp,consumptionW,generationWh\n2026-01-01T12:00:00Z,1000,250');
    expect(result.ok && result.consumption?.points[0].powerKw).toBe(1);
    expect(result.ok && result.generation?.points[0].powerKw).toBe(1);
  });
});

it('imports apparent power using explicit FP while preserving active energy sources', () => {
  const table = readEnergyImportTable('timestamp,powerKva\n2026-01-01T00:00:00Z,100\n2026-01-01T01:00:00Z,100');
  const mapping = suggestEnergyImportMapping(table, 'UTC');
  expect(mapping.consumptionUnit).toBe('kVA');
  const result = importEnergyProfiles(table, { ...mapping, powerFactor: 0.8 });
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.consumption!.points.map(point => point.powerKw)).toEqual([80, 80]);
  expect(result.consumption!.points.reduce((sum, point) => sum + point.powerKw * result.consumption!.resolutionMinutes / 60, 0)).toBe(160);
  expect(importEnergyProfiles(table, mapping).ok).toBe(false);
  const active = importEnergyProfiles(table, { ...mapping, consumptionUnit: 'kWh', powerFactor: 0.8 });
  expect(active.ok && active.consumption!.points[0].powerKw).toBe(100);
});
