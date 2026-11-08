import {expect,it} from 'vitest';
import {generateCiGroupedSolutions} from '@/supabase/functions/_shared/commercial-industrial/grouped-solutions';
import {modularFixture} from '@/supabase/functions/_shared/commercial-industrial/modular.test-fixtures';
import {buildCiModelOptions,ciModelVoltageLabel} from './ci-model-options';
it('merges approved arrangements and rules for the same models without cross-matching other batteries',()=>{
 const catalog=modularFixture();catalog.pcs[0].gridTypes=['3P_380V'];
 const solutions=generateCiGroupedSolutions(catalog,[]).solutions;
 const otherRule=solutions.map(s=>({...s,source:{...s.source,id:'other-rule'},ac:{...s.ac,lineVoltagesV:[220 as const]}}));
 const otherBattery=solutions.map(s=>({...s,components:s.components.map(c=>c.productType==='ci_battery'?{...c,productId:'other-battery',model:'Bateria alternativa'}:c)}));
 const options=buildCiModelOptions([...solutions,...otherRule,...otherBattery]);
 expect(options.assemblies).toHaveLength(2);
 expect(options.assemblies.find(s=>s.batteryId===catalog.batteries[0].battery_id)?.voltages).toEqual([220,380]);
 expect(options.assemblies.find(s=>s.batteryId==='other-battery')?.voltages).toEqual([380]);
 expect(ciModelVoltageLabel([],380)).toContain('não documentada');
 expect(ciModelVoltageLabel([220],380)).toContain('incompatível');
});
