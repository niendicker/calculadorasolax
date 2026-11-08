// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,render,screen} from '@testing-library/react';
import {CiGeneratedSolutionsEditor} from './CiGeneratedSolutionsEditor';

afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('explains why 440 published solutions are unavailable and offers regeneration',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({generation:{expected_count:440,is_current:false,published_at:'2026-11-08T01:05:30Z',invalidated_at:'2026-11-08T01:06:21Z',invalidation_reason:'ci_bess_products',diagnostics:[]}})}));
 render(<CiGeneratedSolutionsEditor/>);
 expect(await screen.findByText(/440 soluções/)).toBeTruthy();
 expect(screen.getByText(/Geração invalidada após salvar o cadastro de gabinetes integrados/)).toBeTruthy();
 expect(screen.getByRole('button',{name:'Gerar soluções'})).toBeEnabled();
 expect(screen.queryByText('Geração publicada e atual')).toBeNull();
});
