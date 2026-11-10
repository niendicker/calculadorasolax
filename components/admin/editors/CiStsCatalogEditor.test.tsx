// @vitest-environment jsdom
import {fireEvent,render,screen,within,waitFor} from '@testing-library/react';
import {beforeEach,describe,expect,it,vi} from 'vitest';
import {CiStsCatalogEditor} from './CiStsCatalogEditor';
import {stsFixture} from '@/supabase/functions/_shared/commercial-industrial/sts.test-fixtures';
import {modularFixture} from '@/supabase/functions/_shared/commercial-industrial/modular.test-fixtures';
const mocks=vi.hoisted(()=>({load:vi.fn(),saveProduct:vi.fn(),saveRule:vi.fn(),equipment:vi.fn()}));
vi.mock('@/lib/data/ci-sts-repository',()=>({loadCiStsCatalog:mocks.load,loadCiStsProducts:async()=>[],saveCiStsProduct:mocks.saveProduct,deleteCiSts:vi.fn(),saveCiStsRule:mocks.saveRule}));
vi.mock('@/lib/data/ci-modular-catalog-repository',()=>({loadCiModularCatalog:mocks.equipment}));
vi.mock('@/lib/data/ci-bess-products-repository',()=>({listCiBessProducts:async()=>[]}));
beforeEach(()=>{vi.clearAllMocks();const c=modularFixture();mocks.load.mockResolvedValue(stsFixture().catalog);mocks.equipment.mockResolvedValue({...c,inverterOptions:[],batteryOptions:[],accessories:[{id:'small',model:'ZERO-125 teste',active:true}]});mocks.saveProduct.mockResolvedValue(undefined);mocks.saveRule.mockResolvedValue('new');});
describe('admin STS catalog',()=>{
 it('fills Nexus nominal ratings without inferring compatibility or maximum PCS',async()=>{
  render(<CiStsCatalogEditor/>);
  fireEvent.click(await screen.findByRole('button',{name:'Cadastrar STS'}));
  const dialog=within(screen.getByRole('dialog'));
  fireEvent.change(dialog.getByLabelText('Modelo da STS'),{target:{value:'ZERO-125 teste'}});
  fireEvent.change(dialog.getByLabelText('Preencher a partir do datasheet Nexus'),{target:{value:'ZERO-125'}});
  expect(dialog.getByLabelText('Corrente nominal em 380 V (A)')).toHaveValue(189.4);
  expect(dialog.getByLabelText('Corrente nominal em 400 V (A)')).toHaveValue(181.2);
  expect(dialog.getByLabelText('EMS integrado')).toBeChecked();
  fireEvent.click(dialog.getByRole('button',{name:'Salvar'}));
  await waitFor(()=>expect(mocks.saveProduct).toHaveBeenCalledWith(expect.objectContaining({model:'ZERO-125 teste'}),expect.objectContaining({rated_current_380v_a:189.4}),expect.any(String)));
  expect(mocks.saveRule).not.toHaveBeenCalled();
 });
 it('lets the administrator set max PCS but blocks approval beyond the PCS own limit',async()=>{
  render(<CiStsCatalogEditor/>);
  await screen.findByRole('button',{name:'Cadastrar STS'});
  fireEvent.click(screen.getByRole('button',{name:'Compatibilidades STS'}));
  fireEvent.click(screen.getAllByRole('button',{name:'Editar'})[0]);
  const dialog=within(screen.getByRole('dialog'));
  fireEvent.change(dialog.getByLabelText('Máximo de PCS por STS'),{target:{value:'3'}});
  fireEvent.click(dialog.getByRole('button',{name:'Salvar'}));
  expect(await dialog.findByRole('alert')).toHaveTextContent('paralelismo');
  expect(mocks.saveRule).not.toHaveBeenCalled();
  fireEvent.change(dialog.getByLabelText('Máximo de PCS por STS'),{target:{value:'1'}});
  fireEvent.click(dialog.getByRole('button',{name:'Salvar'}));
  await waitFor(()=>expect(mocks.saveRule).toHaveBeenCalledWith(expect.objectContaining({max_pcs:1})));
 });
});
