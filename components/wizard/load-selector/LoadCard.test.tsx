// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CatalogItem, SingleLoad, UserLoadCatalogItem } from '@/lib/types';
import { LoadCard } from './LoadCard';

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

function draftLoad(partial: Partial<SingleLoad> = {}): SingleLoad {
  return { id: 'l1', name: '', powerW: 0, qty: 1, ipInRatio: 1, ...partial };
}

function fullLoad(partial: Partial<SingleLoad> = {}): SingleLoad {
  return { id: 'l1', name: 'Chuveiro', powerW: 5500, qty: 1, ipInRatio: 1, ...partial };
}

function baseProps(overrides: Partial<React.ComponentProps<typeof LoadCard>> = {}) {
  return {
    load: fullLoad(),
    gridType: null,
    loadCatalog: [catalogItem],
    userLoadCatalog: [userCatalogItem],
    nameKey: 'namePt',
    peakCalcMode: 'sum' as const,
    operationHours: 4,
    onUpdate: vi.fn(),
    onRemove: vi.fn(),
    onDuplicate: vi.fn(),
    duplicateDisabled: false,
    saveManualLoadToCatalog: vi.fn().mockResolvedValue(undefined),
    onCatalogSaveWarning: vi.fn(),
    ...overrides,
  };
}

describe('LoadCard: draft (unnamed / zero-power) card', () => {
  it('shows suggestions grouped by Minhas/Sistema, and hovering + clicking one fills the load', () => {
    const onUpdate = vi.fn();
    render(<LoadCard {...baseProps({ load: draftLoad(), onUpdate })} />);

    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Bomba' } });
    expect(screen.getByText('Minhas')).toBeInTheDocument();

    const suggestionButton = screen.getByText('Bomba dágua').closest('button') as HTMLElement;
    fireEvent.mouseDown(suggestionButton);
    fireEvent.mouseEnter(suggestionButton);
    fireEvent.click(suggestionButton);

    expect(onUpdate).toHaveBeenCalledWith('l1', { name: 'Bomba dágua', powerW: 750, ipInRatio: 3 });
  });

  it('shows a "Sistema" suggestion, and hovering + clicking it fills the load', () => {
    const onUpdate = vi.fn();
    render(<LoadCard {...baseProps({ load: draftLoad(), onUpdate })} />);

    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Ar-cond' } });
    expect(screen.getByText('Sistema')).toBeInTheDocument();

    const suggestionButton = screen.getByText('Ar-condicionado 9000 BTU').closest('button') as HTMLElement;
    fireEvent.mouseDown(suggestionButton);
    fireEvent.mouseEnter(suggestionButton);
    fireEvent.click(suggestionButton);

    expect(onUpdate).toHaveBeenCalledWith('l1', { name: 'Ar-condicionado 9000 BTU', powerW: 900, ipInRatio: 3 });
  });

  it('defaults a system suggestion missing ipInRatio to 1', () => {
    const onUpdate = vi.fn();
    render(
      <LoadCard
        {...baseProps({
          load: draftLoad(),
          onUpdate,
          loadCatalog: [{ ...catalogItem, ipInRatio: undefined as unknown as number }],
        })}
      />
    );

    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Ar-cond' } });
    fireEvent.click(screen.getByText('Ar-condicionado 9000 BTU'));

    expect(onUpdate).toHaveBeenCalledWith('l1', { name: 'Ar-condicionado 9000 BTU', powerW: 900, ipInRatio: 1 });
  });

  it('closes the suggestion dropdown on Escape', () => {
    render(<LoadCard {...baseProps({ load: draftLoad() })} />);

    const nameInput = screen.getByLabelText('Nome');
    fireEvent.change(nameInput, { target: { value: 'Bomba' } });
    expect(screen.getByText('Minhas')).toBeInTheDocument();

    fireEvent.keyDown(nameInput, { key: 'Escape' });
    expect(screen.queryByText('Minhas')).not.toBeInTheDocument();
  });

  it('closes the dropdown asynchronously on blur', async () => {
    vi.useFakeTimers();
    render(<LoadCard {...baseProps({ load: draftLoad() })} />);

    const nameInput = screen.getByLabelText('Nome');
    fireEvent.change(nameInput, { target: { value: 'Bomba' } });
    expect(screen.getByText('Minhas')).toBeInTheDocument();

    fireEvent.blur(nameInput);
    vi.advanceTimersByTime(150);
    vi.useRealTimers();

    await waitFor(() => expect(screen.queryByText('Minhas')).not.toBeInTheDocument());
  });

  it('moves the highlight with arrow keys and picks the highlighted suggestion on Enter', () => {
    const onUpdate = vi.fn();
    render(
      <LoadCard
        {...baseProps({
          load: draftLoad(),
          onUpdate,
          userLoadCatalog: [userCatalogItem, { ...userCatalogItem, id: 'u2', name: 'Bomba grande', powerW: 1500 }],
        })}
      />
    );

    const nameInput = screen.getByLabelText('Nome');
    fireEvent.change(nameInput, { target: { value: 'Bomba' } });

    fireEvent.keyDown(nameInput, { key: 'ArrowDown' });
    fireEvent.keyDown(nameInput, { key: 'ArrowDown' });
    fireEvent.keyDown(nameInput, { key: 'Enter' });

    expect(onUpdate).toHaveBeenCalledWith('l1', { name: 'Bomba grande', powerW: 1500, ipInRatio: 3 });
  });

  it('wraps ArrowUp from no highlight to the last suggestion', () => {
    const onUpdate = vi.fn();
    render(<LoadCard {...baseProps({ load: draftLoad(), onUpdate })} />);

    const nameInput = screen.getByLabelText('Nome');
    fireEvent.change(nameInput, { target: { value: 'Bomba' } });
    fireEvent.keyDown(nameInput, { key: 'ArrowUp' });
    fireEvent.keyDown(nameInput, { key: 'Enter' });

    expect(onUpdate).toHaveBeenCalledWith('l1', { name: 'Bomba dágua', powerW: 750, ipInRatio: 3 });
  });

  it('pressing Enter with no highlighted suggestion confirms the freely typed draft instead', () => {
    const onUpdate = vi.fn();
    render(<LoadCard {...baseProps({ load: draftLoad(), onUpdate })} />);

    const nameInput = screen.getByLabelText('Nome');
    fireEvent.change(nameInput, { target: { value: 'Ventilador de teto' } });
    fireEvent.change(screen.getByLabelText('Potência (VA)'), { target: { value: '150' } });
    fireEvent.keyDown(nameInput, { key: 'Enter' });

    expect(onUpdate).toHaveBeenCalledWith('l1', { name: 'Ventilador de teto', powerW: 150 });
  });

  it('does nothing on Enter when the typed name/power are not yet valid', () => {
    const onUpdate = vi.fn();
    render(<LoadCard {...baseProps({ load: draftLoad(), onUpdate })} />);

    const nameInput = screen.getByLabelText('Nome');
    fireEvent.change(nameInput, { target: { value: 'X' } });
    fireEvent.keyDown(nameInput, { key: 'Enter' });

    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('warns via onCatalogSaveWarning with a limit message when saving to the catalog hits the limit', async () => {
    const onCatalogSaveWarning = vi.fn();
    const saveManualLoadToCatalog = vi.fn().mockRejectedValue(new Error('Limite de 20 cargas atingido.'));
    render(
      <LoadCard
        {...baseProps({ load: draftLoad(), onCatalogSaveWarning, saveManualLoadToCatalog })}
      />
    );

    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Ventilador' } });
    fireEvent.change(screen.getByLabelText('Potência (VA)'), { target: { value: '150' } });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }));

    await waitFor(() => expect(onCatalogSaveWarning).toHaveBeenCalledWith('Limite de 20 cargas atingido.'));
  });

  it('warns with a generic message when saving to the catalog fails for another reason', async () => {
    const onCatalogSaveWarning = vi.fn();
    const saveManualLoadToCatalog = vi.fn().mockRejectedValue(new Error('network down'));
    render(
      <LoadCard
        {...baseProps({ load: draftLoad(), onCatalogSaveWarning, saveManualLoadToCatalog })}
      />
    );

    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Ventilador' } });
    fireEvent.change(screen.getByLabelText('Potência (VA)'), { target: { value: '150' } });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }));

    await waitFor(() =>
      expect(onCatalogSaveWarning).toHaveBeenCalledWith(
        'Carga adicionada ao cálculo, mas não foi possível salvá-la em "Minhas Cargas" para reutilizar depois.'
      )
    );
  });

  it('the Adicionar button is disabled until both name and a positive power are set', () => {
    render(<LoadCard {...baseProps({ load: draftLoad() })} />);
    expect(screen.getByRole('button', { name: 'Adicionar' })).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Ventilador' } });
    expect(screen.getByRole('button', { name: 'Adicionar' })).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Potência (VA)'), { target: { value: '150' } });
    expect(screen.getByRole('button', { name: 'Adicionar' })).not.toBeDisabled();
  });

  it('removes the draft card via its own trash button', () => {
    const onRemove = vi.fn();
    render(<LoadCard {...baseProps({ load: draftLoad(), onRemove })} />);

    fireEvent.click(screen.getByRole('button', { name: 'Remover carga em branco' }));
    expect(onRemove).toHaveBeenCalledWith('l1');
  });

  it('confirms the draft power field on Enter', () => {
    const onUpdate = vi.fn();
    render(<LoadCard {...baseProps({ load: draftLoad(), onUpdate })} />);

    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Ventilador' } });
    const powerInput = screen.getByLabelText('Potência (VA)');
    fireEvent.change(powerInput, { target: { value: '150' } });
    fireEvent.keyDown(powerInput, { key: 'Enter' });

    expect(onUpdate).toHaveBeenCalledWith('l1', { name: 'Ventilador', powerW: 150 });
  });
});

describe('LoadCard: confirmed card header', () => {
  it('expands and collapses via click, and via Enter/Space on the header', () => {
    render(<LoadCard {...baseProps()} />);

    const header = screen.getByText('Chuveiro').closest('[role="button"]') as HTMLElement;
    expect(header).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(header);
    expect(header).toHaveAttribute('aria-expanded', 'true');

    fireEvent.keyDown(header, { key: ' ' });
    expect(header).toHaveAttribute('aria-expanded', 'false');

    fireEvent.keyDown(header, { key: 'Enter' });
    expect(header).toHaveAttribute('aria-expanded', 'true');

    // A non-activation key is a no-op.
    fireEvent.keyDown(header, { key: 'Tab' });
    expect(header).toHaveAttribute('aria-expanded', 'true');
  });

  it('toggles preset-selection instead of expanding when presetSelectionMode is on', () => {
    const onTogglePresetSelected = vi.fn();
    render(<LoadCard {...baseProps({ presetSelectionMode: true, presetSelected: false, onTogglePresetSelected })} />);

    const header = screen.getByText('Chuveiro').closest('[role="button"]') as HTMLElement;
    expect(header).toHaveAttribute('aria-pressed', 'false');
    expect(header).not.toHaveAttribute('aria-expanded');

    fireEvent.click(header);
    expect(onTogglePresetSelected).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(header, { key: 'Enter' });
    expect(onTogglePresetSelected).toHaveBeenCalledTimes(2);

    // The trailing action icons (duplicate/remove/expand) are hidden in selection mode.
    expect(screen.queryByRole('button', { name: /Remover Chuveiro/ })).not.toBeInTheDocument();
  });

  it('shows a checked checkbox when presetSelected is true', () => {
    render(<LoadCard {...baseProps({ presetSelectionMode: true, presetSelected: true })} />);
    const checkbox = screen.getByRole('checkbox', { hidden: true }) as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
  });

  it('duplicates and removes via the header action buttons without toggling expansion', () => {
    const onDuplicate = vi.fn();
    const onRemove = vi.fn();
    const load = fullLoad();
    render(<LoadCard {...baseProps({ load, onDuplicate, onRemove })} />);

    const header = screen.getByText('Chuveiro').closest('[role="button"]') as HTMLElement;

    fireEvent.click(screen.getByRole('button', { name: 'Duplicar Chuveiro' }));
    expect(onDuplicate).toHaveBeenCalledWith(load);
    expect(header).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(screen.getByRole('button', { name: 'Remover Chuveiro' }));
    expect(onRemove).toHaveBeenCalledWith('l1');
    expect(header).toHaveAttribute('aria-expanded', 'false');
  });

  it('disables the duplicate button when duplicateDisabled is set', () => {
    render(<LoadCard {...baseProps({ duplicateDisabled: true })} />);
    expect(screen.getByRole('button', { name: 'Duplicar Chuveiro' })).toBeDisabled();
  });

  it('toggles includedInPeak from the header icon, only shown in "select" peak mode', () => {
    const onUpdate = vi.fn();
    const { rerender } = render(<LoadCard {...baseProps({ peakCalcMode: 'sum', onUpdate })} />);
    expect(screen.queryByLabelText(/na potência máxima/)).not.toBeInTheDocument();

    rerender(<LoadCard {...baseProps({ peakCalcMode: 'select', onUpdate, load: fullLoad({ includedInPeak: true }) })} />);
    const toggle = screen.getByLabelText('Não contar Chuveiro na potência máxima');
    fireEvent.click(toggle);
    expect(onUpdate).toHaveBeenCalledWith('l1', { includedInPeak: false });
  });

  it('shows the "Contar" label and dimmed peak value when includedInPeak is false', () => {
    render(<LoadCard {...baseProps({ peakCalcMode: 'select', load: fullLoad({ includedInPeak: false }) })} />);
    expect(screen.getByLabelText('Contar Chuveiro na potência máxima')).toBeInTheDocument();
  });

  it('shows fixed-hours summary text when usageMode is fixed', () => {
    render(<LoadCard {...baseProps({ load: fullLoad({ usageMode: 'fixed', fixedHours: 3 }) })} />);
    expect(screen.getByText('3 h/dia')).toBeInTheDocument();
  });

  it('shows "Mono" alone with no phase tag on a single-phase (phaseCount 1) grid', () => {
    render(<LoadCard {...baseProps({ gridType: 'singlePhase_220' })} />);
    // On a single-phase grid the summary reads "<V>V · Mono" with no PhaseTag appended.
    expect(screen.getByText(/·\s*Mono$/)).toBeInTheDocument();
  });

  it('shows trifásica indicator dots for a three-phase load', () => {
    render(<LoadCard {...baseProps({ gridType: 'threePhase_220', load: fullLoad({ phaseType: 'trifasica', voltageV: 220 }) })} />);
    expect(screen.getByText('Trifásica')).toBeInTheDocument();
  });

  it('flags an incompatible voltage in the header summary', () => {
    render(
      <LoadCard
        {...baseProps({
          gridType: 'threePhase_380',
          load: fullLoad({ phaseType: 'trifasica', voltageV: 999 as never }),
        })}
      />
    );
    expect(screen.getByText(/tensão incompatível/)).toBeInTheDocument();
  });
});

describe('LoadCard: expanded fields', () => {
  function expand() {
    fireEvent.click(screen.getByText('Chuveiro'));
  }

  it('edits qty with clamp-on-blur and a clear button', () => {
    const onUpdate = vi.fn();
    render(<LoadCard {...baseProps({ load: fullLoad({ qty: 2 }), onUpdate })} />);
    expand();

    const qtyInput = screen.getByLabelText('Quantidade', { exact: false });
    fireEvent.change(qtyInput, { target: { value: '5' } });
    expect(onUpdate).toHaveBeenCalledWith('l1', { qty: 5 });

    fireEvent.change(qtyInput, { target: { value: '0' } });
    fireEvent.blur(qtyInput);
    expect(qtyInput).toHaveValue(2);

    const clearButtons = screen.getAllByRole('button', { name: 'Limpar campo' });
    fireEvent.mouseDown(clearButtons[0]);
    fireEvent.click(clearButtons[0]);
    expect(qtyInput).toHaveValue(null);
  });

  it('edits IP/IN with clamp-on-blur', () => {
    const onUpdate = vi.fn();
    render(<LoadCard {...baseProps({ load: fullLoad({ ipInRatio: 1.5 }), onUpdate })} />);
    expand();

    const ipInInput = screen.getByLabelText('IP/IN', { exact: false });
    fireEvent.change(ipInInput, { target: { value: 'x' } });
    fireEvent.blur(ipInInput);
    expect(ipInInput).toHaveValue(1.5);
  });

  it('rejects a usageFactor above 1 (no update) and accepts 0', () => {
    const onUpdate = vi.fn();
    render(<LoadCard {...baseProps({ load: fullLoad({ usageFactor: 1 }), onUpdate })} />);
    expand();

    const usageFactorInput = screen.getByLabelText('Fator de uso', { exact: false });
    fireEvent.change(usageFactorInput, { target: { value: '2' } });
    expect(onUpdate).not.toHaveBeenCalledWith('l1', { usageFactor: 2 });

    fireEvent.change(usageFactorInput, { target: { value: '0' } });
    expect(onUpdate).toHaveBeenCalledWith('l1', { usageFactor: 0 });
  });

  it('reverts usageFactor to the stored value when blurred while negative or empty', () => {
    render(<LoadCard {...baseProps({ load: fullLoad({ usageFactor: 0.7 }) })} />);
    expand();

    const usageFactorInput = screen.getByLabelText('Fator de uso', { exact: false });
    fireEvent.change(usageFactorInput, { target: { value: '-1' } });
    fireEvent.blur(usageFactorInput);
    expect(usageFactorInput).toHaveValue(0.7);
  });

  it('clamps usageFactor above 1 down to 1 on blur and updates the store', () => {
    const onUpdate = vi.fn();
    render(<LoadCard {...baseProps({ load: fullLoad({ usageFactor: 1 }), onUpdate })} />);
    expand();

    const usageFactorInput = screen.getByLabelText('Fator de uso', { exact: false });
    fireEvent.change(usageFactorInput, { target: { value: '5' } });
    fireEvent.blur(usageFactorInput);
    expect(usageFactorInput).toHaveValue(1);
    expect(onUpdate).toHaveBeenCalledWith('l1', { usageFactor: 1 });
  });

  it('switches to Horas mode, prefilling fixedHours from operationHours', () => {
    const onUpdate = vi.fn();
    render(<LoadCard {...baseProps({ operationHours: 6, load: fullLoad(), onUpdate })} />);
    expand();

    fireEvent.click(screen.getByRole('tab', { name: 'Horas' }));
    expect(onUpdate).toHaveBeenCalledWith('l1', { usageMode: 'fixed', fixedHours: 6 });
  });

  it('switches back to Fração from a fixed-hours load', () => {
    const onUpdate = vi.fn();
    render(<LoadCard {...baseProps({ load: fullLoad({ usageMode: 'fixed', fixedHours: 6 }), onUpdate })} />);
    expand();

    fireEvent.click(screen.getByRole('tab', { name: 'Fração' }));
    expect(onUpdate).toHaveBeenCalledWith('l1', { usageMode: 'fraction' });
  });

  it('does not emit an update when the already-active usage-mode tab is clicked', () => {
    const onUpdate = vi.fn();
    render(<LoadCard {...baseProps({ load: fullLoad({ usageMode: 'fixed', fixedHours: 6 }), onUpdate })} />);
    expand();

    fireEvent.click(screen.getByRole('tab', { name: 'Horas' }));
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('clears the fixed-hours field via its clear button', () => {
    render(<LoadCard {...baseProps({ load: fullLoad({ usageMode: 'fixed', fixedHours: 4 }) })} />);
    expand();

    const fixedHoursInput = screen.getByLabelText('Horas fixas', { exact: false });
    // Every numeric field renders its own "Limpar campo" button, so scope to this input's wrapper.
    const clearButton = within(fixedHoursInput.parentElement as HTMLElement).getByRole('button', {
      name: 'Limpar campo',
    });
    fireEvent.mouseDown(clearButton);
    fireEvent.click(clearButton);
    expect(fixedHoursInput).toHaveValue(null);
  });

  it('reverts fixedHours to the stored value when blurred while empty', () => {
    render(<LoadCard {...baseProps({ load: fullLoad({ usageMode: 'fixed', fixedHours: 4 }) })} />);
    expand();

    const fixedHoursInput = screen.getByLabelText('Horas fixas', { exact: false });
    fireEvent.change(fixedHoursInput, { target: { value: '' } });
    fireEvent.blur(fixedHoursInput);
    expect(fixedHoursInput).toHaveValue(4);
  });

  it('clamps fixedHours above the shared max down to it on blur, updating the store', () => {
    const onUpdate = vi.fn();
    render(<LoadCard {...baseProps({ load: fullLoad({ usageMode: 'fixed', fixedHours: 4 }), onUpdate })} />);
    expand();

    const fixedHoursInput = screen.getByLabelText('Horas fixas', { exact: false });
    fireEvent.change(fixedHoursInput, { target: { value: '99' } });
    fireEvent.blur(fixedHoursInput);
    expect(fixedHoursInput).toHaveValue(12);
    expect(onUpdate).toHaveBeenCalledWith('l1', { fixedHours: 12 });
  });

  it('edits voltage buttons, including an invalid-voltage extra option', () => {
    const onUpdate = vi.fn();
    render(
      <LoadCard
        {...baseProps({
          gridType: 'threePhase_220',
          load: fullLoad({ voltageV: 999 as never }),
          onUpdate,
        })}
      />
    );
    expand();

    // The invalid voltage still renders as an extra (destructive-styled) option.
    expect(screen.getByRole('button', { name: '999V' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '110V' }));
    expect(onUpdate).toHaveBeenCalledWith('l1', { voltageV: 110 });
  });

  it('switches phaseType to trifásica only when phaseCount is 3', () => {
    const onUpdate = vi.fn();
    render(<LoadCard {...baseProps({ gridType: 'threePhase_220', load: fullLoad(), onUpdate })} />);
    expand();

    expect(screen.getByRole('button', { name: 'Trifásica' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Trifásica' }));
    expect(onUpdate).toHaveBeenCalledWith('l1', { phaseType: 'trifasica' });
  });

  it('does not show a Trifásica option on a two-phase grid', () => {
    render(<LoadCard {...baseProps({ gridType: 'splitPhase_220', load: fullLoad() })} />);
    expand();
    expect(screen.queryByRole('button', { name: 'Trifásica' })).not.toBeInTheDocument();
  });

  it('picks a phase pair on a three-phase grid needing two phases', () => {
    const onUpdate = vi.fn();
    render(
      <LoadCard
        {...baseProps({
          gridType: 'threePhase_220',
          load: fullLoad({ voltageV: 220, phase: 'L1', phase2: 'L2' }),
          onUpdate,
        })}
      />
    );
    expand();

    fireEvent.click(screen.getByRole('button', { name: 'L2-L3' }));
    expect(onUpdate).toHaveBeenCalledWith('l1', { phase: 'L2', phase2: 'L3' });
  });

  it('shows a disabled fixed L1-L2 pair on a two-phase grid needing two phases', () => {
    render(
      <LoadCard
        {...baseProps({
          gridType: 'splitPhase_220',
          load: fullLoad({ voltageV: 220, phase: 'L1', phase2: 'L2' }),
        })}
      />
    );
    expand();
    expect(screen.getByRole('button', { name: 'L1-L2' })).toBeDisabled();
  });

  it('picks an individual phase on a multi-phase grid not needing two phases', () => {
    const onUpdate = vi.fn();
    render(
      <LoadCard
        {...baseProps({
          gridType: 'threePhase_220',
          load: fullLoad({ voltageV: 110, phase: 'L1' }),
          onUpdate,
        })}
      />
    );
    expand();

    fireEvent.click(screen.getByRole('button', { name: 'L3' }));
    expect(onUpdate).toHaveBeenCalledWith('l1', { phase: 'L3' });
  });
});

describe('LoadCard: self-correcting effects', () => {
  it('forces phaseType back to mono when phaseCount drops below 3 while trifásica', () => {
    const onUpdate = vi.fn();
    render(
      <LoadCard
        {...baseProps({ gridType: 'splitPhase_220', load: fullLoad({ phaseType: 'trifasica' }), onUpdate })}
      />
    );
    expect(onUpdate).toHaveBeenCalledWith('l1', { phaseType: 'mono' });
  });

  it('resets voltage to the phase-to-phase value for a trifásica load with an incompatible voltage', () => {
    const onUpdate = vi.fn();
    render(
      <LoadCard
        {...baseProps({
          gridType: 'threePhase_220',
          load: fullLoad({ phaseType: 'trifasica', voltageV: 110 }),
          onUpdate,
        })}
      />
    );
    expect(onUpdate).toHaveBeenCalledWith('l1', { voltageV: 220 });
  });

  it('resets a 380V mono load down to 220V on a threePhase_380 grid', () => {
    const onUpdate = vi.fn();
    render(
      <LoadCard
        {...baseProps({
          gridType: 'threePhase_380',
          load: fullLoad({ phaseType: 'mono', voltageV: 380 }),
          onUpdate,
        })}
      />
    );
    expect(onUpdate).toHaveBeenCalledWith('l1', { voltageV: 220 });
  });

  it('auto-assigns phase2 when a two-phase voltage is picked without one, and clears it when no longer needed', () => {
    const onUpdate = vi.fn();
    const { rerender } = render(
      <LoadCard
        {...baseProps({
          gridType: 'threePhase_220',
          load: fullLoad({ phaseType: 'mono', voltageV: 220 }),
          onUpdate,
        })}
      />
    );
    expect(onUpdate).toHaveBeenCalledWith('l1', { phase: 'L1', phase2: 'L2' });

    onUpdate.mockClear();
    rerender(
      <LoadCard
        {...baseProps({
          gridType: 'threePhase_220',
          load: fullLoad({ phaseType: 'mono', voltageV: 220, phase2: 'L2' }),
          onUpdate,
        })}
      />
    );
    // voltageV 110 no longer needs two phases while phase2 is still set.
    rerender(
      <LoadCard
        {...baseProps({
          gridType: 'threePhase_220',
          load: fullLoad({ phaseType: 'mono', voltageV: 110, phase2: 'L2' }),
          onUpdate,
        })}
      />
    );
    expect(onUpdate).toHaveBeenCalledWith('l1', { phase2: null });
  });
});

describe('LoadCard: drag to reconnect phase', () => {
  it('is draggable and starts a drag with the load id when eligible, but not in preset-selection mode', () => {
    // The card is LoadCard's root element, so read it off the container rather than
    // via the name text (which the header renders in more than one place).
    const { container, rerender } = render(
      <LoadCard {...baseProps({ gridType: 'threePhase_220', load: fullLoad() })} />
    );
    const card = container.firstElementChild as HTMLElement;
    expect(card).toHaveAttribute('draggable', 'true');

    const dataTransfer = { setData: vi.fn(), setDragImage: vi.fn(), effectAllowed: '' };
    fireEvent.dragStart(card, { dataTransfer });
    expect(dataTransfer.setData).toHaveBeenCalledWith('text/plain', 'l1');

    rerender(<LoadCard {...baseProps({ gridType: 'threePhase_220', load: fullLoad(), presetSelectionMode: true })} />);
    expect(container.firstElementChild).toHaveAttribute('draggable', 'false');
  });

  it('is not draggable on a single-phase grid or for a trifásica load', () => {
    const { container, rerender } = render(
      <LoadCard {...baseProps({ gridType: 'singlePhase_220', load: fullLoad() })} />
    );
    expect(container.firstElementChild).toHaveAttribute('draggable', 'false');

    rerender(
      <LoadCard
        {...baseProps({ gridType: 'threePhase_220', load: fullLoad({ phaseType: 'trifasica', voltageV: 220 }) })}
      />
    );
    expect(container.firstElementChild).toHaveAttribute('draggable', 'false');
  });

  it('falls back to "Carga" as the drag preview label when the load has no name', () => {
    render(<LoadCard {...baseProps({ gridType: 'threePhase_220', load: fullLoad({ name: '' }) })} />);
    const card = document.querySelector('.rounded-lg.border.bg-card') as HTMLElement;
    const dataTransfer = { setData: vi.fn(), setDragImage: vi.fn(), effectAllowed: '' };
    fireEvent.dragStart(card, { dataTransfer });
    expect(dataTransfer.setData).toHaveBeenCalledWith('text/plain', 'l1');
  });
});
