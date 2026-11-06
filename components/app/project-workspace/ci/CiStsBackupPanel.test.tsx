// @vitest-environment jsdom
import {useState} from 'react';
import {fireEvent,render,screen} from '@testing-library/react';
import {beforeEach,describe,expect,it,vi} from 'vitest';
import {CiStsBackupPanel} from './CiStsBackupPanel';
import {stsFixture,stsBackup} from '@/supabase/functions/_shared/commercial-industrial/sts.test-fixtures';
import {modularOptions} from '@/supabase/functions/_shared/commercial-industrial/modular.test-fixtures';
import type {CiBackupConfig} from '@/supabase/functions/_shared/commercial-industrial/types';
const mocks=vi.hoisted(()=>({load:vi.fn()}));
vi.mock('@/lib/data/ci-sts-repository',()=>({loadCiStsCatalog:mocks.load}));
beforeEach(()=>{vi.clearAllMocks();const c=stsFixture().catalog;c.rules.forEach(r=>{r.pcs_id=null;r.bess_product_id='integrated';});mocks.load.mockResolvedValue(c);});
function Harness({initial=stsBackup()}: {initial?:CiBackupConfig}){
 const [backup,setBackup]=useState(initial);
 return <CiStsBackupPanel options={{...modularOptions(),bessSystem:{kind:'integrated'},bessProductId:'integrated'}} backup={backup} onChange={p=>setBackup({...backup,...p})}/>;
}
describe('backup STS selector',()=>{
 it('preserves legacy projects without loading the external catalog and requires explicit FP when enabled',async()=>{
  render(<Harness initial={{...stsBackup(),sts:undefined}}/>);
  expect(mocks.load).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Seleção de STS')).toHaveValue('none');
  fireEvent.change(screen.getByLabelText('Seleção de STS'),{target:{value:'auto'}});
  await screen.findByText(/A menor STS elegível/);
  expect(screen.getByLabelText('Fator de potência de projeto')).toHaveValue(null);
  expect(screen.getByRole('alert')).toHaveTextContent('fator de potência');
 });
 it('offers only approved matching models and preserves electrical inputs when switching modes',async()=>{
  render(<Harness/>);
  fireEvent.change(screen.getByLabelText('Seleção de STS'),{target:{value:'manual'}});
  await screen.findByRole('option',{name:/ZERO-125 teste/});
  fireEvent.change(screen.getByLabelText('Modelo STS'),{target:{value:'small'}});
  fireEvent.change(screen.getByLabelText('Tensão entre fases da STS'),{target:{value:'400'}});
  fireEvent.change(screen.getByLabelText('Seleção de STS'),{target:{value:'auto'}});
  expect(screen.getByLabelText('Fator de potência de projeto')).toHaveValue(0.9);
  expect(screen.getByLabelText('Tensão entre fases da STS')).toHaveValue('400');
  fireEvent.change(screen.getByLabelText('Seleção de STS'),{target:{value:'none'}});
  expect(screen.queryByLabelText('Fator de potência de projeto')).not.toBeInTheDocument();
 });
 it('shows revoked saved selections and supports retry after a catalog failure',async()=>{
  mocks.load.mockRejectedValueOnce(new Error('catálogo indisponível'));
  const b=stsBackup();b.sts!.mode='manual';b.sts!.accessoryId='revoked';
  render(<Harness initial={b}/>);
  expect(await screen.findByText('catálogo indisponível')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Tentar novamente'}));
  expect(await screen.findByText(/A STS salva está indisponível/)).toBeInTheDocument();
 });
});
