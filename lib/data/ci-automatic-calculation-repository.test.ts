import {it,expect,vi} from 'vitest';
import type {SupabaseClient} from '@supabase/supabase-js';
import {modularOptions} from '@/supabase/functions/_shared/commercial-industrial/modular.test-fixtures';
import {calculateAutomaticCi} from './ci-automatic-calculation-repository';
const calculate=vi.hoisted(()=>vi.fn());
vi.mock('./ci-persisted-calculation-repository',()=>({calculatePersistedCi:calculate}));
it('delegates automatic search to the persisted common pipeline',async()=>{const db={} as SupabaseClient;const options={...modularOptions(),bessSystem:{kind:'automatic' as const,minPowerKw:150,minEnergyKwh:300}};calculate.mockResolvedValue({engineVersion:'ci-grouped-v1'});await expect(calculateAutomaticCi(db,options)).resolves.toEqual({engineVersion:'ci-grouped-v1'});expect(calculate).toHaveBeenCalledWith(db,options);});
