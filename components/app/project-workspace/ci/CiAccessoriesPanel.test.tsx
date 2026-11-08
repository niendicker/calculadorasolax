// @vitest-environment jsdom
import {beforeEach,expect,it,vi} from 'vitest';
import {fireEvent,render,screen,waitFor} from '@testing-library/react';
import {modularFixture,modularOptions} from '@/supabase/functions/_shared/commercial-industrial/modular.test-fixtures';
import {cabinetFixture} from '@/supabase/functions/_shared/commercial-industrial/grouped-solutions.test-fixtures';
import {generateCiGroupedSolutions} from '@/supabase/functions/_shared/commercial-industrial/grouped-solutions';
import type {CiAccessoryRule} from '@/supabase/functions/_shared/commercial-industrial/accessories';
import {CiGroupedConfigurationPanel} from './CiGroupedConfigurationPanel';

const mocks=vi.hoisted(()=>({query:vi.fn(),catalog:vi.fn()}));
vi.mock('@/lib/data/ci-generated-solutions-repository',()=>({queryCiGeneratedSolutions:mocks.query}));
vi.mock('@/lib/data/ci-accessories-repository',()=>({loadCiAccessoryCatalog:mocks.catalog}));
vi.mock('@/lib/supabase/client',()=>({createClient:()=>({})}));
function rule(id:string,extra:Partial<CiAccessoryRule>={}):CiAccessoryRule{return {id,name:id,accessory_id:id,active:true,pcs_id:null,battery_id:null,bess_product_id:null,compatibility_id:null,backup:null,generator:null,line_voltage_v:380,inclusion:'optional',metric:'system',min_count:1,max_count:null,quantity:1,divisor:1,requires_ids:[],excludes_ids:[],reference_document:'Teste',...extra};}
beforeEach(()=>{
 const catalog=modularFixture();catalog.pcs[0].gridTypes=['3P_380V'];
 mocks.query.mockResolvedValue({solutions:generateCiGroupedSolutions(catalog,[{...cabinetFixture(),ac_voltages_v:[380]}]).solutions});
});
function accessories(rules:CiAccessoryRule[]){mocks.catalog.mockResolvedValue({products:rules.map(r=>({id:r.accessory_id,model:r.name,active:true})),rules,stsIds:[]});}

it('shows and selects cabinet-specific optional accessories for model selection',async()=>{
 accessories([rule('Opcional do gabinete',{bess_product_id:cabinetFixture().id}),rule('Outro gabinete',{bess_product_id:'other'})]);
 const onChange=vi.fn();
 render(<CiGroupedConfigurationPanel ciOptions={{...modularOptions(),lineVoltageV:380,bessProductId:null,bessSystem:{kind:'model',sourceKind:'cabinet',productId:cabinetFixture().id}}} onChange={onChange}/>);
 fireEvent.click(await screen.findByRole('checkbox',{name:'Opcional do gabinete'}));
 expect(onChange).toHaveBeenCalledWith({selectedAccessoryIds:['Opcional do gabinete']});
 expect(screen.queryByRole('checkbox',{name:'Outro gabinete'})).not.toBeInTheDocument();
});

it('uses approved assembly targets and quantity limits, then hides accessories at an incompatible voltage',async()=>{
 const catalog=modularFixture();
 accessories([rule('Opcional da montagem',{compatibility_id:catalog.rules[0].id,metric:'pcs',min_count:2,max_count:2}),rule('Compatibilidade diferente',{compatibility_id:'other'}),rule('Tensão diferente',{line_voltage_v:220})]);
 const options={...modularOptions(),lineVoltageV:380 as const,bessSystem:{kind:'model' as const,sourceKind:'assembly' as const,pcsId:catalog.pcs[0].inverter_id,batteryId:catalog.batteries[0].battery_id}};
 const {rerender}=render(<CiGroupedConfigurationPanel ciOptions={options} onChange={vi.fn()}/>);
 expect(await screen.findByRole('checkbox',{name:'Opcional da montagem'})).toBeInTheDocument();
 expect(screen.queryByRole('checkbox',{name:'Compatibilidade diferente'})).not.toBeInTheDocument();
 expect(screen.queryByRole('checkbox',{name:'Tensão diferente'})).not.toBeInTheDocument();
 rerender(<CiGroupedConfigurationPanel ciOptions={{...options,lineVoltageV:220}} onChange={vi.fn()}/>);
 await waitFor(()=>expect(screen.queryByRole('checkbox',{name:'Opcional da montagem'})).not.toBeInTheDocument());
});

it('does not offer an accessory whose PCS identity or quantity has no generated arrangement',async()=>{
 const catalog=modularFixture();
 accessories([rule('PCS diferente',{pcs_id:'other'}),rule('Quantidade indisponível',{metric:'pcs',min_count:3})]);
 render(<CiGroupedConfigurationPanel ciOptions={{...modularOptions(),lineVoltageV:380,bessSystem:{kind:'model',sourceKind:'assembly',pcsId:catalog.pcs[0].inverter_id,batteryId:catalog.batteries[0].battery_id}}} onChange={vi.fn()}/>);
 await screen.findByText('Nenhum acessório opcional cadastrado para esta configuração.');
 expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
});
