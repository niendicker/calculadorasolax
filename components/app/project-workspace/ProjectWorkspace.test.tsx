// @vitest-environment jsdom

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';
import ptMessages from '@/messages/pt.json';
import type { ProjectInfo, ResidentialOptions, Solution } from '@/lib/types';
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

  function renderWorkspace(overrides: Partial<React.ComponentProps<typeof ProjectWorkspace>> = {}) {
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
        {...overrides}
      >
        <div>Fluxo técnico atual</div>
        </ProjectWorkspace>
      </NextIntlClientProvider>
    );
  }

  it('shows the project overview and real resource status', () => {
    renderWorkspace({ autosaveStatus: 'saved' });

    expect(screen.getByRole('heading', { name: 'Residência Silva' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Navegação estrutural' })).not.toBeInTheDocument();
    expect(screen.getByText('Salvo')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Cliente' })).toBeInTheDocument();
    expect(screen.queryByText('Cliente: Marcelo Grande')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cargas' })).toBeInTheDocument();
    expect(screen.getByText('Configurações gerais')).toBeInTheDocument();
    expect(screen.getByText('Configurações técnicas')).toBeInTheDocument();
    expect(screen.getByText('Nome da instalação')).toBeInTheDocument();
    expect(screen.queryByText('Potência nominal')).not.toBeInTheDocument();
    expect(screen.queryByText('Potência máxima')).not.toBeInTheDocument();
    expect(screen.queryByText('Energia diária')).not.toBeInTheDocument();
    expect(screen.getAllByText('Trifásico 380V').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('Automático')).toBeInTheDocument();
    expect(screen.getByText('T-BAT H 5.8 V2 · Alta tensão (HV)')).toBeInTheDocument();
    expect(screen.getAllByText('Requer atenção').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Dimensionar solução' })).not.toBeInTheDocument();
  });

  it('hides "Revisar cargas" from Próximos passos once at least one load is registered, and shows it when there are none', () => {
    const { rerender } = renderWorkspace();

    expect(screen.queryByRole('button', { name: /^Revisar cargas/ })).not.toBeInTheDocument();

    rerender(
      <NextIntlClientProvider locale="pt" messages={ptMessages}>
        <ProjectWorkspace
          projectInfo={projectInfo}
          client={{ id: 'client-1', name: 'Marcelo Grande', email: '', phone: '', document: '', notes: '', createdAt: '', updatedAt: '' }}
          residentialOptions={{ ...residentialOptions, loads: [] }}
          solution={null}
          nominalW={0}
          peakW={0}
          dailyKwh={0}
          solutionIsStale={false}
          inverterCatalog={inverterCatalog}
          availableInverterModels={null}
        >
          <div>Fluxo técnico atual</div>
        </ProjectWorkspace>
      </NextIntlClientProvider>
    );

    expect(screen.getByRole('button', { name: /^Revisar cargas/ })).toBeInTheDocument();
  });

  it('keeps the Microgrid help icon inline with its title without card padding', () => {
    const onOpenResource = vi.fn();
    renderWorkspace({
      onOpenResource,
      residentialOptions: {
        ...residentialOptions,
        desiredFeatures: ['microgrid'],
        microgrid: {
          voltageV: 220,
          onGridPhases: 1,
          onGridApparentPowerVA: 5000,
          isFundamentalRequirement: true,
          photoUrl: null,
          powerNoticeAcknowledged: true,
        },
      },
    });

    const helpButton = screen.getByRole('button', { name: 'Saiba mais sobre Microrrede' });
    expect(helpButton).toHaveClass('p-0');
    expect(helpButton.parentElement).toHaveTextContent('Microrrede');

    fireEvent.click(helpButton);

    expect(onOpenResource).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('offers solution recalculation in the workspace header without changing the overview layout', () => {
    const onRefreshSolution = vi.fn();
    renderWorkspace({ onRefreshSolution });

    const headerAction = screen.getByRole('button', { name: 'Recalcular solução' });
    expect(headerAction).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Residência Silva' })).toBeInTheDocument();

    fireEvent.click(headerAction);
    expect(onRefreshSolution).toHaveBeenCalledOnce();
  });

  it('keeps clear next to recalculation and confirms the workspace reset', async () => {
    const onResetSizing = vi.fn();
    const onRefreshSolution = vi.fn();
    renderWorkspace({ onResetSizing, onRefreshSolution });

    const clearButton = screen.getByRole('button', { name: 'Limpar dimensionamento' });
    const recalculateButton = screen.getByRole('button', { name: 'Recalcular solução' });
    const actions = recalculateButton.parentElement as HTMLElement;
    const clearWrapper = clearButton.parentElement as HTMLElement;

    expect(clearWrapper.parentElement).toBe(actions);
    expect(Array.from(actions.children).indexOf(recalculateButton)).toBeLessThan(Array.from(actions.children).indexOf(clearWrapper));

    // Same line as the client name — not their own separate row anymore.
    const clientLine = actions.parentElement as HTMLElement;
    expect(clientLine).toHaveClass('justify-between');
    expect(within(clientLine).getByRole('img', { name: 'Cliente' })).toBeInTheDocument();
    expect(clientLine.previousElementSibling).toContainElement(screen.getByRole('heading', { name: 'Residência Silva' }));

    // The header is just those two lines — the section tabs come right after.
    const header = clientLine.parentElement as HTMLElement;
    expect(header.nextElementSibling).toHaveAttribute('aria-label', 'Seções do projeto');

    fireEvent.click(clearButton);
    const dialog = await screen.findByRole('dialog', { name: 'Limpar dimensionamento?' });
    expect(dialog).toBeInTheDocument();
    expect(onResetSizing).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    expect(onResetSizing).not.toHaveBeenCalled();

    fireEvent.click(clearButton);
    fireEvent.click(await screen.findByRole('button', { name: /^Limpar$/ }));
    expect(onResetSizing).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Limpar dimensionamento?' })).not.toBeInTheDocument());

    fireEvent.click(clearButton);
    const secondDialog = await screen.findByRole('dialog', { name: 'Limpar dimensionamento?' });
    expect(within(secondDialog).getByRole('button', { name: /^Limpar$/ })).toBeInTheDocument();
    expect(within(secondDialog).queryByRole('button', { name: 'Excluindo dimensionamento...' })).not.toBeInTheDocument();

    fireEvent.click(within(secondDialog).getByRole('button', { name: /^Limpar$/ }));
    expect(onResetSizing).toHaveBeenCalledTimes(2);
  });

  it('disables recalculation while the solution is configured', () => {
    const onRefreshSolution = vi.fn();
    renderWorkspace({
      solution: {
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
      },
      onRefreshSolution,
    });

    const recalculateButton = screen.getByRole('button', { name: 'Recalcular solução' });
    expect(recalculateButton).toBeDisabled();
    expect(within(recalculateButton.parentElement as HTMLElement).queryByText('Configurado')).not.toBeInTheDocument();

    fireEvent.click(recalculateButton);
    expect(onRefreshSolution).not.toHaveBeenCalled();
  });

  it('opens the existing technical editors from each summary row', () => {
    const onOpenConfiguration = vi.fn();
    const onOpenResource = vi.fn();
    renderWorkspace({ onOpenConfiguration, onOpenResource });

    fireEvent.click(screen.getByRole('button', { name: /Rede elétrica/ }));
    fireEvent.click(screen.getByRole('button', { name: /Inversor/ }));
    fireEvent.click(screen.getByRole('button', { name: /Bateria/ }));

    expect(onOpenConfiguration).toHaveBeenNthCalledWith(1);
    expect(onOpenConfiguration).toHaveBeenNthCalledWith(2);
    expect(onOpenConfiguration).toHaveBeenNthCalledWith(3, 'battery');
    expect(onOpenConfiguration).toHaveBeenCalledTimes(3);
    expect(onOpenResource).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Editar inversor e bateria' })).not.toBeInTheDocument();
  });

  it('opens the battery selection screen from the technical summary row', () => {
    const onOpenResource = vi.fn();
    renderWorkspace({ onOpenResource, technicalEditorOpen: true });

    fireEvent.click(screen.getByRole('button', { name: /Bateria/ }));

    expect(onOpenResource).toHaveBeenCalledWith('battery');
    expect(screen.getByText('Fluxo técnico atual')).toBeInTheDocument();
  });

  it('opens battery editing through the full technical configuration flow when available', () => {
    const onOpenConfiguration = vi.fn();
    const onOpenResource = vi.fn();
    renderWorkspace({ onOpenConfiguration, onOpenResource });

    fireEvent.click(screen.getByRole('button', { name: /Bateria/ }));

    expect(onOpenConfiguration).toHaveBeenCalledWith('battery');
    expect(onOpenResource).not.toHaveBeenCalled();
  });

  it('opens an independent name modal and saves only the name', () => {
    const onUpdateProjectInfo = vi.fn();
    const onSaveProject = vi.fn();
    renderWorkspace({ onUpdateProjectInfo, onSaveProject });

    fireEvent.click(screen.getByRole('button', { name: /^Nome da instalação/ }));

    const dialog = screen.getByRole('dialog', { name: 'Nome da instalação' });
    expect(dialog).toBeInTheDocument();

    fireEvent.change(within(dialog).getByLabelText('Nome da instalação'), { target: { value: 'Residência Nova' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(onUpdateProjectInfo).toHaveBeenCalledWith({ name: 'Residência Nova' });
    expect(onSaveProject).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog', { name: 'Nome da instalação' })).not.toBeInTheDocument();
  });

  it('shows service details and manages project services from the overview', () => {
    const onAddService = vi.fn();
    const onRemoveService = vi.fn();
    const onSaveProject = vi.fn();
    renderWorkspace({
      userServices: [
        { id: 'service-1', name: 'Instalação', unitValue: 500, pricingUnit: 'project', createdAt: '', updatedAt: '' },
        { id: 'service-2', name: 'Frete', unitValue: 150, pricingUnit: 'pv_kwp', createdAt: '', updatedAt: '' },
      ],
      services: [{ serviceId: 'service-1', name: 'Instalação', qty: 1 }],
      onAddService,
      onRemoveService,
      onSaveProject,
    });

    expect(screen.getByRole('heading', { name: 'Serviços do projeto' })).toBeInTheDocument();
    expect(screen.getByText('Cobrança por projeto · R$ 500,00')).toBeInTheDocument();
    expect(screen.getByText('R$ 500,00')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Adicionar serviço' }));
    const addDialog = screen.getByRole('dialog', { name: 'Adicionar serviço' });
    fireEvent.click(within(addDialog).getByLabelText(/Frete/));
    fireEvent.click(within(addDialog).getByRole('button', { name: 'Adicionar' }));

    expect(onAddService).toHaveBeenCalledWith('service-2');
    expect(onSaveProject).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Remover serviço Instalação' }));
    fireEvent.click(screen.getByRole('button', { name: 'Excluir serviço' }));

    expect(onRemoveService).toHaveBeenCalledWith('service-1');
    expect(onSaveProject).toHaveBeenCalledTimes(2);
  });

  it('opens a client modal and saves only the selected client', () => {
    const onUpdateProjectInfo = vi.fn();
    const onSaveProject = vi.fn();
    renderWorkspace({
      clients: [
        { id: 'client-1', name: 'Marcelo Grande', email: '', phone: '', document: '', notes: '', createdAt: '', updatedAt: '' },
        { id: 'client-2', name: 'Cliente Novo', email: '', phone: '', document: '', notes: '', createdAt: '', updatedAt: '' },
      ],
      onUpdateProjectInfo,
      onSaveProject,
    });

    fireEvent.click(screen.getByRole('button', { name: /^Cliente/ }));

    const dialog = screen.getByRole('dialog', { name: 'Cliente' });
    expect(dialog).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText('Cliente'), { target: { value: 'client-2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(onUpdateProjectInfo).toHaveBeenCalledWith({ clientId: 'client-2' });
    expect(onSaveProject).toHaveBeenCalledTimes(1);
  });

  it('opens an address modal with all fields and saves only the address', () => {
    const onUpdateProjectInfo = vi.fn();
    const onSaveProject = vi.fn();
    renderWorkspace({ onUpdateProjectInfo, onSaveProject });

    fireEvent.click(screen.getByRole('button', { name: /^Endereço/ }));

    const dialog = screen.getByRole('dialog', { name: 'Endereço da instalação' });
    expect(dialog).toBeInTheDocument();
    for (const label of ['CEP', 'Número', 'Endereço', 'Complemento', 'Bairro', 'Cidade', 'UF']) {
      expect(within(dialog).getByLabelText(label)).toBeInTheDocument();
    }

    fireEvent.change(within(dialog).getByLabelText('Número'), { target: { value: '42' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(onUpdateProjectInfo).toHaveBeenCalledWith({ address: { ...projectInfo.address, number: '42' } });
    expect(onSaveProject).toHaveBeenCalledTimes(1);
  });

  it('cancels an independent edit without changing the project draft', () => {
    const onUpdateProjectInfo = vi.fn();
    const onSaveProject = vi.fn();
    const onCancelProjectEdit = vi.fn();
    renderWorkspace({ onUpdateProjectInfo, onSaveProject, onCancelProjectEdit });

    fireEvent.click(screen.getByRole('button', { name: /^Cliente/ }));
    const dialog = screen.getByRole('dialog', { name: 'Cliente' });
    fireEvent.change(within(dialog).getByLabelText('Cliente'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(onUpdateProjectInfo).not.toHaveBeenCalled();
    expect(onSaveProject).not.toHaveBeenCalled();
    expect(onCancelProjectEdit).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog', { name: 'Cliente' })).not.toBeInTheDocument();
  });

  it('closes an independent edit with Escape', () => {
    const onUpdateProjectInfo = vi.fn();
    renderWorkspace({ onUpdateProjectInfo });

    fireEvent.click(screen.getByRole('button', { name: /^Nome da instalação/ }));
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onUpdateProjectInfo).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog', { name: 'Nome da instalação' })).not.toBeInTheDocument();
  });

  it('does not render action buttons in the workspace header', () => {
    renderWorkspace();

    expect(screen.queryByRole('button', { name: 'Editar projeto' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Revisar pendências' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mais opções do projeto' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Voltar para Projetos' })).not.toBeInTheDocument();
    expect(screen.queryByRole('menu', { name: 'Mais opções do projeto' })).not.toBeInTheDocument();
  });

  it('switches sections and keeps the technical flow available', () => {
    renderWorkspace();

    fireEvent.click(screen.getByRole('button', { name: /^Cargas$/ }));

    expect(screen.queryByRole('heading', { name: 'Cargas' })).not.toBeInTheDocument();
    expect(screen.queryByText('Cargas cadastradas')).not.toBeInTheDocument();
    expect(screen.getByText('Cargas do projeto')).toBeInTheDocument();
    expect(screen.queryByText('Por quanto tempo as cargas devem operar?')).not.toBeInTheDocument();
    expect(window.location.search).toBe('?workspace=loads');
  });

  it('shows the financial summary using equipment and service values in the project budget', () => {
    const solution = {
      inverterId: 'inverter-1',
      inverterModel: 'X3-ULT-30K',
      inverterQty: 1,
      batteryId: 'battery-1',
      batteryModel: 'T-BAT H 5.8 V2',
      batteryQty: 1,
      pvPowerKw: null,
      accessories: [],
    } as Solution;

    renderWorkspace({
      solution,
      userStockItems: [
        { id: 'stock-inverter', productType: 'inverter', productModel: 'X3-ULT-30K', unitValue: 10000, createdAt: '', updatedAt: '' },
        { id: 'stock-battery', productType: 'battery', productModel: 'T-BAT H 5.8 V2', unitValue: 5000, createdAt: '', updatedAt: '' },
      ],
      services: [{ serviceId: 'service-1', name: 'Instalação', qty: 1 }],
      userServices: [{ id: 'service-1', name: 'Instalação', unitValue: 750, pricingUnit: 'project', createdAt: '', updatedAt: '' }],
      marginSettings: { inverterPercent: 0, batteryPercent: 0, accessoryPercent: 0 },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Financeiro' }));

    expect(screen.getByRole('heading', { name: 'Resumo financeiro da aplicação' })).toBeInTheDocument();
    expect(screen.getByText('R$ 15.750,00')).toBeInTheDocument();
    expect(screen.getByText('R$ 15.000,00')).toBeInTheDocument();
    expect(screen.getByText('R$ 750,00')).toBeInTheDocument();
    expect(screen.getByText('Orçamento completo.')).toBeInTheDocument();
  });

  it('offers a portfolio action when the financial summary has missing prices', () => {
    const onManagePortfolio = vi.fn();
    const solution = {
      inverterId: 'inverter-1',
      inverterModel: 'X3-ULT-30K',
      inverterQty: 1,
      batteryId: 'battery-1',
      batteryModel: 'T-BAT H 5.8 V2',
      batteryQty: 1,
      pvPowerKw: null,
      accessories: [],
    } as Solution;

    renderWorkspace({ solution, onManagePortfolio });
    fireEvent.click(screen.getByRole('button', { name: 'Financeiro' }));

    const portfolioButton = screen.getByRole('button', { name: 'Ir para o Portfólio' });
    expect(portfolioButton).toBeInTheDocument();
    fireEvent.click(portfolioButton);
    expect(onManagePortfolio).toHaveBeenCalledOnce();
  });

  it('adds a missing solution product with its price from the budget', async () => {
    const onAddToStock = vi.fn().mockResolvedValue(undefined);
    const solution = {
      inverterId: 'inverter-1',
      inverterModel: 'X3-ULT-30K',
      inverterQty: 1,
      batteryId: 'battery-1',
      batteryModel: 'T-BAT H 5.8 V2',
      batteryQty: 1,
      pvPowerKw: null,
      accessories: [],
    } as Solution;

    renderWorkspace({ solution, onAddToStock });
    fireEvent.click(screen.getByRole('button', { name: 'Financeiro' }));
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar · X3-ULT-30K' }));

    const dialog = screen.getByRole('dialog', { name: 'Adicionar produto' });
    fireEvent.change(within(dialog).getByLabelText('Preço'), { target: { value: '12500' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Adicionar produto' }));

    await waitFor(() => expect(onAddToStock).toHaveBeenCalledWith({ productType: 'inverter', productModel: 'X3-ULT-30K', unitValue: 12500 }));
  });

  it('updates an existing unpriced service directly from the budget', async () => {
    const onUpdateServiceValue = vi.fn().mockResolvedValue(undefined);
    renderWorkspace({
      services: [{ serviceId: 'service-1', name: 'Instalação', qty: 1 }],
      userServices: [{ id: 'service-1', name: 'Instalação', unitValue: 0, createdAt: '', updatedAt: '' }],
      onUpdateServiceValue,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Financeiro' }));
    fireEvent.click(screen.getByRole('button', { name: 'Definir preço · Instalação' }));

    const dialog = screen.getByRole('dialog', { name: 'Definir preço' });
    fireEvent.change(within(dialog).getByLabelText('Preço'), { target: { value: '850' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Salvar preço' }));

    await waitFor(() => expect(onUpdateServiceValue).toHaveBeenCalledWith('service-1', 850));
  });

  it('responds when a nested resource editor navigates to Loads', async () => {
    renderWorkspace();

    await act(async () => {
      window.dispatchEvent(new CustomEvent('workspace-section-change', { detail: 'loads' }));
    });
    expect(screen.queryByRole('heading', { name: 'Cargas' })).not.toBeInTheDocument();
    expect(screen.queryByText('Cargas cadastradas')).not.toBeInTheDocument();
    expect(screen.getByText('Cargas do projeto')).toBeInTheDocument();
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
    expect(screen.queryByRole('heading', { name: 'Recursos — Tarifa Branca' })).not.toBeInTheDocument();
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

    fireEvent.click(screen.getByRole('button', { name: 'Financeiro' }));
    expect(screen.getByRole('heading', { name: 'Solicitar cotação ao fornecedor' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Compartilhar com o cliente' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Revisar solicitação' }));
    expect(onOpenBudget).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole('button', { name: 'Relatório' }));
    fireEvent.click(screen.getByRole('button', { name: 'Gerar relatório' }));
    expect(onGenerateReport).toHaveBeenCalledOnce();
  });

  it('keeps recalculation available in the workspace header while viewing the solution', () => {
    const onOpenTechnical = vi.fn();
    const onRefreshSolution = vi.fn();
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

    renderWorkspace({
      solution,
      solutionIsStale: true,
      onOpenTechnical,
      onRefreshSolution,
    });

    const recalculateButton = screen.getByRole('button', { name: 'Recalcular solução' });
    expect(recalculateButton).toBeEnabled();
    expect(recalculateButton).toHaveClass('bg-amber-500');
    expect(screen.getByRole('heading', { name: 'Residência Silva' }).closest('.pb-3')).toHaveClass('sticky', 'top-0');

    fireEvent.click(screen.getByRole('button', { name: 'Solução' }));
    fireEvent.click(screen.getByRole('button', { name: 'Recalcular solução' }));

    expect(onRefreshSolution).toHaveBeenCalledTimes(1);
    expect(onOpenTechnical).not.toHaveBeenCalled();
    const solutionHeader = screen.getByRole('heading', { name: 'Solução' }).parentElement?.parentElement;
    expect(within(solutionHeader as HTMLElement).queryByText('Configurado')).not.toBeInTheDocument();
  });

  it('shows the current solution as a compact table without images in the overview', () => {
    const solution = {
      inverterId: 'inverter-1',
      inverterModel: 'X3-ULT-30K',
      inverterQty: 1,
      inverterRatedPowerW: 30000,
      inverterPeakPowerW: 36000,
      batteryId: 'battery-1',
      batteryModel: 'T-BAT H 5.8 V2',
      batteryQty: 2,
      availableEnergyWh: 5800,
      pvPowerKw: null,
      accessories: [],
    };

    renderWorkspace({
      solution,
      productMedia: {
        'X3-ULT-30K': { model: 'X3-ULT-30K', nickname: 'Inversor principal', description: null, imageUrl: 'inverter.png', documents: [] },
        'T-BAT H 5.8 V2': { model: 'T-BAT H 5.8 V2', nickname: 'Bateria principal', description: null, imageUrl: 'battery.png', documents: [] },
      },
    });

    expect(screen.getByRole('table', { name: 'Resumo da solução atual' })).toBeInTheDocument();
    expect(screen.getByText('Inversor principal')).toBeInTheDocument();
    expect(screen.getByText('Bateria principal')).toBeInTheDocument();
    expect(screen.getByText('X3-ULT-30K')).toBeInTheDocument();
    expect(screen.getByText('T-BAT H 5.8 V2')).toBeInTheDocument();
    expect(screen.queryByText('30 kVA · Pico 36 kVA')).not.toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'X3-ULT-30K' })).not.toBeInTheDocument();
    const solutionTable = screen.getByRole('table', { name: 'Resumo da solução atual' });
    expect(within(solutionTable).queryByText('Energia disponível')).not.toBeInTheDocument();
    const solutionRows = within(solutionTable).getAllByRole('row');
    expect(solutionRows[solutionRows.length - 1]).toContainElement(within(solutionTable).getByRole('button', { name: 'Ver detalhes' }));
    expect(screen.queryByRole('button', { name: 'Recalcular solução' })).not.toBeInTheDocument();

    fireEvent.click(within(solutionTable).getByRole('button', { name: 'Ver detalhes' }));
    expect(screen.getByRole('heading', { name: 'Solução' })).toBeInTheDocument();
  });

  it('shows product images in the solution summary when media is available', () => {
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

    renderWorkspace({
      solution,
      productMedia: {
        'X3-ULT-30K': {
          model: 'X3-ULT-30K',
          nickname: null,
          description: null,
          imageUrl: 'https://supabase-calculadora.solaxpowerbrasil.cloud/storage/v1/object/public/products/inverter.png',
          documents: [],
        },
        'T-BAT H 5.8 V2': {
          model: 'T-BAT H 5.8 V2',
          nickname: null,
          description: null,
          imageUrl: 'https://supabase-calculadora.solaxpowerbrasil.cloud/storage/v1/object/public/products/battery.png',
          documents: [],
        },
      },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Solução' }));
    fireEvent.click(screen.getByRole('img', { name: 'X3-ULT-30K' }));

    expect(screen.getByRole('dialog', { name: 'Pré-visualização do produto' })).toBeInTheDocument();
  });

  it('splits T58 master and expansion batteries in the solution summary', () => {
    const solution = {
      inverterId: 'inverter-1',
      inverterModel: 'X3-ULT-30K',
      inverterQty: 1,
      inverterRatedPowerW: 30000,
      batteryId: 'battery-1',
      batteryModel: 'T58 V2 Master',
      batteryQty: 3,
      batteryPortsUsed: 1,
      availableEnergyWh: 15660,
      pvPowerKw: null,
      accessories: [],
    };

    renderWorkspace({
      solution,
      batteryCatalog: [
        { id: 'battery-master', model: 'T58 V2 Master', topology: 'HV', capacityKwh: 5.22, standardPowerKw: null, peakPowerKw: null, minSocPercent: 0, expansionModel: 'T58 Slave', imageUrl: null, documents: [] },
        { id: 'battery-slave', model: 'T58 Slave', topology: 'HV', capacityKwh: 5.22, standardPowerKw: null, peakPowerKw: null, minSocPercent: 0, imageUrl: null, documents: [] },
      ],
    });

    fireEvent.click(screen.getByRole('button', { name: 'Solução' }));

    expect(screen.getByText('T58 V2 Master')).toBeInTheDocument();
    expect(screen.getAllByText('BMS Integrado')).toHaveLength(1);
    expect(screen.queryByText('Principal')).not.toBeInTheDocument();
    expect(screen.getAllByText('Expansão').length).toBeGreaterThan(0);
    expect(screen.getAllByText('T58 Slave').length).toBeGreaterThan(0);
  });

  it('shows accessory images in the equipment tab when media is available', () => {
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
      accessories: [{ model: 'Wi-Fi + LAN', qty: 1, comment: 'Comunicação e monitoramento do inversor.', optional: false, bundled: true, appliesTo: 'inverter' as const }],
    };

    renderWorkspace({
      solution,
      productMedia: {
        'Wi-Fi + LAN': {
          model: 'Wi-Fi + LAN',
          nickname: null,
          description: 'Módulo de conectividade para supervisão remota.',
          imageUrl: 'https://supabase-calculadora.solaxpowerbrasil.cloud/storage/v1/object/public/products/accessory.png',
          documents: [],
        },
      },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Solução' }));
    expect(screen.getByText('Acompanha os equipamentos')).toBeInTheDocument();
    expect(screen.queryByText('Incluso')).not.toBeInTheDocument();
    expect(screen.queryByText('Aplicado ao inversor')).not.toBeInTheDocument();
    expect(screen.getByText('Módulo de conectividade para supervisão remota.')).toBeInTheDocument();
    expect(screen.getByText('Comunicação e monitoramento do inversor.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('img', { name: 'Wi-Fi + LAN' }));

    expect(screen.getByRole('dialog', { name: 'Pré-visualização do produto' })).toBeInTheDocument();
  });

  it('opens available product documents from the equipment tab', () => {
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

    renderWorkspace({
      solution,
      productMedia: {
        'X3-ULT-30K': {
          model: 'X3-ULT-30K',
          nickname: null,
          description: null,
          imageUrl: null,
          documents: [{ name: 'Manual', url: 'https://supabase-calculadora.solaxpowerbrasil.cloud/storage/v1/object/public/products/manual.pdf' }],
        },
      },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Solução' }));
    fireEvent.click(screen.getByRole('button', { name: 'Manual' }));

    expect(screen.getByRole('dialog', { name: 'Manual' })).toBeInTheDocument();
  });

  it('calculates directly from the solution section when no solution exists yet', () => {
    const onOpenTechnical = vi.fn();
    const onRefreshSolution = vi.fn();

    renderWorkspace({
      onOpenTechnical,
      onRefreshSolution,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Solução' }));
    fireEvent.click(screen.getByRole('button', { name: 'Calcular solução' }));

    expect(onRefreshSolution).toHaveBeenCalledTimes(1);
    expect(onOpenTechnical).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Configurar e dimensionar' })).toBeInTheDocument();
  });
});
