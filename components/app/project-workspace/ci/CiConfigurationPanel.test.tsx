// @vitest-environment jsdom
import {useState} from 'react';
import {render,screen,fireEvent} from '@testing-library/react';
import {beforeEach,it,expect,vi} from 'vitest';
import {defaultCiOptions} from '@/lib/store/defaults';
import type {CommercialIndustrialOptions} from '@/supabase/functions/_shared/commercial-industrial/types';
import {generateCiGroupedSolutions} from '@/supabase/functions/_shared/commercial-industrial/grouped-solutions';
import {modularFixture} from '@/supabase/functions/_shared/commercial-industrial/modular.test-fixtures';
import {CiConfigurationPanel} from './CiConfigurationPanel';
const mocks=vi.hoisted(()=>({generation:vi.fn(),query:vi.fn(),next:vi.fn()}));
vi.mock('@/lib/data/ci-generated-solutions-repository',()=>({getCiSolutionGeneration:mocks.generation,queryCiGeneratedSolutions:mocks.query}));
vi.mock('@/lib/supabase/client',()=>({createClient:()=>({})}));
vi.mock('./CiAccessoriesPanel',()=>({CiAccessoriesPanel:()=>null}));
function Controlled({initial={}}:{initial?:Partial<CommercialIndustrialOptions>}){const [options,setOptions]=useState({...defaultCiOptions,...initial});return <><CiConfigurationPanel ciOptions={options} onChange={p=>setOptions(o=>({...o,...p}))} onNavigateNext={mocks.next}/><output aria-label="Configuração salva">{JSON.stringify(options.bessSystem)}</output></>;}
beforeEach(()=>{vi.clearAllMocks();mocks.generation.mockResolvedValue({expected_count:4});mocks.query.mockResolvedValue({solutions:generateCiGroupedSolutions(modularFixture(),[]).solutions});});
it('uses automatic technical search and accepts optional minimums without selecting a model',async()=>{
 render(<Controlled initial={{bessSystem:{kind:'automatic',minPowerKw:0,minEnergyKwh:0}}}/>);expect(await screen.findByText('4 soluções na geração atual.')).toBeInTheDocument();
 fireEvent.change(screen.getByLabelText('Potência mínima adicional (kW)'),{target:{value:'150'}});fireEvent.change(screen.getByLabelText('Energia útil mínima adicional (kWh)'),{target:{value:'300'}});expect(screen.getByLabelText('Configuração salva')).toHaveTextContent('"minPowerKw":150,"minEnergyKwh":300');fireEvent.click(screen.getByRole('button',{name:'Avançar para Curvas e aplicações'}));expect(mocks.next).toHaveBeenCalled();
});
it('can fix an existing grouped solution and requires a selection before advancing',async()=>{
 render(<Controlled/>);await screen.findByText('4 soluções na geração atual.');fireEvent.click(screen.getByRole('button',{name:'Fixar solução gerada'}));expect(screen.getByRole('button',{name:'Avançar para Curvas e aplicações'})).toBeDisabled();const select=await screen.findByLabelText('Solução gerada');await screen.findAllByRole('option');const key=generateCiGroupedSolutions(modularFixture(),[]).solutions[0].key;fireEvent.change(select,{target:{value:key}});expect(screen.getByLabelText('Configuração salva')).toHaveTextContent(key);expect(screen.getByRole('button',{name:'Avançar para Curvas e aplicações'})).toBeEnabled();
});
it('shows missing generation and supports retry',async()=>{
 mocks.generation.mockResolvedValueOnce(null);render(<Controlled/>);expect(await screen.findByRole('alert')).toHaveTextContent('administrador');fireEvent.click(screen.getByRole('button',{name:'Tentar novamente'}));expect(await screen.findByText('4 soluções na geração atual.')).toBeInTheDocument();
});
it('preserves a legacy project configuration until the user changes search mode',async()=>{
 render(<Controlled initial={{bessSystem:{kind:'integrated'},bessProductId:'legacy'}}/>);expect(await screen.findByText(/configuração específica antiga/)).toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:'Busca automática'}));expect(screen.getByLabelText('Configuração salva')).toHaveTextContent('"kind":"automatic"');
});
