// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';
import ptMessages from '@/messages/pt.json';
import type { ProjectInfo, ResidentialOptions } from '@/lib/types';
import { ProjectWorkspace } from './ProjectWorkspace';

const projectInfo: ProjectInfo = {
  name: 'Residência Silva',
  clientId: 'client-1',
  address: { postalCode: '', street: '', number: '', complement: '', district: '', city: '', state: '' },
  notes: '',
};

const residentialOptions: ResidentialOptions = {
  topology: 'HighVoltage',
  batteryModel: 'T-BAT H 5.8 V2',
  secondaryBatteryModel: null,
  inverterModel: null,
  minInverterQty: null,
  gridType: 'threePhase_380',
  loads: [{ id: 'load-1', name: 'Geladeira', powerW: 180, qty: 1, ipInRatio: 3, phaseType: 'mono', phase: 'L1' }],
  peakCalcMode: 'sum',
  operationHours: 2,
  desiredFeatures: ['backup', 'white_tariff'],
  whiteTariff: null,
  microgrid: null,
  generator: null,
  pv: null,
  atsPhotoUrl: null,
  atsBackupAcknowledged: false,
  maxPowerPerPhaseW: null,
};

const inverterCatalog = [{
  id: 'inverter-1', model: 'X3-ULT-30K', topology: 'HV' as const, phases: 3,
  standardPowerKva: 30, peakPowerKva: 36, maxPowerPerPhaseW: null, imageUrl: null, documents: [], flags: [],
}];

describe('ProjectWorkspace', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/pt');
  });

  function renderWorkspace() {
    return render(
      <NextIntlClientProvider locale="pt" messages={ptMessages}>
        <ProjectWorkspace
        projectInfo={projectInfo}
        client={{ id: 'client-1', name: 'Marcelo Grande', email: '', phone: '', document: '', notes: '', createdAt: '', updatedAt: '' }}
        residentialOptions={residentialOptions}
        solution={null}
        nominalW={180}
        peakW={540}
        dailyKwh={0.36}
        solutionIsStale={false}
        inverterCatalog={inverterCatalog}
        availableInverterModels={null}
      >
        <div>Fluxo técnico atual</div>
        </ProjectWorkspace>
      </NextIntlClientProvider>
    );
  }

  it('shows the project overview and real resource status', () => {
    renderWorkspace();

    expect(screen.getByRole('heading', { name: 'Residência Silva' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cargas' })).toBeInTheDocument();
    expect(screen.getAllByText('Requer atenção').length).toBeGreaterThan(0);
  });

  it('switches sections and keeps the technical flow available', () => {
    renderWorkspace();

    fireEvent.click(screen.getByRole('button', { name: /^Cargas$/ }));

    expect(screen.getByRole('heading', { name: 'Cargas' })).toBeInTheDocument();
    expect(screen.getByText('Por quanto tempo as cargas devem operar?')).toBeInTheDocument();
    expect(window.location.search).toBe('?workspace=loads');
  });

  it('opens the section from the URL when the workspace is refreshed', () => {
    window.history.replaceState({}, '', '/pt?workspace=solution');
    renderWorkspace();

    expect(screen.getByRole('heading', { name: 'Solução' })).toBeInTheDocument();
  });

  it('delegates a resource click to the focused technical editor', () => {
    const onOpenResource = vi.fn();
    render(
      <NextIntlClientProvider locale="pt" messages={ptMessages}>
        <ProjectWorkspace
        projectInfo={projectInfo}
        client={undefined}
        residentialOptions={residentialOptions}
        solution={null}
        nominalW={180}
        peakW={540}
        dailyKwh={0.36}
        solutionIsStale={false}
        inverterCatalog={inverterCatalog}
        availableInverterModels={null}
        onOpenResource={onOpenResource}
      >
        <div>Fluxo técnico atual</div>
        </ProjectWorkspace>
      </NextIntlClientProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Recursos' }));
    fireEvent.click(screen.getByRole('button', { name: /Tarifa Branca/ }));

    expect(onOpenResource).toHaveBeenCalledWith('white_tariff');
  });
});
