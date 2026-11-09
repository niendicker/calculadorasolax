import { describe, expect, it } from 'vitest';
import { DEFAULT_CI_SOLAR_CONFIG, type CiSolarConfig, type LoadCurve } from '@/supabase/functions/_shared/commercial-industrial/types';
import { importEnergyProfiles, readEnergyImportTable, suggestEnergyImportMapping } from '@/supabase/functions/_shared/commercial-industrial/energy-profile-import';
import { exportEnergyCurveCsv } from './ci-energy-csv';

function consumption(resolutionMinutes: 15 | 30 | 60 = 15): LoadCurve {
  return { source: 'csv', profileBasis: 'representative_period', timezone: 'America/Manaus', resolutionMinutes, periodStart: '2026-11-09', periodEnd: '2026-11-09', points: [
    { timestamp: '2026-11-09T16:00:00.000Z', powerKw: 80 },
    { timestamp: new Date(Date.parse('2026-11-09T16:00:00Z') + resolutionMinutes * 60000).toISOString(), powerKw: 40 },
  ] };
}
function solar(load: LoadCurve): CiSolarConfig {
  return { ...DEFAULT_CI_SOLAR_CONFIG, enabled: true, generationCurve: { ...load, points: load.points.map((point, index) => ({ ...point, powerKw: index ? 0 : 24 })) } };
}

describe('energy CSV export', () => {
  it.each([15, 30, 60] as const)('reimports consumption and PV at %i minutes with the same FP and timestamps', resolution => {
    const load = consumption(resolution);
    const pv = solar(load);
    const csv = exportEnergyCurveCsv(load, 0.8, pv);
    expect(csv.split('\n')[0]).toBe('timestamp,consumptionKva,generationKva');
    expect(csv.split('\n')[1]).toBe('2026-11-09T16:00:00.000Z,100,30');
    const table = readEnergyImportTable(csv);
    const mapping = suggestEnergyImportMapping(table, load.timezone);
    expect(mapping).toMatchObject({ consumption: 1, generation: 2, consumptionUnit: 'kVA', generationUnit: 'kVA', resolutionMinutes: resolution });
    const result = importEnergyProfiles(table, { ...mapping, powerFactor: 0.8 });
    expect(result.ok).toBe(true);
    if (!result.ok) throw Error(result.errors.join('\n'));
    expect(result.consumption).toEqual(load);
    expect(result.generation).toEqual(pv.generationCurve);
  });

  it('omits the PV column when PV is disabled, even if previous generation is stored', () => {
    const load = consumption();
    const csv = exportEnergyCurveCsv(load, 0.8, { ...solar(load), enabled: false });
    expect(csv).toBe(`timestamp,consumptionKva\n${load.points[0].timestamp},100\n${load.points[1].timestamp},50`);
  });

  it('matches imported PV by instant instead of array index and preserves missing values as blanks', () => {
    const load = consumption();
    const pv = solar(load);
    pv.generationCurve!.points = [{ timestamp: '2026-11-09T12:15:00-04:00', powerKw: 16 }];
    const rows = exportEnergyCurveCsv(load, 0.8, pv).split('\n');
    expect(rows[1]).toBe(`${load.points[0].timestamp},100,`);
    expect(rows[2]).toBe(`${load.points[1].timestamp},50,20`);
  });

  it('exports edited manual PV averaged to the consumption resolution', () => {
    const load = consumption(30);
    const weekdayKw = Array(96).fill(0);
    weekdayKw.splice(48, 4, 8, 24, 40, 56);
    const pv = { ...solar(load), generationCurve: { ...load, source: 'manual' as const, points: [], manualConfig: { weekdayKw, weekendKw: Array(96).fill(0), presetId: 'custom' } } };
    const rows = exportEnergyCurveCsv(load, 0.8, pv).split('\n');
    expect(rows[1]).toBe(`${load.points[0].timestamp},100,20`);
    expect(rows[2]).toBe(`${load.points[1].timestamp},50,60`);
  });

  it('includes estimated PV and legacy generation values using the project FP', () => {
    const load = consumption();
    const estimated = { ...DEFAULT_CI_SOLAR_CONFIG, enabled: true, installedPowerKwp: 100, inverterPowerKw: 100 };
    const table = readEnergyImportTable(exportEnergyCurveCsv(load, 0.8, estimated));
    expect(Number(table.rows[0].cells[2])).toBeGreaterThan(0);
    const csv = exportEnergyCurveCsv(load, 0.8, { ...estimated, generationPoints: [24, 0] });
    expect(csv.split('\n')[1]).toBe(`${load.points[0].timestamp},100,30`);
    expect(csv.split('\n')[2]).toBe(`${load.points[1].timestamp},50,0`);
  });
});
