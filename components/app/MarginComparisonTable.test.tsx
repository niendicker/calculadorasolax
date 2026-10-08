// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { buildMarginSummary } from './helpers';
import { MarginComparisonTable } from './MarginComparisonTable';
import type { DesiredFeatureId } from '@/lib/types';

function marginRows(desiredFeatures: DesiredFeatureId[]) {
  return buildMarginSummary({
      desiredFeatures,
      nominalW: 3000,
      peakW: 6000,
      dailyKwh: 3,
      whiteTariff: {
        requiredPowerW: 4000,
        pontaEnergyWh: 3000,
        intermediateEnergyWh: 0,
        pontaTariffPerKwh: 1.2,
        intermediateTariffPerKwh: 0.95,
        foraPontaTariffPerKwh: 0.7,
      },
      microgrid: { voltageV: 220, onGridPhases: 1, onGridApparentPowerVA: 8000, photoUrl: null, powerNoticeAcknowledged: false },
      pv: { monthlyConsumptionKwh: 400, hsp: 4.5 },
      solution: {
        inverterId: 'inv-1', inverterModel: 'inverter', inverterQty: 1,
        inverterRatedPowerW: 10000, inverterPeakPowerW: 12000,
        batteryId: 'bat-1', batteryModel: 'battery', batteryQty: 1,
        batteryPowerW: 10000, availableEnergyWh: 10000,
        pvPowerKw: 4.5, accessories: [],
      },
  });
}

describe('combined power requirements', () => {
  it('shows a dominant microgrid value as both power sources without repeating it for the battery', () => {
    const desiredFeatures: DesiredFeatureId[] = ['backup', 'white_tariff', 'microgrid'];
    render(<MarginComparisonTable rows={marginRows(desiredFeatures)} desiredFeatures={desiredFeatures} />);

    const combinedTable = within(screen.getByRole('region', { name: 'Requisitos combinados' })).getByRole('table');
    const standardHeader = within(combinedTable).getByRole('columnheader', { name: /Potência padrão/ });
    const maximumHeader = within(combinedTable).getByRole('columnheader', { name: /Potência máxima/ });
    expect(standardHeader).not.toHaveTextContent('Projeto');
    expect(maximumHeader).not.toHaveTextContent('Projeto');
    const inverterRow = within(combinedTable).getByRole('rowheader', { name: 'Inversor' }).closest('tr') as HTMLElement;
    const powerCells = within(inverterRow).getAllByRole('cell', { name: /Projeto 8 kVA/ });
    expect(within(powerCells[0]).getByText('8 kVA')).toHaveClass('bg-sky-500/10');
    expect(within(powerCells[1]).getByText('8 kVA')).toHaveClass('bg-amber-500/10');
    const batteryRow = within(combinedTable).getByRole('rowheader', { name: 'Bateria' }).closest('tr') as HTMLElement;
    expect(batteryRow).not.toHaveTextContent('Projeto');

    const microgridTable = within(screen.getByRole('region', { name: 'Microrrede' })).getByRole('table');
    const sourceValue = within(microgridTable).getByText('8 kVA');
    expect(sourceValue).toHaveClass('from-sky-500/10', 'to-amber-500/10');
    expect(within(microgridTable).getAllByText('Usado no requisito combinado:')).toHaveLength(1);
    expect(within(microgridTable).getByRole('rowheader', { name: 'Inversor' })).toBeInTheDocument();
    expect(within(microgridTable).getByRole('rowheader', { name: 'Bateria' })).toBeInTheDocument();
  });

  it.each<{ features: DesiredFeatureId[]; sourceSections: string[] }>([
    { features: ['backup'], sourceSections: ['Backup'] },
    { features: ['microgrid'], sourceSections: ['Microrrede'] },
    { features: ['white_tariff'], sourceSections: ['Tarifa Branca'] },
    { features: ['backup', 'microgrid'], sourceSections: ['Backup', 'Microrrede'] },
    { features: ['backup', 'white_tariff'], sourceSections: ['Backup', 'Tarifa Branca'] },
    { features: ['microgrid', 'white_tariff'], sourceSections: ['Microrrede', 'Tarifa Branca'] },
  ])('shows consolidated requirements and their active sources for $features', ({ features, sourceSections }) => {
    render(<MarginComparisonTable rows={marginRows(features)} desiredFeatures={features} />);
    expect(screen.getByRole('region', { name: 'Requisitos combinados' })).toBeInTheDocument();
    for (const name of sourceSections) expect(screen.getByRole('region', { name })).toBeInTheDocument();
  });

  it.each<{ features: DesiredFeatureId[] }>([
    { features: [] },
    { features: ['pv'] },
    { features: ['external_ats'] },
    { features: ['external_generator'] },
    { features: ['pv', 'external_ats', 'external_generator'] },
  ])('hides consolidated requirements when no power resource is active: $features', ({ features }) => {
    render(<MarginComparisonTable rows={marginRows(features)} desiredFeatures={features} />);
    expect(screen.queryByRole('region', { name: 'Requisitos combinados' })).not.toBeInTheDocument();
    if (features.includes('pv')) expect(screen.getByRole('region', { name: 'Fotovoltaico' })).toBeInTheDocument();
  });
});
