import {beforeEach,it,expect,vi} from 'vitest';
const mocks=vi.hoisted(()=>({getUser:vi.fn(),role:vi.fn(),generation:vi.fn(),publish:vi.fn(),rate:vi.fn()}));
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>({auth:{getUser:mocks.getUser}})}));
vi.mock('@/lib/data/admin-repository',()=>({getProfileRole:mocks.role}));
vi.mock('@/lib/data/ci-generated-solutions-repository',()=>({getCiSolutionGeneration:mocks.generation,publishCiGeneratedSolutions:mocks.publish}));
vi.mock('@/lib/security/rate-limit',()=>({consumeRateLimit:mocks.rate,rateLimitResponse:()=>new Response(null,{status:429})}));
import {GET,POST} from './route';
beforeEach(()=>{vi.clearAllMocks();mocks.getUser.mockResolvedValue({data:{user:{id:'admin'}}});mocks.role.mockResolvedValue({role:'admin',error:null});mocks.rate.mockReturnValue({allowed:true});mocks.generation.mockResolvedValue(null);mocks.publish.mockResolvedValue({count:20});});
it('requires authenticated administrator access for generation and status',async()=>{
 mocks.getUser.mockResolvedValueOnce({data:{user:null}});expect((await POST()).status).toBe(401);
 mocks.role.mockResolvedValue({role:'user'});expect((await POST()).status).toBe(403);expect((await GET()).status).toBe(403);expect(mocks.publish).not.toHaveBeenCalled();
});
it('publishes server-generated candidates and exposes status',async()=>{
 expect(await (await GET()).json()).toEqual({generation:null});expect(await (await POST()).json()).toEqual({count:20});expect(mocks.publish).toHaveBeenCalledTimes(1);
});
it('limits generation requests and exposes actionable stale-catalog failure',async()=>{
 mocks.rate.mockReturnValueOnce({allowed:false});expect((await POST()).status).toBe(429);mocks.publish.mockRejectedValueOnce(new Error('O catálogo mudou.'));const response=await POST();expect(response.status).toBe(409);expect(await response.json()).toEqual({error:'O catálogo mudou.'});
});
