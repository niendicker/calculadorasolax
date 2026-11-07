import {it,expect,vi} from 'vitest';
import type {SupabaseClient} from '@supabase/supabase-js';
import {modularOptions} from '@/supabase/functions/_shared/commercial-industrial/modular.test-fixtures';
import {invokeCommercialIndustrialCalculation} from './commercial-industrial-calculation-repository';
const calculate=vi.hoisted(()=>vi.fn());
vi.mock('./ci-persisted-calculation-repository',()=>({calculatePersistedCi:calculate}));
it('routes legacy modular, integrated and fixed grouped configurations through the same pipeline',async()=>{const db={} as SupabaseClient;for(const bessSystem of [modularOptions().bessSystem,{kind:'integrated' as const},{kind:'solution' as const,solutionKey:'group'}]){const options={...modularOptions(),bessSystem};calculate.mockResolvedValue({engineVersion:'ci-grouped-v1'});const result=await invokeCommercialIndustrialCalculation(db,{options:{...options},unitPriceBrl:0});expect(result.error).toBeNull();expect(calculate).toHaveBeenCalledWith(db,options);}});
it('returns an actionable catalog failure without calling an older edge implementation',async()=>{calculate.mockRejectedValueOnce(new Error('Gere novamente as soluções.'));const result=await invokeCommercialIndustrialCalculation({} as SupabaseClient,{options:{...modularOptions()},unitPriceBrl:0});expect(result.error).toMatchObject({code:'ci_calculation',message:'Gere novamente as soluções.'});});
