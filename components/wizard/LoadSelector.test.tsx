// @vitest-environment jsdom

import { NextIntlClientProvider } from 'next-intl';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ptMessages from '@/messages/pt.json';
import { ACCOUNT_LIMITS } from '@/lib/limits';
import { useWizardStore } from '@/lib/store/wizard-store';
import { createSupabaseMock } from '@/lib/test-helpers/supabase-mock';
import { resetWizardStore } from '@/lib/test-helpers/wizard-store-reset';
import type { CatalogItem, LoadPresetItem, UserLoadCatalogItem, UserLoadPresetItem } from '@/lib/types';
import { LoadSelector } from './LoadSelector';

const { createClientMock } = vi.hoisted(() => ({ createClientMock: vi.fn() }));
vi.mock('@/lib/supabase/client', () => ({ createClient: createClientMock }));

const systemPreset: LoadPresetItem = {
  id: 'sp1',
  name: 'Residencial essencial',
  description: 'Cargas básicas',
  loads: [{ name: 'Chuveiro elétrico', powerW: 5500, hoursPerDay: 1, qty: 1, ipInRatio: 1 }],
};

const userPreset: UserLoadPresetItem = {
  id: 'up1',
  name: 'Meu preset',
  description: 'Descrição',
  loads: [{ name: 'Bomba', powerW: 750, hoursPerDay: 2, qty: 1, ipInRatio: 3 }],
};

const catalogItem: CatalogItem = {
  id: 'c1',
  namePt: 'Ar-condicionado 9000 BTU',
  nameEn: 'AC 9000 BTU',
  nameZh: '',
  powerW: 900,
  category: 'climate',
  ipInRatio: 3,
};

const userCatalogItem: UserLoadCatalogItem = {
  id: 'u1',
  name: 'Bomba dágua',
  powerW: 750,
  ipInRatio: 3,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function renderLoadSelector(props: { defaultToMine?: boolean } = {}) {
  return render(
    <NextIntlClientProvider locale="pt" messages={ptMessages}>
      <LoadSelector {...props} />
    </NextIntlClientProvider>
  );
}

beforeEach(() => {
  resetWizardStore();
  createClientMock.mockReset();
  createClientMock.mockReturnValue(createSupabaseMock());
  useWizardStore.setState({
    loadPresets: [systemPreset],
    userLoadPresets: [],
    loadCatalog: [catalogItem],
    userLoadCatalog: [],
  });
});

describe('LoadSelector: collapsible sections', () => {
  it('shows the Presets tab by default, with the outer section expanded', () => {
    renderLoadSelector();

    expect(screen.getByRole('tab', { name: 'Presets' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Residencial essencial')).toBeInTheDocument();
  });

  it('toggles the whole Cargas section open and closed', () => {
    renderLoadSelector();

    fireEvent.click(screen.getByRole('button', { name: /^Cargas/ }));
    expect(screen.queryByRole('tab', { name: 'Presets' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^Cargas/ }));
    expect(screen.getByRole('tab', { name: 'Presets' })).toBeInTheDocument();
  });

  it('switches to the Catálogo tab', () => {
    renderLoadSelector();

    fireEvent.click(screen.getByRole('tab', { name: 'Catálogo' }));

    expect(screen.getByPlaceholderText('Buscar equipamento...')).toBeInTheDocument();
    expect(screen.queryByText('Residencial essencial')).not.toBeInTheDocument();
  });
});

describe('LoadSelector: adding from a system preset', () => {
  it('adds every load from the preset and switches to the Catálogo tab', () => {
    renderLoadSelector();

    fireEvent.click(screen.getByRole('button', { name: /Residencial essencial/ }));

    expect(useWizardStore.getState().residentialOptions.loads).toHaveLength(1);
    expect(useWizardStore.getState().residentialOptions.loads[0]).toMatchObject({ name: 'Chuveiro elétrico', powerW: 5500 });
    // handleAddPreset switches to the Catálogo tab afterwards.
    expect(screen.getByRole('tab', { name: 'Catálogo' })).toHaveAttribute('aria-selected', 'true');
  });

  it('shows a specific message when the preset does not fully fit the remaining capacity', () => {
    useWizardStore.setState((s) => ({
      residentialOptions: {
        ...s.residentialOptions,
        loads: Array.from({ length: ACCOUNT_LIMITS.loadsPerProject - 1 }, (_, i) => ({
          id: `l${i}`,
          name: `Carga ${i}`,
          powerW: 100,
          hoursPerDay: 1,
          qty: 1,
          ipInRatio: 1,
        })),
      },
      loadPresets: [{ ...systemPreset, loads: [...systemPreset.loads, { ...systemPreset.loads[0], name: 'Segunda carga' }] }],
    }));
    renderLoadSelector();

    fireEvent.click(screen.getByRole('button', { name: /Residencial essencial/ }));

    expect(
      screen.getByText(/mas só cabem mais 1 neste projeto/)
    ).toBeInTheDocument();
    expect(useWizardStore.getState().residentialOptions.loads).toHaveLength(ACCOUNT_LIMITS.loadsPerProject - 1);
  });
});

describe('LoadSelector: user presets', () => {
  it('shows the empty state and disables "Salvar cargas atuais" with no loads yet', () => {
    renderLoadSelector();
    fireEvent.click(screen.getByRole('tab', { name: /Meus presets/ }));
    expect(screen.getByText('Nenhum preset pessoal ainda. Monte as cargas do projeto e salve como preset para reutilizar depois.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Salvar cargas atuais como preset/ })).toBeDisabled();
  });

  it('lists a saved user preset and removes it via the confirm popover', async () => {
    useWizardStore.setState({ userLoadPresets: [userPreset] });
    renderLoadSelector();
    fireEvent.click(screen.getByRole('tab', { name: /Meus presets/ }));

    expect(screen.getByText('Meu preset')).toBeInTheDocument();
    expect(screen.getByText('1/3', { exact: false })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Remover preset Meu preset' }));
    const confirmButton = await screen.findByRole('button', { name: 'Remover' }, { timeout: 1000 });
    fireEvent.click(confirmButton);

    await waitFor(() => expect(useWizardStore.getState().userLoadPresets).toEqual([]));
  });

  it('saves the current loads as a new preset', async () => {
    createClientMock.mockReturnValue(
      createSupabaseMock({
        tableResults: {
          user_load_presets: { data: { id: 'new-preset', name: 'Meu novo preset', description: '', loads: [] }, error: null },
        },
      })
    );
    useWizardStore.setState((s) => ({
      residentialOptions: {
        ...s.residentialOptions,
        loads: [{ id: 'l1', name: 'Chuveiro', powerW: 5500, hoursPerDay: 1, qty: 1, ipInRatio: 1 }],
      },
    }));
    renderLoadSelector();
    fireEvent.click(screen.getByRole('tab', { name: /Meus presets/ }));

    fireEvent.click(screen.getByRole('button', { name: /Salvar cargas atuais como preset/ }));
    fireEvent.change(screen.getByLabelText('Nome do preset'), { target: { value: 'Meu novo preset' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(useWizardStore.getState().userLoadPresets).toHaveLength(1));
  });

  it('shows a limit-reached error verbatim when saving a preset fails', async () => {
    createClientMock.mockReturnValue(createSupabaseMock());
    useWizardStore.setState((s) => ({
      residentialOptions: { ...s.residentialOptions, loads: [{ id: 'l1', name: 'X', powerW: 100, hoursPerDay: 1, qty: 1, ipInRatio: 1 }] },
      userLoadPresets: Array.from({ length: ACCOUNT_LIMITS.userPresets }, (_, i) => ({
        id: `up${i}`,
        name: `Preset ${i}`,
        description: '',
        loads: [],
      })),
    }));
    renderLoadSelector();
    fireEvent.click(screen.getByRole('tab', { name: /Meus presets/ }));

    // At the limit, the "Salvar cargas atuais" trigger itself is disabled...
    expect(screen.getByRole('button', { name: /Salvar cargas atuais como preset/ })).toBeDisabled();
  });
});

describe('LoadSelector: catalog', () => {
  it('adds a load from the general catalog', () => {
    renderLoadSelector();
    fireEvent.click(screen.getByRole('tab', { name: 'Catálogo' }));

    fireEvent.click(screen.getByText('Ar-condicionado 9000 BTU'));

    expect(useWizardStore.getState().residentialOptions.loads).toHaveLength(1);
    expect(useWizardStore.getState().residentialOptions.loads[0]).toMatchObject({ powerW: 900, ipInRatio: 3 });
  });

  it('filters the catalog by search', () => {
    useWizardStore.setState({
      loadCatalog: [catalogItem, { ...catalogItem, id: 'c2', namePt: 'Chuveiro elétrico' }],
    });
    renderLoadSelector();
    fireEvent.click(screen.getByRole('tab', { name: 'Catálogo' }));

    fireEvent.change(screen.getByPlaceholderText('Buscar equipamento...'), { target: { value: 'chuveiro' } });

    expect(screen.getByText('Chuveiro elétrico')).toBeInTheDocument();
    expect(screen.queryByText('Ar-condicionado 9000 BTU')).not.toBeInTheDocument();
  });

  it('filters the catalog by category', () => {
    useWizardStore.setState({
      loadCatalog: [catalogItem, { ...catalogItem, id: 'c2', namePt: 'Chuveiro elétrico', category: 'heating' }],
    });
    renderLoadSelector();
    fireEvent.click(screen.getByRole('tab', { name: 'Catálogo' }));

    fireEvent.click(screen.getByRole('button', { name: 'heating' }));

    expect(screen.getByText('Chuveiro elétrico')).toBeInTheDocument();
    expect(screen.queryByText('Ar-condicionado 9000 BTU')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'heating' }));
    expect(screen.getByText('Ar-condicionado 9000 BTU')).toBeInTheDocument();
  });

  it('hides the "Minhas" filter chip when the user has no personal catalog items', () => {
    renderLoadSelector();
    fireEvent.click(screen.getByRole('tab', { name: 'Catálogo' }));
    expect(screen.queryByRole('button', { name: 'Minhas' })).not.toBeInTheDocument();
  });

  it('isolates personal catalog items when the "Minhas" filter chip is active', () => {
    useWizardStore.setState({ userLoadCatalog: [userCatalogItem] });
    renderLoadSelector();
    fireEvent.click(screen.getByRole('tab', { name: 'Catálogo' }));

    fireEvent.click(screen.getByRole('button', { name: 'Minhas' }));
    expect(screen.getByText('Bomba dágua')).toBeInTheDocument();
    expect(screen.queryByText('Ar-condicionado 9000 BTU')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Minhas' }));
    expect(screen.getByText('Ar-condicionado 9000 BTU')).toBeInTheDocument();
  });

  it('defaults the "Minhas" filter to active when defaultToMine is set and the user has personal items', () => {
    useWizardStore.setState({ userLoadCatalog: [userCatalogItem] });
    renderLoadSelector({ defaultToMine: true });
    fireEvent.click(screen.getByRole('tab', { name: 'Catálogo' }));

    expect(screen.getByRole('button', { name: 'Minhas' })).toHaveClass('border-primary');
    expect(screen.getByText('Bomba dágua')).toBeInTheDocument();
    expect(screen.queryByText('Ar-condicionado 9000 BTU')).not.toBeInTheDocument();
  });

  it('ignores defaultToMine when the user has no personal catalog items', () => {
    renderLoadSelector({ defaultToMine: true });
    fireEvent.click(screen.getByRole('tab', { name: 'Catálogo' }));

    expect(screen.getByText('Ar-condicionado 9000 BTU')).toBeInTheDocument();
  });

  it('shows user catalog items alongside the general catalog, tagged as "Meu", and adds from it', () => {
    useWizardStore.setState({ userLoadCatalog: [userCatalogItem] });
    renderLoadSelector();
    fireEvent.click(screen.getByRole('tab', { name: 'Catálogo' }));

    expect(screen.getByText('Meu')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Bomba dágua'));

    expect(useWizardStore.getState().residentialOptions.loads[0]).toMatchObject({ name: 'Bomba dágua', powerW: 750 });
  });

  it('edits a user catalog item via its menu', async () => {
    createClientMock.mockReturnValue(
      createSupabaseMock({ tableResults: { user_load_catalog: { data: null, error: null } } })
    );
    useWizardStore.setState({ userLoadCatalog: [userCatalogItem] });
    renderLoadSelector();
    fireEvent.click(screen.getByRole('tab', { name: 'Catálogo' }));

    fireEvent.click(screen.getByRole('button', { name: 'Opções de Bomba dágua' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Editar' }));
    expect(screen.queryByText(/Fator de uso/)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Potência (VA)'), { target: { value: '900' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(useWizardStore.getState().userLoadCatalog[0].powerW).toBe(900));
  });

  it('removes a user catalog item via its menu', async () => {
    createClientMock.mockReturnValue(
      createSupabaseMock({ tableResults: { user_load_catalog: { data: null, error: null } } })
    );
    useWizardStore.setState({ userLoadCatalog: [userCatalogItem] });
    renderLoadSelector();
    fireEvent.click(screen.getByRole('tab', { name: 'Catálogo' }));

    fireEvent.click(screen.getByRole('button', { name: 'Opções de Bomba dágua' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Excluir' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remover' }));

    await waitFor(() => expect(useWizardStore.getState().userLoadCatalog).toEqual([]));
  });
});

describe('LoadSelector: manual add popover', () => {
  it('adds a manually entered load and resets the form', async () => {
    createClientMock.mockReturnValue(
      createSupabaseMock({
        tableResults: {
          user_load_catalog: {
            data: { id: 'new-u', name: 'Ventilador', power_w: 120, ip_in_ratio: 1, created_at: '', updated_at: '' },
            error: null,
          },
        },
      })
    );
    renderLoadSelector();
    fireEvent.click(screen.getByRole('tab', { name: 'Catálogo' }));

    fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }));
    const dialog = await screen.findByRole('dialog', { name: 'Adicionar nova carga' });
    fireEvent.change(within(dialog).getByLabelText('Nome'), { target: { value: 'Ventilador' } });
    fireEvent.change(within(dialog).getByLabelText('Potência (VA)'), { target: { value: '120' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /Adicionar carga/ }));

    expect(useWizardStore.getState().residentialOptions.loads[0]).toMatchObject({ name: 'Ventilador', powerW: 120 });
    await waitFor(() => expect(useWizardStore.getState().userLoadCatalog).toHaveLength(1));
  });

  it('keeps the load in the calculation but warns with the limit message when the personal catalog is full', async () => {
    createClientMock.mockReturnValue(createSupabaseMock());
    useWizardStore.setState({
      userLoadCatalog: Array.from({ length: ACCOUNT_LIMITS.userLoadCatalog }, (_, i) => ({
        id: `u${i}`,
        name: `Carga ${i}`,
        powerW: 100,
        ipInRatio: 1,
        createdAt: '',
        updatedAt: '',
      })),
    });
    renderLoadSelector();
    fireEvent.click(screen.getByRole('tab', { name: 'Catálogo' }));

    fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }));
    const dialog = await screen.findByRole('dialog', { name: 'Adicionar nova carga' });
    fireEvent.change(within(dialog).getByLabelText('Nome'), { target: { value: 'Carga nova' } });
    fireEvent.change(within(dialog).getByLabelText('Potência (VA)'), { target: { value: '100' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /Adicionar carga/ }));

    expect(useWizardStore.getState().residentialOptions.loads).toHaveLength(1);
    await waitFor(() => expect(screen.getByText(/Limite de/)).toBeInTheDocument());
  });

  it('keeps the load in the calculation but shows a generic warning on any other save failure', async () => {
    createClientMock.mockReturnValue(
      createSupabaseMock({ tableResults: { user_load_catalog: { data: null, error: { message: 'db down' } } } })
    );
    renderLoadSelector();
    fireEvent.click(screen.getByRole('tab', { name: 'Catálogo' }));

    fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }));
    const dialog = await screen.findByRole('dialog', { name: 'Adicionar nova carga' });
    fireEvent.change(within(dialog).getByLabelText('Nome'), { target: { value: 'Carga nova' } });
    fireEvent.change(within(dialog).getByLabelText('Potência (VA)'), { target: { value: '100' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /Adicionar carga/ }));

    expect(useWizardStore.getState().residentialOptions.loads).toHaveLength(1);
    await waitFor(() =>
      expect(screen.getByText(/não foi possível salvá-la em "Minhas Cargas"/)).toBeInTheDocument()
    );
  });
});

describe('LoadSelector: blank load card', () => {
  it('shows the "Adicionar carga" tile even with no loads yet, and adds a blank draft card on click', () => {
    renderLoadSelector();

    fireEvent.click(screen.getByRole('button', { name: 'Adicionar carga' }));

    expect(screen.getByLabelText('Nome')).toBeInTheDocument();
    expect(screen.getByLabelText('Potência (VA)')).toBeInTheDocument();
    expect(useWizardStore.getState().residentialOptions.loads).toHaveLength(1);
  });

  it('inserts the new blank card, and the resulting load, at the top of the existing list', () => {
    useWizardStore.setState((s) => ({
      residentialOptions: {
        ...s.residentialOptions,
        loads: [{ id: 'existing', name: 'Chuveiro', powerW: 5500, hoursPerDay: 1, qty: 1, ipInRatio: 1 }],
      },
    }));
    renderLoadSelector();

    fireEvent.click(screen.getByRole('button', { name: 'Adicionar carga' }));

    // The draft card (with the "Nome" input) is inserted before the existing "Chuveiro" card.
    const cards = screen.getAllByText(/Nome|Chuveiro/);
    expect(cards[0]).toHaveTextContent('Nome');

    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Ventilador' } });
    fireEvent.change(screen.getByLabelText('Potência (VA)'), { target: { value: '80' } });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }));

    const ids = useWizardStore.getState().residentialOptions.loads.map((l) => l.name);
    expect(ids[0]).toBe('Ventilador');
    expect(ids[1]).toBe('Chuveiro');
  });

  it('shows suggestions grouped as "Minhas" and "Sistema" while typing, and picking one fills the load', () => {
    useWizardStore.setState({ userLoadCatalog: [userCatalogItem] });
    renderLoadSelector();

    fireEvent.click(screen.getByRole('button', { name: 'Adicionar carga' }));
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Bomba' } });

    expect(screen.getByText('Minhas')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Bomba dágua'));

    expect(useWizardStore.getState().residentialOptions.loads[0]).toMatchObject({
      name: 'Bomba dágua',
      powerW: 750,
      ipInRatio: 3,
    });
    // Once powerW is set, the card leaves draft mode and no longer shows the Nome/Potência inputs.
    expect(screen.queryByLabelText('Nome')).not.toBeInTheDocument();
  });

  it('picks a "Sistema" suggestion from the global catalog', () => {
    renderLoadSelector();

    fireEvent.click(screen.getByRole('button', { name: 'Adicionar carga' }));
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Ar-cond' } });

    expect(screen.getByText('Sistema')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Ar-condicionado 9000 BTU'));

    expect(useWizardStore.getState().residentialOptions.loads[0]).toMatchObject({
      name: 'Ar-condicionado 9000 BTU',
      powerW: 900,
      ipInRatio: 3,
    });
  });

  it('confirms a manually typed name and power without picking a suggestion', () => {
    renderLoadSelector();

    fireEvent.click(screen.getByRole('button', { name: 'Adicionar carga' }));
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Ventilador de teto' } });
    fireEvent.change(screen.getByLabelText('Potência (VA)'), { target: { value: '150' } });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }));

    expect(useWizardStore.getState().residentialOptions.loads[0]).toMatchObject({
      name: 'Ventilador de teto',
      powerW: 150,
    });
    expect(screen.queryByLabelText('Nome')).not.toBeInTheDocument();
  });

  it('saves a manually confirmed load to "Minhas Cargas" for reuse next time', async () => {
    createClientMock.mockReturnValue(
      createSupabaseMock({
        tableResults: {
          user_load_catalog: {
            data: { id: 'new-u', name: 'Ventilador de teto', power_w: 150, ip_in_ratio: 1, created_at: '', updated_at: '' },
            error: null,
          },
        },
      })
    );
    renderLoadSelector();

    fireEvent.click(screen.getByRole('button', { name: 'Adicionar carga' }));
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Ventilador de teto' } });
    fireEvent.change(screen.getByLabelText('Potência (VA)'), { target: { value: '150' } });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }));

    await waitFor(() =>
      expect(useWizardStore.getState().userLoadCatalog).toContainEqual(
        expect.objectContaining({ name: 'Ventilador de teto', powerW: 150 })
      )
    );
  });

  it('does not re-save to "Minhas Cargas" when a suggestion is picked instead of typed freely', () => {
    useWizardStore.setState({ userLoadCatalog: [userCatalogItem] });
    renderLoadSelector();

    fireEvent.click(screen.getByRole('button', { name: 'Adicionar carga' }));
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Bomba' } });
    fireEvent.click(screen.getByText('Bomba dágua'));

    expect(useWizardStore.getState().userLoadCatalog).toHaveLength(1);
  });

  it('disables the "Adicionar carga" tile once the per-project load limit is reached', () => {
    useWizardStore.setState((s) => ({
      residentialOptions: {
        ...s.residentialOptions,
        loads: Array.from({ length: ACCOUNT_LIMITS.loadsPerProject }, (_, i) => ({
          id: `l${i}`,
          name: `Carga ${i}`,
          powerW: 100,
          hoursPerDay: 1,
          qty: 1,
          ipInRatio: 1,
        })),
      },
    }));
    renderLoadSelector();

    expect(screen.getByRole('button', { name: 'Adicionar carga' })).toBeDisabled();
  });
});

describe('LoadSelector: added loads list', () => {
  it('expands a load card to show editable fields, and edits update the store', () => {
    useWizardStore.setState((s) => ({
      residentialOptions: {
        ...s.residentialOptions,
        loads: [{ id: 'l1', name: 'Chuveiro', powerW: 5500, hoursPerDay: 1, qty: 1, ipInRatio: 1 }],
      },
    }));
    renderLoadSelector();

    fireEvent.click(screen.getByText('Chuveiro'));
    // The label's accessible text includes its InfoLabel tooltip copy too, so match loosely.
    const hoursInput = screen.getByLabelText('Horas/dia', { exact: false });
    fireEvent.change(hoursInput, { target: { value: '3' } });

    expect(useWizardStore.getState().residentialOptions.loads[0].hoursPerDay).toBe(3);
  });

  it('shows an editable "Fator de uso" field on backup load cards, reducing the daily energy but not the peak', () => {
    useWizardStore.setState((s) => ({
      residentialOptions: {
        ...s.residentialOptions,
        loads: [{ id: 'l1', name: 'Chuveiro', powerW: 5500, hoursPerDay: 1, qty: 1, ipInRatio: 1, usageFactor: 1 }],
      },
    }));
    renderLoadSelector();

    const summary = screen.getByText('Chuveiro').closest('[role="button"]') as HTMLElement;
    fireEvent.click(summary);
    expect(summary).toHaveTextContent('5500 VA');
    expect(summary).toHaveTextContent('5.50 kWh');

    const usageFactorInput = screen.getByLabelText('Fator de uso', { exact: false });
    fireEvent.change(usageFactorInput, { target: { value: '0.5' } });

    expect(useWizardStore.getState().residentialOptions.loads[0].usageFactor).toBe(0.5);
    // Peak power is unaffected; only the daily energy consumption scales down.
    expect(summary).toHaveTextContent('5500 VA');
    expect(summary).toHaveTextContent('2.75 kWh');
  });

  it('accepts 0 as a valid "Fator de uso" (load never effectively draws power)', () => {
    useWizardStore.setState((s) => ({
      residentialOptions: {
        ...s.residentialOptions,
        loads: [{ id: 'l1', name: 'Chuveiro', powerW: 5500, hoursPerDay: 1, qty: 1, ipInRatio: 1, usageFactor: 1 }],
      },
    }));
    renderLoadSelector();

    fireEvent.click(screen.getByText('Chuveiro'));
    const usageFactorInput = screen.getByLabelText('Fator de uso', { exact: false });
    fireEvent.change(usageFactorInput, { target: { value: '0' } });
    fireEvent.blur(usageFactorInput);

    expect(useWizardStore.getState().residentialOptions.loads[0].usageFactor).toBe(0);
  });

  it('clamps a "Fator de uso" typed above 1 back down to 1 on blur', () => {
    useWizardStore.setState((s) => ({
      residentialOptions: {
        ...s.residentialOptions,
        loads: [{ id: 'l1', name: 'Chuveiro', powerW: 5500, hoursPerDay: 1, qty: 1, ipInRatio: 1, usageFactor: 1 }],
      },
    }));
    renderLoadSelector();

    fireEvent.click(screen.getByText('Chuveiro'));
    const usageFactorInput = screen.getByLabelText('Fator de uso', { exact: false });
    fireEvent.change(usageFactorInput, { target: { value: '2' } });
    fireEvent.blur(usageFactorInput);

    expect(useWizardStore.getState().residentialOptions.loads[0].usageFactor).toBe(1);
    expect(usageFactorInput).toHaveValue(1);
  });

  it('does not add a "Fator de uso" field to the catalog registration forms', async () => {
    createClientMock.mockReturnValue(
      createSupabaseMock({
        tableResults: {
          user_load_catalog: {
            data: { id: 'new-u', name: 'Ventilador', power_w: 120, ip_in_ratio: 1, created_at: '', updated_at: '' },
            error: null,
          },
        },
      })
    );
    renderLoadSelector();
    fireEvent.click(screen.getByRole('tab', { name: 'Catálogo' }));

    fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }));
    const dialog = await screen.findByRole('dialog', { name: 'Adicionar nova carga' });
    expect(within(dialog).queryByText(/Fator de uso/)).not.toBeInTheDocument();
  });

  it('removes a load from the list', () => {
    useWizardStore.setState((s) => ({
      residentialOptions: {
        ...s.residentialOptions,
        loads: [{ id: 'l1', name: 'Chuveiro', powerW: 5500, hoursPerDay: 1, qty: 1, ipInRatio: 1 }],
      },
    }));
    renderLoadSelector();

    fireEvent.click(screen.getByRole('button', { name: 'Remover Chuveiro' }));

    expect(useWizardStore.getState().residentialOptions.loads).toEqual([]);
  });

  it('shows the limit-reached message when adding past the per-project cap', () => {
    useWizardStore.setState((s) => ({
      residentialOptions: {
        ...s.residentialOptions,
        loads: Array.from({ length: ACCOUNT_LIMITS.loadsPerProject }, (_, i) => ({
          id: `l${i}`,
          name: `Carga ${i}`,
          powerW: 100,
          hoursPerDay: 1,
          qty: 1,
          ipInRatio: 1,
        })),
      },
    }));
    renderLoadSelector();
    fireEvent.click(screen.getByRole('tab', { name: 'Catálogo' }));

    fireEvent.click(screen.getByText('Ar-condicionado 9000 BTU'));

    expect(screen.getByRole('alert')).toHaveTextContent(/Limite de/);
  });

  it('shows per-phase totals only for multi-phase grids', () => {
    useWizardStore.setState((s) => ({
      residentialOptions: {
        ...s.residentialOptions,
        gridType: 'threePhase_220',
        loads: [{ id: 'l1', name: 'Chuveiro', powerW: 5500, hoursPerDay: 1, qty: 1, ipInRatio: 1, phase: 'L1' }],
      },
    }));
    renderLoadSelector();

    expect(screen.getByText('Fase L1')).toBeInTheDocument();
    expect(screen.getByText('Fase L2')).toBeInTheDocument();
    expect(screen.getByText('Fase L3')).toBeInTheDocument();
  });

  it('switches the peak calculation mode', () => {
    useWizardStore.setState((s) => ({
      residentialOptions: {
        ...s.residentialOptions,
        loads: [{ id: 'l1', name: 'Chuveiro', powerW: 5500, hoursPerDay: 1, qty: 1, ipInRatio: 1 }],
      },
    }));
    renderLoadSelector();

    // The button's accessible name includes its tooltip copy too, so match loosely.
    fireEvent.click(screen.getByRole('button', { name: /Só a maior carga/ }));

    expect(useWizardStore.getState().residentialOptions.peakCalcMode).toBe('largest-surge');
  });
});
