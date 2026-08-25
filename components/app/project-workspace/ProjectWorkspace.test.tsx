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

  it('closes the header menu when clicking outside', () => {
    renderWorkspace();

    fireEvent.click(screen.getByRole('button', { name: 'Mais opções do projeto' }));
    expect(screen.getByRole('menu', { name: 'Mais opções do projeto' })).toBeInTheDocument();

    fireEvent.mouseDown(document.body);

    expect(screen.queryByRole('menu', { name: 'Mais opções do projeto' })).not.toBeInTheDocument();
  });

  it('switches sections and keeps the technical flow available', () => {
    renderWorkspace();

    fireEvent.click(screen.getByRole('button', { name: /^Cargas$/ }));

    expect(screen.getByRole('heading', { name: 'Cargas' })).toBeInTheDocument();
    expect(screen.queryByText('Por quanto tempo as cargas devem operar?')).not.toBeInTheDocument();
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
        activeResourceId="white_tariff"
      >
        <div>Fluxo técnico atual</div>
        </ProjectWorkspace>
      </NextIntlClientProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: /Tarifa Branca/ }));

    expect(onOpenResource).toHaveBeenCalledWith('white_tariff');
    expect(screen.getByRole('heading', { name: 'Recursos — Tarifa Branca' })).toBeInTheDocument();
  });

  it('delegates budget and report actions without duplicating their flows', () => {
    const onOpenBudget = vi.fn();
    const onGenerateReport = vi.fn();
    const solution = {
      inverterId: 'inverter-1',
      inverterModel: 'X3-ULT-30K',
      inverterQty: 1,
      inverterRatedPowerW: 30000,
      batteryId: 'battery-1',
      batteryModel: 'T-BAT H 5.8 V2',
      batteryQty: 1,
      availableEnergyWh: 5800,
      pvPowerKw: null,
      accessories: [],
    };

    render(
      <NextIntlClientProvider locale="pt" messages={ptMessages}>
        <ProjectWorkspace
          projectInfo={projectInfo}
          client={undefined}
          residentialOptions={residentialOptions}
          solution={solution}
          nominalW={180}
          peakW={540}
          dailyKwh={0.36}
          solutionIsStale={false}
          inverterCatalog={inverterCatalog}
          availableInverterModels={null}
          onOpenBudget={onOpenBudget}
          onGenerateReport={onGenerateReport}
        >
          <div>Fluxo técnico atual</div>
        </ProjectWorkspace>
      </NextIntlClientProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Solução' }));
    expect(screen.getByRole('button', { name: 'Resumo' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Margens' }));
    expect(screen.getByText('Potência padrão')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Orçamento' }));
    fireEvent.click(screen.getByRole('button', { name: 'Abrir orçamento' }));
    expect(onOpenBudget).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole('button', { name: 'Relatório' }));
    fireEvent.click(screen.getByRole('button', { name: 'Gerar relatório' }));
    expect(onGenerateReport).toHaveBeenCalledOnce();
  });
});
