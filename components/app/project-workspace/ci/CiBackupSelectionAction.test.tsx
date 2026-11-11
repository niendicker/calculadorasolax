// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { modularOptions } from '@/supabase/functions/_shared/commercial-industrial/modular.test-fixtures';
import { CiBackupSelectionAction } from './CiBackupSelectionAction';

const curve=()=>modularOptions().loadCurve!;
const exclusiveEnd=(index:number)=>new Date(Date.parse(curve().points[index].timestamp)+15*60_000).toISOString();
const ranges=[{label:'Carga',startIndex:0,endIndex:3},{label:'Descarga',startIndex:4,endIndex:11}];

async function chooseManual(){
  fireEvent.click(screen.getByRole('combobox',{name:'Método de backup'}));
  const manual=await screen.findByRole('option',{name:'Potência manual'});
  fireEvent.pointerDown(manual,{pointerType:'mouse'});
  fireEvent.click(manual);
}

it('previews and applies the selected consumption window with a persisted method and exclusive end',async()=>{
  const apply=vi.fn();
  render(<CiBackupSelectionAction curve={curve()} ranges={ranges.slice(0,1)} onApply={apply}/>);
  expect(screen.getByRole('button',{name:/^Carga/})).toHaveTextContent(/1\.00 h · .* kVA · .* kWh/);
  expect(screen.queryByText(/potência contínua/)).not.toBeInTheDocument();
  await chooseManual();
  expect(screen.getByRole('button',{name:'Usar Carga para backup'})).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Potência manual do backup'),{target:{value:'25'}});
  fireEvent.click(screen.getByRole('button',{name:'Usar Carga para backup'}));
  expect(apply).toHaveBeenCalledWith({method:'manual',manualPowerKw:25,startTimestamp:curve().points[0].timestamp,endTimestampExclusive:exclusiveEnd(3)});
  expect(screen.getByRole('status')).toHaveTextContent('Backup atualizado pelo Carga');
});

it('converts manual backup kVA to active power before persisting the selection',async()=>{
  const {CiAcPowerProvider}=await import('./ci-ac-power');
  const apply=vi.fn();
  render(<CiAcPowerProvider powerFactor={.8}><CiBackupSelectionAction curve={curve()} ranges={ranges.slice(0,1)} onApply={apply}/></CiAcPowerProvider>);
  await chooseManual();
  fireEvent.change(screen.getByLabelText('Potência manual do backup'),{target:{value:'25'}});
  fireEvent.click(screen.getByRole('button',{name:'Usar Carga para backup'}));
  expect(apply).toHaveBeenCalledWith(expect.objectContaining({manualPowerKw:20}));
});

it('offers one backup source: switching the window changes the action, the summary and the applied status',()=>{
  const apply=vi.fn();
  render(<CiBackupSelectionAction curve={curve()} ranges={ranges} onApply={apply}/>);
  const group=screen.getByRole('group',{name:'Faixa para o backup'});
  const carga=within(group).getByRole('button',{name:/^Carga/}), descarga=within(group).getByRole('button',{name:/^Descarga/});
  expect(carga).toHaveAttribute('aria-pressed','true');
  expect(carga).toHaveTextContent(/1\.00 h/);
  expect(descarga).toHaveTextContent(/2\.00 h/);
  expect(screen.getByRole('button',{name:'Usar Carga para backup'})).toBeInTheDocument();
  fireEvent.click(descarga);
  expect(descarga).toHaveAttribute('aria-pressed','true');
  fireEvent.click(screen.getByRole('button',{name:'Usar Descarga para backup'}));
  expect(apply).toHaveBeenCalledWith({method:'profile',startTimestamp:curve().points[4].timestamp,endTimestampExclusive:exclusiveEnd(11)});
  expect(screen.getByRole('status')).toHaveTextContent('Backup atualizado pelo Descarga');
  fireEvent.click(carga);
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});

it('preselects and marks the window already saved for backup',()=>{
  const applied={method:'profile' as const,startTimestamp:curve().points[4].timestamp,endTimestampExclusive:exclusiveEnd(11)};
  render(<CiBackupSelectionAction curve={curve()} ranges={ranges} applied={applied} onApply={vi.fn()}/>);
  const group=screen.getByRole('group',{name:'Faixa para o backup'});
  const descarga=within(group).getByRole('button',{name:/^Descarga/});
  expect(descarga).toHaveAttribute('aria-pressed','true');
  expect(within(descarga).getByText('Em uso')).toBeInTheDocument();
  expect(within(within(group).getByRole('button',{name:/^Carga/})).queryByText('Em uso')).not.toBeInTheDocument();
  expect(screen.getByRole('button',{name:'Usar Descarga para backup'})).toBeInTheDocument();
});
