// @vitest-environment jsdom
import {useState} from 'react';
import {render,screen,fireEvent} from '@testing-library/react';
import {beforeEach,it,expect,vi} from 'vitest';
import {defaultCiOptions} from '@/lib/store/defaults';
import type {CommercialIndustrialOptions} from '@/supabase/functions/_shared/commercial-industrial/types';
import {generateCiGroupedSolutions} from '@/supabase/functions/_shared/commercial-industrial/grouped-solutions';
import {modularFixture} from '@/supabase/functions/_shared/commercial-industrial/modular.test-fixtures';
import {cabinetFixture} from '@/supabase/functions/_shared/commercial-industrial/grouped-solutions.test-fixtures';
import {CiConfigurationPanel} from './CiConfigurationPanel';
const mocks=vi.hoisted(()=>({query:vi.fn(),next:vi.fn()}));
vi.mock('@/lib/data/ci-generated-solutions-repository',()=>({queryCiGeneratedSolutions:mocks.query}));
vi.mock('@/lib/supabase/client',()=>({createClient:()=>({})}));
vi.mock('./CiAccessoriesPanel',()=>({CiAccessoriesPanel:()=>null}));
function Controlled({initial={}}:{initial?:Partial<CommercialIndustrialOptions>}){const [options,setOptions]=useState({...defaultCiOptions,...initial});return <><CiConfigurationPanel ciOptions={options} onChange={p=>setOptions(o=>({...o,...p}))} onNavigateNext={mocks.next}/><output aria-label="Configuração salva">{JSON.stringify(options)}</output></>;}
function rows(){const catalog=modularFixture();catalog.pcs[0].gridTypes=['3P_380V'];return generateCiGroupedSolutions(catalog,[{...cabinetFixture(),ac_voltages_v:[380]}]).solutions;}
beforeEach(()=>{vi.clearAllMocks();mocks.query.mockResolvedValue({solutions:rows()});});
it('requires voltage and an integrated model, with no quantities or ranking choices',async()=>{
 render(<Controlled/>);
 await screen.findByRole('option',{name:/Gabinete teste/});
 expect(screen.getByLabelText('Modelo BESS integrado')).toBeDisabled();
 fireEvent.change(screen.getByLabelText('Tensão CA entre fases'),{target:{value:'380'}});
 fireEvent.change(screen.getByLabelText('Modelo BESS integrado'),{target:{value:cabinetFixture().id}});
 expect(screen.getByLabelText('Configuração salva')).toHaveTextContent('"sourceKind":"cabinet","productId":"'+cabinetFixture().id+'"');
 expect(screen.getByRole('button',{name:'Avançar para Curvas e aplicações'})).toBeEnabled();
 expect(screen.queryByText('Fixar solução gerada')).not.toBeInTheDocument();
 expect(screen.queryByLabelText(/mínima adicional/)).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Avançar para Curvas e aplicações'}));expect(mocks.next).toHaveBeenCalledOnce();
});
it('offers only approved PCS/battery pairs and disables voltage-incompatible models',async()=>{
 const other=rows().filter(s=>s.source.kind==='assembly').map(s=>({...s,source:{...s.source,id:'other-rule'},components:s.components.map(c=>c.productType==='ci_pcs'?{...c,productId:'pcs-220',model:'PCS somente 220'}:c),ac:{...s.ac,lineVoltagesV:[220 as const]}}));
 mocks.query.mockResolvedValue({solutions:[...rows(),...other]});
 render(<Controlled initial={{lineVoltageV:380}}/>);
 await screen.findByRole('option',{name:/Gabinete teste/});
 fireEvent.click(screen.getByRole('button',{name:'PCS/Inversor + bateria'}));
 expect(screen.getByRole('option',{name:/PCS somente 220/})).toBeDisabled();
 expect(screen.getByLabelText('Modelo de bateria compatível')).toBeDisabled();
 fireEvent.change(screen.getByLabelText('Modelo PCS/Inversor'),{target:{value:modularFixture().pcs[0].inverter_id}});
 expect(screen.getAllByRole('option',{name:/Rack teste/})).toHaveLength(1);
 fireEvent.change(screen.getByLabelText('Modelo de bateria compatível'),{target:{value:modularFixture().batteries[0].battery_id}});
 expect(screen.getByRole('button',{name:'Avançar para Curvas e aplicações'})).toBeEnabled();
 fireEvent.change(screen.getByLabelText('Tensão CA entre fases'),{target:{value:'220'}});
 expect(screen.getByRole('option',{name:/PCS teste 100/})).toBeDisabled();
 expect(screen.getByRole('button',{name:'Avançar para Curvas e aplicações'})).toBeDisabled();
 expect(screen.getByLabelText('Configuração salva')).toHaveTextContent('"pcsId":null,"batteryId":null');
});
it('does not infer operating voltage from a model name or DC limits',async()=>{
 mocks.query.mockResolvedValue({solutions:rows().map(s=>({...s,ac:{...s.ac,lineVoltagesV:undefined}}))});
 render(<Controlled initial={{lineVoltageV:380}}/>);
 expect(await screen.findByRole('option',{name:/Gabinete teste.*tensão não documentada/})).toBeDisabled();
});
it('shows missing generation and supports retry',async()=>{
 mocks.query.mockRejectedValueOnce(new Error('Peça ao administrador para gerar novamente as soluções.'));
 render(<Controlled/>);expect(await screen.findByRole('alert')).toHaveTextContent('administrador');
 fireEvent.click(screen.getByRole('button',{name:'Tentar novamente'}));
 expect(await screen.findByRole('option',{name:/Gabinete teste/})).toBeInTheDocument();
});
it('keeps legacy configuration until the user selects models',async()=>{
 render(<Controlled initial={{bessSystem:{kind:'integrated'},bessProductId:'legacy'}}/>);
 expect(await screen.findByText(/configuração anterior/)).toBeInTheDocument();
 expect(screen.getByLabelText('Configuração salva')).toHaveTextContent('"kind":"integrated"');
 fireEvent.click(screen.getByRole('button',{name:'PCS/Inversor + bateria'}));
 expect(screen.getByLabelText('Configuração salva')).toHaveTextContent('"kind":"model"');
});
it('shows the selected model sheet from single-unit solutions and the applications it supports',async()=>{
 render(<Controlled initial={{lineVoltageV:380}}/>);
 await screen.findByRole('option',{name:/Gabinete teste/});
 expect(screen.queryByRole('region',{name:/Ficha de/})).not.toBeInTheDocument();
 expect(screen.getByText('Selecione o modelo para avançar.')).toHaveAttribute('role','status');
 fireEvent.change(screen.getByLabelText('Modelo BESS integrado'),{target:{value:cabinetFixture().id}});
 const sheet=screen.getByRole('region',{name:'Ficha de Gabinete teste'});
 expect(sheet).toHaveTextContent('Potência CA de descarga');
 expect(sheet).toHaveTextContent(/kVA por unidade/);
 expect(sheet).toHaveTextContent(/kWh por unidade/);
 expect(sheet).toHaveTextContent('até 3 unidades');
 expect(sheet).toHaveTextContent('380 V');
 expect(sheet).toHaveTextContent('Peak Shaving');
 expect(sheet).toHaveTextContent('Backup');
 expect(sheet).not.toHaveTextContent('Gerador');
 expect(screen.queryByText(/para avançar\./)).not.toBeInTheDocument();
});
it('explains when no model is documented at the selected voltage',async()=>{
 render(<Controlled initial={{lineVoltageV:220}}/>);
 await screen.findByRole('option',{name:/Gabinete teste/});
 expect(screen.getByRole('alert')).toHaveTextContent('Nenhum modelo documentado em 220 V');
 fireEvent.change(screen.getByLabelText('Tensão CA entre fases'),{target:{value:'380'}});
 expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});
