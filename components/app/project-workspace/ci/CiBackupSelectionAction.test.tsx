// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { modularOptions } from '@/supabase/functions/_shared/commercial-industrial/modular.test-fixtures';
import { CiBackupSelectionAction } from './CiBackupSelectionAction';

it('previews and applies the selected consumption window with a persisted method and exclusive end',()=>{
  const curve=modularOptions().loadCurve!;const apply=vi.fn();
  render(<CiBackupSelectionAction curve={curve} startIndex={0} endIndex={3} label="período A" onApply={apply}/>);
  expect(screen.getByText(/1.00 h/)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Método de backup do período A'),{target:{value:'manual'}});
  expect(screen.getByRole('button',{name:'Usar período A para backup'})).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Potência manual do período A'),{target:{value:'25'}});
  fireEvent.click(screen.getByRole('button',{name:'Usar período A para backup'}));
  expect(apply).toHaveBeenCalledWith({method:'manual',manualPowerKw:25,startTimestamp:curve.points[0].timestamp,endTimestampExclusive:new Date(Date.parse(curve.points[3].timestamp)+15*60_000).toISOString()});
  expect(screen.getByRole('status')).toHaveTextContent('Backup atualizado');
});

it('converts manual backup kVA to active power before persisting the selection',async()=>{
 const {CiAcPowerProvider}=await import('./ci-ac-power');
 const curve=modularOptions().loadCurve!;const apply=vi.fn();
 render(<CiAcPowerProvider powerFactor={.8}><CiBackupSelectionAction curve={curve} startIndex={0} endIndex={3} label="período A" onApply={apply}/></CiAcPowerProvider>);
 fireEvent.change(screen.getByLabelText('Método de backup do período A'),{target:{value:'manual'}});
 fireEvent.change(screen.getByLabelText('Potência manual do período A'),{target:{value:'25'}});
 fireEvent.click(screen.getByRole('button',{name:'Usar período A para backup'}));
 expect(apply).toHaveBeenCalledWith(expect.objectContaining({manualPowerKw:20}));
});
