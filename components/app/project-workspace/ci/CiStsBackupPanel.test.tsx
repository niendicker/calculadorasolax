// @vitest-environment jsdom
import {useState} from 'react';
import {act,fireEvent,render,screen} from '@testing-library/react';
import {beforeEach,describe,expect,it,vi} from 'vitest';
import {CiStsBackupPanel} from './CiStsBackupPanel';
import {stsFixture,stsBackup} from '@/supabase/functions/_shared/commercial-industrial/sts.test-fixtures';
import {modularFixture,modularOptions} from '@/supabase/functions/_shared/commercial-industrial/modular.test-fixtures';
import type {CiBackupConfig} from '@/supabase/functions/_shared/commercial-industrial/types';
const mocks=vi.hoisted(()=>({load:vi.fn(),equipment:vi.fn()}));
vi.mock('@/lib/data/ci-modular-catalog-repository',()=>({loadCiModularCatalog:mocks.equipment}));
vi.mock('@/lib/data/ci-sts-repository',()=>({loadCiStsCatalog:mocks.load}));
beforeEach(()=>{vi.clearAllMocks();const c=stsFixture().catalog;c.rules.forEach(r=>{r.pcs_id=null;r.bess_product_id='integrated';});mocks.load.mockResolvedValue(c);mocks.equipment.mockResolvedValue(modularFixture());});
function Harness({initial=stsBackup(),modular=false}: {initial?:CiBackupConfig;modular?:boolean}){
 const [backup,setBackup]=useState(initial);
 return <CiStsBackupPanel options={modular?modularOptions():{...modularOptions(),bessSystem:{kind:'integrated'},bessProductId:'integrated'}} backup={backup} onChange={p=>setBackup({...backup,...p})}/>;
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


it('keeps a PCS lookup failure visible when the STS request finishes later, and retries both',async()=>{
  const catalog=stsFixture().catalog;
  let resolveCatalog!: (value:typeof catalog)=>void;
  mocks.load.mockImplementationOnce(()=>new Promise(resolve=>{resolveCatalog=resolve;}));
  mocks.equipment.mockRejectedValueOnce(new Error('Falha ao carregar a composição PCS'));
  render(<Harness modular/>);
  expect(await screen.findByText('Falha ao carregar a composição PCS')).toBeInTheDocument();
  await act(async()=>{resolveCatalog(catalog);});
  expect(screen.getByText('Falha ao carregar a composição PCS')).toBeInTheDocument();
  mocks.load.mockResolvedValue(catalog);
  fireEvent.click(screen.getByRole('button',{name:'Tentar novamente'}));
  fireEvent.change(screen.getByLabelText('Seleção de STS'),{target:{value:'manual'}});
  expect(await screen.findByRole('option',{name:/ZERO-125 teste/})).toBeInTheDocument();
  expect(screen.queryByText('Falha ao carregar a composição PCS')).not.toBeInTheDocument();
});

it.each(['cabinet','assembly'] as const)('resolves STS for selected %s models and refreshes when equipment or voltage changes',async(sourceKind)=>{
 const catalog=stsFixture().catalog;
 const pcsId=modularFixture().pcs[0].inverter_id;
 catalog.rules.forEach(r=>{r.pcs_id=sourceKind==='assembly'?pcsId:null;r.bess_product_id=sourceKind==='cabinet'?'integrated':null;});
 mocks.load.mockResolvedValue(catalog);
 const backup=stsBackup();backup.sts!.mode='manual';
 const options={...modularOptions(),bessProductId:null,lineVoltageV:380 as const,bessSystem:sourceKind==='cabinet'?{kind:'model' as const,sourceKind,productId:'integrated'}:{kind:'model' as const,sourceKind,pcsId,batteryId:'battery'}};
 const {rerender}=render(<CiStsBackupPanel options={options} backup={backup} onChange={vi.fn()}/>);
 expect(await screen.findByRole('option',{name:/ZERO-125 teste/})).toBeInTheDocument();
 rerender(<CiStsBackupPanel options={{...options,lineVoltageV:220}} backup={backup} onChange={vi.fn()}/>);
 await screen.findByText(/Nenhuma STS com compatibilidade aprovada/);
 expect(screen.queryByRole('option',{name:/ZERO-125 teste/})).not.toBeInTheDocument();
 const other=sourceKind==='cabinet'?{kind:'model' as const,sourceKind,productId:'other'}:{kind:'model' as const,sourceKind,pcsId:'other',batteryId:'battery'};
 rerender(<CiStsBackupPanel options={{...options,bessSystem:other}} backup={backup} onChange={vi.fn()}/>);
 await screen.findByText(/Nenhuma STS com compatibilidade aprovada/);
 expect(screen.queryByRole('option',{name:/ZERO-125 teste/})).not.toBeInTheDocument();
});
