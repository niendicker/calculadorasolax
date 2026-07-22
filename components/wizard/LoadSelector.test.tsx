// @vitest-environment jsdom

import { NextIntlClientProvider } from 'next-intl';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

    // The search field starts collapsed into an icon button, matching the
    // same SearchInput pattern used by the other app tabs.
    fireEvent.click(screen.getByRole('button', { name: 'Buscar equipamento...' }));
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

  it('adds every load from a user preset', () => {
    useWizardStore.setState({ userLoadPresets: [userPreset] });
    renderLoadSelector();
    fireEvent.click(screen.getByRole('tab', { name: /Meus presets/ }));

    fireEvent.click(screen.getByText('Meu preset').closest('button') as HTMLElement);

    expect(useWizardStore.getState().residentialOptions.loads).toHaveLength(1);
    expect(useWizardStore.getState().residentialOptions.loads[0]).toMatchObject({ name: 'Bomba', powerW: 750 });
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

  it('shows a generic error, edits the description, and cancels out of the save-preset form', async () => {
    createClientMock.mockReturnValue(
      createSupabaseMock({
        tableResults: { user_load_presets: { data: null, error: { message: 'network down' } } },
      })
    );
    useWizardStore.setState((s) => ({
      residentialOptions: { ...s.residentialOptions, loads: [{ id: 'l1', name: 'X', powerW: 100, hoursPerDay: 1, qty: 1, ipInRatio: 1 }] },
    }));
    renderLoadSelector();
    fireEvent.click(screen.getByRole('tab', { name: /Meus presets/ }));
    fireEvent.click(screen.getByRole('button', { name: /Salvar cargas atuais como preset/ }));

    fireEvent.change(screen.getByLabelText('Nome do preset'), { target: { value: 'Meu preset' } });
    fireEvent.change(screen.getByLabelText('Descrição do preset'), { target: { value: 'Uso diário' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('Não foi possível salvar o preset. Tente novamente.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByLabelText('Nome do preset')).not.toBeInTheDocument();
  });

  it('re-clicking the already-active Presets and Presets do sistema tabs is a no-op', () => {
    renderLoadSelector();
    fireEvent.click(screen.getByRole('tab', { name: 'Presets' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Presets do sistema' }));
    expect(screen.getByText('Residencial essencial')).toBeInTheDocument();
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

    fireEvent.click(screen.getByRole('button', { name: 'Buscar equipamento...' }));
    fireEvent.change(screen.getByPlaceholderText('Buscar equipamento...'), { target: { value: 'chuveiro' } });

    expect(screen.getByText('Chuveiro elétrico')).toBeInTheDocument();
    expect(screen.queryByText('Ar-condicionado 9000 BTU')).not.toBeInTheDocument();
  });

  it('filters the catalog by category, also hiding personal items while a specific category chip is active', () => {
    useWizardStore.setState({
      loadCatalog: [catalogItem, { ...catalogItem, id: 'c2', namePt: 'Chuveiro elétrico', category: 'heating' }],
      userLoadCatalog: [userCatalogItem],
    });
    renderLoadSelector();
    fireEvent.click(screen.getByRole('tab', { name: 'Catálogo' }));

    fireEvent.click(screen.getByRole('button', { name: 'heating' }));

    expect(screen.getByText('Chuveiro elétrico')).toBeInTheDocument();
    expect(screen.queryByText('Ar-condicionado 9000 BTU')).not.toBeInTheDocument();
    // A specific (non-"Minhas") category chip hides personal items too.
    expect(screen.queryByText('Bomba dágua')).not.toBeInTheDocument();

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

  it('edits the name and IP/IN of a user catalog item, and cancels out of the edit view', async () => {
    createClientMock.mockReturnValue(
      createSupabaseMock({ tableResults: { user_load_catalog: { data: null, error: null } } })
    );
    useWizardStore.setState({ userLoadCatalog: [userCatalogItem] });
    renderLoadSelector();
    fireEvent.click(screen.getByRole('tab', { name: 'Catálogo' }));

    fireEvent.click(screen.getByRole('button', { name: 'Opções de Bomba dágua' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Editar' }));

    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Bomba renomeada' } });
    fireEvent.change(screen.getByLabelText('IP/IN'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(useWizardStore.getState().userLoadCatalog[0]).toMatchObject({ name: 'Bomba renomeada', ipInRatio: 2 }));

    // Re-open, switch to edit, then cancel — no further change is made.
    fireEvent.click(screen.getByRole('button', { name: /Opções de Bomba/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Editar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByLabelText('Nome')).not.toBeInTheDocument();
  });

  it('cancels out of the delete-confirmation view without removing the item', async () => {
    useWizardStore.setState({ userLoadCatalog: [userCatalogItem] });
    renderLoadSelector();
    fireEvent.click(screen.getByRole('tab', { name: 'Catálogo' }));

    fireEvent.click(screen.getByRole('button', { name: 'Opções de Bomba dágua' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Excluir' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(screen.queryByText('Remover carga?')).not.toBeInTheDocument();
    expect(useWizardStore.getState().userLoadCatalog).toHaveLength(1);
  });

  it('closes the menu on Escape and on an outside click', async () => {
    useWizardStore.setState({ userLoadCatalog: [userCatalogItem] });
    renderLoadSelector();
    fireEvent.click(screen.getByRole('tab', { name: 'Catálogo' }));

    fireEvent.click(screen.getByRole('button', { name: 'Opções de Bomba dágua' }));
    expect(await screen.findByRole('dialog', { name: 'Opções de Bomba dágua' })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Opções de Bomba dágua' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Opções de Bomba dágua' }));
    expect(await screen.findByRole('dialog', { name: 'Opções de Bomba dágua' })).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('dialog', { name: 'Opções de Bomba dágua' })).not.toBeInTheDocument();
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

  it('lets arrow keys move the highlight across suggestions, and Enter picks the highlighted one', () => {
    useWizardStore.setState({
      userLoadCatalog: [
        userCatalogItem,
        { id: 'u2', name: 'Bomba grande', powerW: 1500, ipInRatio: 2, createdAt: '', updatedAt: '' },
      ],
    });
    renderLoadSelector();

    fireEvent.click(screen.getByRole('button', { name: 'Adicionar carga' }));
    const nameInput = screen.getByLabelText('Nome');
    fireEvent.change(nameInput, { target: { value: 'Bomba' } });

    expect(screen.getByText('Bomba dágua')).toBeInTheDocument();
    expect(screen.getByText('Bomba grande')).toBeInTheDocument();

    fireEvent.keyDown(nameInput, { key: 'ArrowDown' });
    fireEvent.keyDown(nameInput, { key: 'ArrowDown' });
    fireEvent.keyDown(nameInput, { key: 'Enter' });

    expect(useWizardStore.getState().residentialOptions.loads[0]).toMatchObject({
      name: 'Bomba grande',
      powerW: 1500,
      ipInRatio: 2,
    });
  });

  it('wraps the highlight from the first suggestion back to the last on ArrowUp', () => {
    useWizardStore.setState({
      userLoadCatalog: [
        userCatalogItem,
        { id: 'u2', name: 'Bomba grande', powerW: 1500, ipInRatio: 2, createdAt: '', updatedAt: '' },
      ],
    });
    renderLoadSelector();

    fireEvent.click(screen.getByRole('button', { name: 'Adicionar carga' }));
    const nameInput = screen.getByLabelText('Nome');
    fireEvent.change(nameInput, { target: { value: 'Bomba' } });

    fireEvent.keyDown(nameInput, { key: 'ArrowUp' });
    fireEvent.keyDown(nameInput, { key: 'Enter' });

    expect(useWizardStore.getState().residentialOptions.loads[0]).toMatchObject({
      name: 'Bomba grande',
      powerW: 1500,
    });
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

  it('filtering by a phase also shows loads only wired via phase2', () => {
    useWizardStore.setState((s) => ({
      residentialOptions: {
        ...s.residentialOptions,
        gridType: 'threePhase_220',
        loads: [{ id: 'l1', name: 'Forno', powerW: 2200, hoursPerDay: 1, qty: 1, ipInRatio: 1, phase: 'L1', phase2: 'L2' }],
      },
    }));
    renderLoadSelector();

    fireEvent.click(screen.getByRole('button', { name: /^Fase L2/ }));
    expect(screen.getByText('Forno')).toBeInTheDocument();
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

  it('shows "Adicionar carga" on a phase-filtered tab too, connecting the new load to that phase', () => {
    // threePhase_380: a default mono load (220V) doesn't need a phase pair
    // (that only kicks in at 220V phase-to-phase on split/threePhase_220),
    // so the new load's single phase isn't overridden by that separate rule.
    useWizardStore.setState((s) => ({
      residentialOptions: {
        ...s.residentialOptions,
        gridType: 'threePhase_380',
        loads: [{ id: 'l1', name: 'Chuveiro', powerW: 5500, hoursPerDay: 1, qty: 1, ipInRatio: 1, phase: 'L1' }],
      },
    }));
    renderLoadSelector();

    const phaseL2Button = screen.getByRole('button', { name: /Fase L2/ });
    fireEvent.click(phaseL2Button);
    expect(phaseL2Button).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Adicionar carga' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Adicionar carga' }));

    const newLoad = useWizardStore
      .getState()
      .residentialOptions.loads.find((load) => load.id !== 'l1');
    expect(newLoad).toMatchObject({ phase: 'L2' });
  });

  it('edits voltage, mono/trifásica, phase pair, individual phase and includedInPeak on a three-phase load, plus the remaining numeric fields', () => {
    useWizardStore.setState((s) => ({
      residentialOptions: {
        ...s.residentialOptions,
        gridType: 'threePhase_220',
        peakCalcMode: 'select',
        loads: [{ id: 'l1', name: 'Chuveiro', powerW: 5500, hoursPerDay: 1, qty: 1, ipInRatio: 1 }],
      },
    }));
    renderLoadSelector();
    fireEvent.click(screen.getByText('Chuveiro'));

    // Default voltage (220V) on a threePhase_220 grid needs two phases — the
    // "L1-L2" style pair buttons render; picking one updates phase/phase2.
    fireEvent.click(screen.getByRole('button', { name: 'L2-L3' }));
    expect(useWizardStore.getState().residentialOptions.loads[0]).toMatchObject({ phase: 'L2', phase2: 'L3' });

    // Switching to 110V no longer needs two phases — individual L1/L2/L3 buttons render instead.
    fireEvent.click(screen.getByRole('button', { name: '110V' }));
    expect(useWizardStore.getState().residentialOptions.loads[0].voltageV).toBe(110);
    fireEvent.click(screen.getByRole('button', { name: 'L3' }));
    expect(useWizardStore.getState().residentialOptions.loads[0]).toMatchObject({ phase: 'L3', phase2: null });

    // Back to 220V, then to Trifásica — voltage gets forced to the phase-to-phase value and phase2 clears again.
    fireEvent.click(screen.getByRole('button', { name: '220V' }));
    fireEvent.click(screen.getByRole('button', { name: 'Trifásica' }));
    expect(useWizardStore.getState().residentialOptions.loads[0].phaseType).toBe('trifasica');

    fireEvent.click(screen.getByRole('button', { name: 'Mono' }));
    expect(useWizardStore.getState().residentialOptions.loads[0].phaseType).toBe('mono');

    // Toggle "incluída na máxima".
    const includedButton = screen.getByLabelText(/Contar Chuveiro na potência máxima|Não contar Chuveiro na potência máxima/);
    const wasIncluded = includedButton.getAttribute('aria-pressed') === 'true';
    fireEvent.click(includedButton);
    expect(useWizardStore.getState().residentialOptions.loads[0].includedInPeak).toBe(!wasIncluded);

    // Quantidade and IP/IN fields, plus their clear/revert behavior.
    const qtyInput = screen.getByLabelText('Quantidade', { exact: false });
    fireEvent.change(qtyInput, { target: { value: '2' } });
    expect(useWizardStore.getState().residentialOptions.loads[0].qty).toBe(2);
    fireEvent.change(qtyInput, { target: { value: '' } });
    fireEvent.blur(qtyInput);
    expect(qtyInput).toHaveValue(2);

    const ipInInput = screen.getByLabelText('IP/IN', { exact: false });
    fireEvent.change(ipInInput, { target: { value: '2.5' } });
    expect(useWizardStore.getState().residentialOptions.loads[0].ipInRatio).toBe(2.5);
  });

  it('drags a mono load onto a phase tile to connect it, splitting a two-phase load across the dropped phase and the other one', () => {
    useWizardStore.setState((s) => ({
      residentialOptions: {
        ...s.residentialOptions,
        gridType: 'threePhase_220',
        loads: [
          // 110V doesn't need a phase-to-phase (two-phase) hookup on this grid,
          // so this load stays single-phase instead of the phase2-pairing
          // effect auto-assigning it a second phase.
          { id: 'l1', name: 'Chuveiro', powerW: 5500, hoursPerDay: 1, qty: 1, ipInRatio: 1, phase: 'L1', voltageV: 110 },
          { id: 'l2', name: 'Forno', powerW: 2200, hoursPerDay: 1, qty: 1, ipInRatio: 1, phase: 'L1', phase2: 'L2' },
        ],
      },
    }));
    renderLoadSelector();

    const phaseL3 = screen.getByRole('button', { name: /Fase L3/ });
    const dataTransfer = { getData: () => 'l1', setData: vi.fn(), effectAllowed: '' };
    fireEvent.dragOver(phaseL3, { dataTransfer });
    fireEvent.dragLeave(phaseL3, { dataTransfer });
    fireEvent.dragOver(phaseL3, { dataTransfer });
    fireEvent.drop(phaseL3, { dataTransfer });

    expect(useWizardStore.getState().residentialOptions.loads.find((l) => l.id === 'l1')).toMatchObject({ phase: 'L3' });

    // A two-phase load (phase2 set) dropped onto a tile is rewired to that
    // phase plus whichever other phase isn't the drop target.
    const dataTransfer2 = { getData: () => 'l2', setData: vi.fn(), effectAllowed: '' };
    fireEvent.drop(phaseL3, { dataTransfer: dataTransfer2 });
    const forno = useWizardStore.getState().residentialOptions.loads.find((l) => l.id === 'l2');
    expect(forno?.phase).toBe('L3');
    expect(forno?.phase2).not.toBe('L3');

    // Dropping an unknown/missing load id is a no-op.
    const dataTransfer3 = { getData: () => 'ghost-id', setData: vi.fn(), effectAllowed: '' };
    fireEvent.drop(phaseL3, { dataTransfer: dataTransfer3 });

    fireEvent.click(screen.getByRole('button', { name: /^Todas/ }));
  });

  it('clears and blur-reverts hours, qty, IP/IN and Fator de uso', () => {
    useWizardStore.setState((s) => ({
      residentialOptions: {
        ...s.residentialOptions,
        loads: [{ id: 'l1', name: 'Chuveiro', powerW: 5500, hoursPerDay: 3, qty: 2, ipInRatio: 1.5, usageFactor: 1 }],
      },
    }));
    renderLoadSelector();
    fireEvent.click(screen.getByText('Chuveiro'));

    const hoursInput = screen.getByLabelText('Horas/dia', { exact: false });
    fireEvent.change(hoursInput, { target: { value: 'abc' } });
    fireEvent.blur(hoursInput);
    expect(hoursInput).toHaveValue(3);

    const usageFactorInput = screen.getByLabelText('Fator de uso', { exact: false });
    fireEvent.change(usageFactorInput, { target: { value: '' } });
    fireEvent.blur(usageFactorInput);
    expect(usageFactorInput).toHaveValue(1);

    const ipInInput = screen.getByLabelText('IP/IN', { exact: false });
    fireEvent.change(ipInInput, { target: { value: 'nope' } });
    fireEvent.blur(ipInInput);
    expect(ipInInput).toHaveValue(1.5);

    // Every clear ("x") button appears once each of these fields has a value;
    // a real mousedown always precedes the click that fires it.
    for (const clearButton of screen.getAllByRole('button', { name: 'Limpar campo' })) {
      fireEvent.mouseDown(clearButton);
      fireEvent.click(clearButton);
    }
    expect(hoursInput).toHaveValue(null);
  });

  it('expands/collapses a load card via keyboard, and drag-starts it when eligible for phase drag', () => {
    useWizardStore.setState((s) => ({
      residentialOptions: {
        ...s.residentialOptions,
        gridType: 'threePhase_220',
        loads: [{ id: 'l1', name: 'Chuveiro', powerW: 5500, hoursPerDay: 1, qty: 1, ipInRatio: 1, voltageV: 110 }],
      },
    }));
    renderLoadSelector();

    const summary = screen.getByText('Chuveiro').closest('[role="button"]') as HTMLElement;
    fireEvent.keyDown(summary, { key: 'Enter' });
    expect(summary).toHaveAttribute('aria-expanded', 'true');
    fireEvent.keyDown(summary, { key: ' ' });
    expect(summary).toHaveAttribute('aria-expanded', 'false');
    fireEvent.keyDown(summary, { key: 'Tab' });
    expect(summary).toHaveAttribute('aria-expanded', 'false');

    const card = summary.closest('.cursor-grab') as HTMLElement;
    const dataTransfer = { setData: vi.fn(), setDragImage: vi.fn(), effectAllowed: '' };
    fireEvent.dragStart(card, { dataTransfer });
    expect(dataTransfer.setData).toHaveBeenCalledWith('text/plain', 'l1');
  });

  it('pressing Enter in the draft power field with no name typed does nothing, but confirms once a name is present', () => {
    renderLoadSelector();
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar carga' }));

    const powerInput = screen.getByLabelText('Potência (VA)');
    fireEvent.keyDown(powerInput, { key: 'Enter' });
    expect(useWizardStore.getState().residentialOptions.loads[0].powerW).toBe(0);

    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Ventilador' } });
    fireEvent.change(powerInput, { target: { value: '150' } });
    fireEvent.keyDown(powerInput, { key: 'Enter' });

    expect(useWizardStore.getState().residentialOptions.loads[0]).toMatchObject({ name: 'Ventilador', powerW: 150 });
  });

  it('self-corrects invalid phase/voltage combinations on mount for loads loaded from a saved project', () => {
    useWizardStore.setState((s) => ({
      residentialOptions: {
        ...s.residentialOptions,
        gridType: 'singlePhase_220',
        // Data that could only have arrived from an import/edit outside this UI:
        // trifásica on a 1-phase grid, and a mono 380V load left over from a
        // grid-type change away from threePhase_380.
        loads: [{ id: 'l1', name: 'Trifásica órfã', powerW: 1000, hoursPerDay: 1, qty: 1, ipInRatio: 1, phaseType: 'trifasica' }],
      },
    }));
    renderLoadSelector();

    expect(useWizardStore.getState().residentialOptions.loads[0].phaseType).toBe('mono');
  });

  it('resets voltage to the phase-to-phase value when a trifásica load is loaded with an incompatible voltage', () => {
    useWizardStore.setState((s) => ({
      residentialOptions: {
        ...s.residentialOptions,
        gridType: 'threePhase_220',
        loads: [{ id: 'l1', name: 'Trifásica 110V', powerW: 1000, hoursPerDay: 1, qty: 1, ipInRatio: 1, phaseType: 'trifasica', voltageV: 110 }],
      },
    }));
    renderLoadSelector();

    expect(useWizardStore.getState().residentialOptions.loads[0].voltageV).toBe(220);
  });

  it('resets a 380V mono load down to 220V when loaded on a threePhase_380 grid', () => {
    useWizardStore.setState((s) => ({
      residentialOptions: {
        ...s.residentialOptions,
        gridType: 'threePhase_380',
        loads: [{ id: 'l1', name: 'Mono 380V', powerW: 1000, hoursPerDay: 1, qty: 1, ipInRatio: 1, phaseType: 'mono', voltageV: 380 }],
      },
    }));
    renderLoadSelector();

    expect(useWizardStore.getState().residentialOptions.loads[0].voltageV).toBe(220);
  });

  it('searches within the "Minhas" catalog filter', () => {
    useWizardStore.setState({
      userLoadCatalog: [userCatalogItem, { ...userCatalogItem, id: 'u2', name: 'Ventilador de mesa' }],
    });
    renderLoadSelector();
    fireEvent.click(screen.getByRole('tab', { name: 'Catálogo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Minhas' }));

    fireEvent.click(screen.getByRole('button', { name: 'Buscar equipamento...' }));
    fireEvent.change(screen.getByPlaceholderText('Buscar equipamento...'), { target: { value: 'ventilador' } });

    expect(screen.getByText('Ventilador de mesa')).toBeInTheDocument();
    expect(screen.queryByText('Bomba dágua')).not.toBeInTheDocument();
  });

  it('removes a blank draft card via its own trash button', () => {
    renderLoadSelector();
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar carga' }));
    expect(useWizardStore.getState().residentialOptions.loads).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Remover carga em branco' }));
    expect(useWizardStore.getState().residentialOptions.loads).toHaveLength(0);
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
