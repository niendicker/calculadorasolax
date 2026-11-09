// @vitest-environment jsdom
import { useState } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CurveSelectionPopup } from './CurveSelectionPopup';
import { CiAcPowerProvider } from './ci-ac-power';
import type { SelectionSlots } from './LoadCurveChart';

const points = [80, 40, 0, 16].map((powerKw, index) => ({ timestamp: new Date(Date.UTC(2026, 10, 9, 15, index * 30)).toISOString(), powerKw }));
const a = { startIndex: 0, endIndex: 1 }, b = { startIndex: 2, endIndex: 3 };
const generation = points.map((point,index) => ({ ...point, powerKw: [16, 24, 0, 8][index] }));
function popup(slots: SelectionSlots, onChange: React.Dispatch<React.SetStateAction<SelectionSlots>> = vi.fn(), pv = generation) {
  return <CiAcPowerProvider powerFactor={.8}><CurveSelectionPopup points={points} generationPoints={pv} resolutionMinutes={30} timezone="America/Sao_Paulo" selections={slots} onSelectionsChange={onChange}/></CiAcPowerProvider>;
}

describe('curve selection popup', () => {
  it('shows apparent min, max and mean while integrating active energy and the exclusive interval end', () => {
    render(popup({ a, b: null }));
    const table = within(screen.getByRole('table',{name:'Valores do intervalo'}));
    expect(table.getByRole('row',{name:'Mínima 50,00 kVA 20,00 kVA'})).toBeInTheDocument();
    expect(table.getByRole('row',{name:'Máxima 100,00 kVA 30,00 kVA'})).toBeInTheDocument();
    expect(table.getByRole('row',{name:'Média 75,00 kVA 25,00 kVA'})).toBeInTheDocument();
    expect(table.getByRole('row',{name:'Energia 60,00 kWh 20,00 kWh'})).toBeInTheDocument();
    expect(screen.getByText('09/11 · 12:00 – 09/11 · 13:00')).toBeInTheDocument();
    expect(screen.getByText('2 pontos · 60 min')).toBeInTheDocument();
  });
  it('supports independent A/B views and signed differences without converting kWh', () => {
    render(popup({ a, b }));
    expect(screen.getByRole('row',{name:'Energia 8,00 kWh 4,00 kWh'})).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'Período A'}));
    expect(screen.getByRole('row',{name:'Energia 60,00 kWh 20,00 kWh'})).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'Diferença'}));
    expect(screen.getByRole('row',{name:'Energia -52,00 kWh -16,00 kWh'})).toBeInTheDocument();
    expect(screen.getByRole('row',{name:'Máxima -80,00 kVA -20,00 kVA'})).toBeInTheDocument();
  });
  it('distinguishes missing FV readings from zero and does not publish changes on dismiss', () => {
    const changed = vi.fn();
    render(popup({ a, b: null },changed,[generation[0]]));
    expect(screen.getByRole('row',{name:'Energia 60,00 kWh —'})).toBeInTheDocument();
    expect(screen.getByText('Sem dados FV completos para este intervalo.')).toBeInTheDocument();
    fireEvent.keyDown(document,{key:'Escape'});
    expect(screen.queryByRole('region',{name:'Resumo do intervalo selecionado'})).not.toBeInTheDocument();
    expect(changed).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button',{name:'Ver seleção'}));
    expect(screen.getByRole('region',{name:'Resumo do intervalo selecionado'})).toBeInTheDocument();
  });
  it('reopens for a new selection and clears only the selected slot', () => {
    function Harness() {
      const [selections,setSelections]=useState<SelectionSlots>({a,b:null});
      return <><button onClick={()=>setSelections({a,b})}>Selecionar B</button>{popup(selections,setSelections)}</>;
    }
    render(<Harness/>);
    fireEvent.click(screen.getByRole('button',{name:'Fechar resumo da seleção'}));
    fireEvent.click(screen.getByRole('button',{name:'Selecionar B'}));
    expect(screen.getByRole('button',{name:'Período B'})).toHaveAttribute('aria-pressed','true');
    fireEvent.click(screen.getByRole('button',{name:'Limpar período B'}));
    expect(screen.getByRole('row',{name:'Energia 60,00 kWh 20,00 kWh'})).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'Limpar seleção'}));
    expect(screen.queryByRole('region',{name:'Resumo do intervalo selecionado'})).not.toBeInTheDocument();
  });
});
