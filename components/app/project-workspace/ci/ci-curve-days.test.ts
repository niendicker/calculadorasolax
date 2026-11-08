import {expect,it} from 'vitest';
import type {LoadCurve} from '@/supabase/functions/_shared/commercial-industrial/types';
import {ciCurveDays,ciDayRange,ciEditorRange} from './ci-curve-days';
function curve(timezone='America/Manaus'):LoadCurve{return {timezone,resolutionMinutes:60,periodStart:'2026-01-04',periodEnd:'2026-01-05',source:'csv',profileBasis:'representative_period',points:[{timestamp:'2026-01-05T03:00:00Z',powerKw:20},{timestamp:'2026-01-05T04:00:00Z',powerKw:40},{timestamp:'2026-01-05T05:00:00Z',powerKw:60}]};}
it('groups actual samples by project timezone across a weekend midnight',()=>{
 const days=ciCurveDays(curve());
 expect(days.map(d=>({date:d.date,pattern:d.pattern,indices:d.indices,minutes:d.minutes}))).toEqual([{date:'2026-01-04',pattern:'weekend',indices:[0],minutes:[1380]},{date:'2026-01-05',pattern:'weekday',indices:[1,2],minutes:[0,60]}]);
 expect(ciCurveDays(curve('America/Sao_Paulo'))).toHaveLength(1);
 expect(ciCurveDays(null)).toEqual([]);
});
it('snaps a quarter-hour editor selection to whole original hourly samples',()=>{
 const source=curve(),day=ciCurveDays(source)[1];
 const range=ciDayRange(source,day,{startIndex:1,endIndex:4});
 expect(range).toEqual({startIndex:1,endIndex:2});
 expect(ciEditorRange(source,day,range)).toEqual({startIndex:0,endIndex:7});
 expect(ciEditorRange(source,day,{startIndex:0,endIndex:1})).toBeNull();
 expect(ciDayRange(source,day,{startIndex:40,endIndex:44})).toBeNull();
});
