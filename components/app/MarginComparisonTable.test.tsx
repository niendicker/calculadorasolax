// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { buildMarginSummary } from './helpers';
import { MarginComparisonTable } from './MarginComparisonTable';
import type { DesiredFeatureId } from '@/lib/types';

describe('combined power requirements', () => {
  it('shows a dominant microgrid value as both power sources without repeating it for the battery', () => {
    const desiredFeatures: DesiredFeatureId[] = ['backup', 'white_tariff', 'microgrid'];
    const rows = buildMarginSummary({
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
      pv: null,
      solution: {
        inverterId: 'inv-1', inverterModel: 'inverter', inverterQty: 1,
        inverterRatedPowerW: 10000, inverterPeakPowerW: 12000,
        batteryId: 'bat-1', batteryModel: 'battery', batteryQty: 1,
        batteryPowerW: 10000, availableEnergyWh: 10000,
        pvPowerKw: null, accessories: [],
      },
    });
    render(<MarginComparisonTable rows={rows} desiredFeatures={desiredFeatures} />);

    const combinedTable = within(screen.getByRole('region', { name: 'Requisitos combinados' })).getByRole('table');
    const standardHeader = within(combinedTable).getByRole('columnheader', { name: /Potência padrão/ });
    const maximumHeader = within(combinedTable).getByRole('columnheader', { name: /Potência máxima/ });
    expect(within(standardHeader).getByText('8 kVA')).toHaveClass('bg-sky-500/10');
    expect(within(maximumHeader).getByText('8 kVA')).toHaveClass('bg-amber-500/10');

    const microgridTable = within(screen.getByRole('region', { name: 'Microrrede' })).getByRole('table');
    const sourceValue = within(microgridTable).getByText('8 kVA');
    expect(sourceValue).toHaveClass('from-sky-500/10', 'to-amber-500/10');
    expect(within(microgridTable).getAllByText('Usado no requisito combinado:')).toHaveLength(1);
    expect(within(microgridTable).getByRole('rowheader', { name: 'Inversor' })).toBeInTheDocument();
    expect(within(microgridTable).getByRole('rowheader', { name: 'Bateria' })).toBeInTheDocument();
  });
});
