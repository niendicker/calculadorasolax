// @vitest-environment jsdom

import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { SingleLoad } from '@/lib/types';
import { LoadTable } from './LoadTable';

function makeLoad(partial: Partial<SingleLoad> = {}): SingleLoad {
  return {
    id: 'load-1',
    name: 'Geladeira',
    powerW: 1000,
    qty: 2,
    ipInRatio: 3,
    usageFactor: 0.5,
    voltageV: 220,
    phaseType: 'mono',
    phase: 'L1',
    phase2: null,
    includedInPeak: true,
    ...partial,
  };
}

function renderTable(overrides: Partial<React.ComponentProps<typeof LoadTable>> = {}) {
  const props = {
    loads: [makeLoad()],
    gridType: null,
    peakCalcMode: 'sum' as const,
    operationHours: 4,
    onUpdate: vi.fn(),
    onRemove: vi.fn(),
    onDuplicate: vi.fn(),
    duplicateDisabled: false,
    onAddLoad: vi.fn(),
    addDisabled: false,
    ...overrides,
  };
  return { ...render(<LoadTable {...props} />), props };
}

function openEditor() {
  fireEvent.click(screen.getByText('Geladeira'));
  expect(screen.getByText('Editar carga')).toBeInTheDocument();
}

describe('LoadTable', () => {
  it('renders derived peak and daily energy values and toggles editing by keyboard', () => {
    const { props } = renderTable();
    const row = screen.getByRole('row', { name: /Geladeira/ });

    expect(within(row).getByText('1000')).toBeInTheDocument();
    expect(within(row).getByText('6000')).toBeInTheDocument();
    expect(within(row).getByText('4.00')).toBeInTheDocument();
    expect(within(row).getByText('220V · L1')).toBeInTheDocument();

    fireEvent.keyDown(row, { key: 'Enter' });
    expect(screen.getByText('Editar carga')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Fechar edição de Geladeira' }));
    expect(screen.queryByText('Editar carga')).not.toBeInTheDocument();
    expect(props.onUpdate).not.toHaveBeenCalled();
  });

  it('updates quantity, IP/IN, fraction usage and restores invalid values on blur', () => {
    const { props } = renderTable();
    openEditor();
    (props.onUpdate as ReturnType<typeof vi.fn>).mockClear();

    const quantity = screen.getByLabelText('Quantidade Geladeira');
    fireEvent.change(quantity, { target: { value: '3' } });
    expect(props.onUpdate).toHaveBeenCalledWith('load-1', { qty: 3 });

    const ratio = screen.getByLabelText('IP/IN Geladeira');
    fireEvent.change(ratio, { target: { value: '2.5' } });
    expect(props.onUpdate).toHaveBeenCalledWith('load-1', { ipInRatio: 2.5 });

    const usage = screen.getByLabelText('Fator de uso Geladeira');
    fireEvent.change(usage, { target: { value: '75' } });
    expect(props.onUpdate).toHaveBeenCalledWith('load-1', { usageFactor: 0.75 });

    fireEvent.change(quantity, { target: { value: '0' } });
    fireEvent.blur(quantity);
    expect(quantity).toHaveValue(2);
  });

  it('switches between fraction and fixed-hour usage modes', () => {
    const { props, rerender } = renderTable();
    openEditor();
    (props.onUpdate as ReturnType<typeof vi.fn>).mockClear();

    const mode = screen.getByLabelText('Modo de uso Geladeira');
    fireEvent.change(mode, { target: { value: 'fixed' } });
    expect(props.onUpdate).toHaveBeenCalledWith('load-1', { usageMode: 'fixed', fixedHours: 4 });

    rerender(<LoadTable {...props} loads={[makeLoad({ usageMode: 'fixed', fixedHours: 4 })]} />);
    expect(screen.getByLabelText('Horas Geladeira')).toHaveValue(4);

    (props.onUpdate as ReturnType<typeof vi.fn>).mockClear();
    fireEvent.change(screen.getByLabelText('Horas Geladeira'), { target: { value: '6' } });
    expect(props.onUpdate).toHaveBeenCalledWith('load-1', { fixedHours: 6 });
  });

  it('handles selected peak inclusion, voltage, phase and close controls', () => {
    const { props } = renderTable({ peakCalcMode: 'select' });
    openEditor();
    (props.onUpdate as ReturnType<typeof vi.fn>).mockClear();

    const peakToggle = screen.getByRole('button', { name: 'Não contar Geladeira na potência máxima' });
    fireEvent.click(peakToggle);
    expect(props.onUpdate).toHaveBeenCalledWith('load-1', { includedInPeak: false });

    fireEvent.change(screen.getByLabelText('Tensão Geladeira'), { target: { value: '110' } });
    expect(props.onUpdate).toHaveBeenCalledWith('load-1', { voltageV: 110 });

    fireEvent.change(screen.getByLabelText('Fase Geladeira'), { target: { value: 'L2' } });
    expect(props.onUpdate).toHaveBeenCalledWith('load-1', { phase: 'L2', phase2: null });
  });

  it('offers phase-to-phase selection for a multi-phase grid and corrects invalid 380V mono loads', () => {
    const onUpdate = vi.fn();
    const firstRender = renderTable({
      gridType: 'threePhase_220',
      loads: [makeLoad({ voltageV: 220 })],
      onUpdate,
    });
    openEditor();

    expect(screen.getByLabelText('Fases Geladeira')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Fases Geladeira'), { target: { value: 'L2-L3' } });
    expect(onUpdate).toHaveBeenCalledWith('load-1', { phase: 'L2', phase2: 'L3' });
    firstRender.unmount();

    const correctingUpdate = vi.fn();
    const { unmount } = renderTable({
      gridType: 'threePhase_380',
      loads: [makeLoad({ voltageV: 380 })],
      onUpdate: correctingUpdate,
    });
    expect(correctingUpdate).toHaveBeenCalledWith('load-1', { voltageV: 220 });
    unmount();
  });

  it('renders three-phase loads with their fixed phase label and restricts tri-phase mode by grid', () => {
    const onUpdate = vi.fn();
    renderTable({
      gridType: 'singlePhase_220',
      loads: [makeLoad({ phaseType: 'trifasica', voltageV: 220 })],
      onUpdate,
    });

    expect(onUpdate).toHaveBeenCalledWith('load-1', { phaseType: 'mono' });
    openEditor();
    expect(screen.queryByLabelText('Fases Geladeira')).not.toBeInTheDocument();
    expect(screen.getByText('L1-L2-L3')).toBeInTheDocument();
  });

  it('uses the load actions and add button callbacks, including disabled states', () => {
    const onDuplicate = vi.fn();
    const onRemove = vi.fn();
    const onAddLoad = vi.fn();
    const { rerender } = renderTable({ onDuplicate, onRemove, onAddLoad });

    fireEvent.click(screen.getByRole('button', { name: 'Adicionar carga' }));
    expect(onAddLoad).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Opções de Geladeira' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Duplicar' }));
    expect(onDuplicate).toHaveBeenCalledWith(expect.objectContaining({ id: 'load-1' }));

    fireEvent.click(screen.getByRole('button', { name: 'Opções de Geladeira' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Excluir' }));
    expect(onRemove).toHaveBeenCalledWith('load-1');

    rerender(
      <LoadTable
        loads={[makeLoad()]}
        gridType={null}
        peakCalcMode="sum"
        operationHours={4}
        onUpdate={vi.fn()}
        onRemove={vi.fn()}
        onDuplicate={vi.fn()}
        duplicateDisabled
        onAddLoad={vi.fn()}
        addDisabled
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Opções de Geladeira' }));
    expect(screen.getByRole('menuitem', { name: 'Duplicar' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Adicionar carga' })).toBeDisabled();
  });
});
