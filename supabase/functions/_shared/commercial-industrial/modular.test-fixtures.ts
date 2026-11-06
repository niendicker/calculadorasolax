import type { CiModularCatalog, CiModularSelection } from './modular-types';
import type { CommercialIndustrialOptions } from './types';

/** Synthetic specifications for verification; these are not approved commercial equipment. */
export function modularFixture(): CiModularCatalog {
  return {
    pcs: [{ inverter_id: '10000000-0000-0000-0000-000000000001', model: 'PCS teste 100', active: true, charge_power_kw: 80, discharge_power_kw: 100, charge_current_a: 200, discharge_current_a: 200, max_parallel_units: 2, supports_backup: true, voltageMinV: 600, voltageMaxV: 1000, chargeEfficiencyPercent: 96, dischargeEfficiencyPercent: 95 }],
    batteries: [{ battery_id: '20000000-0000-0000-0000-000000000001', model: 'Rack teste 100', active: true, unit_kind: 'rack', capacityKwh: 100, charge_power_kw: 50, discharge_power_kw: 80, charge_current_a: 100, discharge_current_a: 150, soc_max_percent: 95, socMinPercent: 10, voltageMinV: 400, voltageMaxV: 480, roundTripEfficiencyPercent: 98 }],
    rules: [{ id: '30000000-0000-0000-0000-000000000001', name: 'Composição de teste', pcs_id: '10000000-0000-0000-0000-000000000001', battery_id: '20000000-0000-0000-0000-000000000001', active: true, approval_status: 'approved', min_series: 2, max_series: 2, min_parallel_strings: 1, max_parallel_strings: 2, min_pcs: 1, max_pcs: 2, supports_backup: true, communication_profile: 'Perfil de teste', pcs_firmware: 'Teste PCS v1', battery_firmware: 'Teste BMS v1', reference_document: 'Documento sintético de teste', revision: 'Teste 1', controller_accessory_id: null, controller_quantity_per_pcs: 1, notes: '' }], accessories: [],
  };
}
export function modularSelection(catalog = modularFixture()): CiModularSelection {
  return { kind: 'modular', compatibilityId: catalog.rules[0].id, mode: 'auto', pcs: { min: 1, max: 2 }, series: { min: 2, max: 2 }, parallel: { min: 1, max: 2 } };
}
export function modularOptions(): CommercialIndustrialOptions {
  return {
    bessProductId: null, bessSystem: modularSelection(), strategy: 'LOAD_SHIFTING', rankingCriterion: 'PAYBACK', sizing: { mode: 'fixed', moduleCount: 1, minModules: null, maxModules: null },
    loadCurve: { points: Array.from({ length: 672 }, (_, index) => ({ timestamp: new Date(Date.UTC(2026, 0, 1, 3, index * 15)).toISOString(), powerKw: 100 })), resolutionMinutes: 15, timezone: 'America/Sao_Paulo', profileBasis: 'representative_period', source: 'csv', periodStart: '2026-01-01', periodEnd: '2026-01-07' },
    tariff: { energyRatePeakBrlPerMwh: 1200, energyRateOffPeakBrlPerMwh: 400, demandRateBrlPerKwMonth: 30, contractedDemandKw: 300, peakStart: '18:00', peakEnd: '21:00', tariffModality: 'verde', market: 'cativo', icmsPercent: 0, pisCofinsPercent: 0 },
    financialAssumptions: { analysisHorizonYears: 10, discountRatePercent: 12, annualEnergyInflationPercent: 0, monthsPerYear: 12 },
  };
}
