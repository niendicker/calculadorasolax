import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getProfileRole } from '@/lib/data/admin-repository';
import { getCiSolutionGeneration, publishCiGeneratedSolutions } from '@/lib/data/ci-generated-solutions-repository';
import { consumeRateLimit, rateLimitResponse } from '@/lib/security/rate-limit';

async function authorize(){
  const db=await createClient();const {data:{user}}=await db.auth.getUser();
  if(!user)return {response:NextResponse.json({error:'Não autenticado.'},{status:401})} as const;
  const {role,error}=await getProfileRole(db,user.id);
  if(error||role!=='admin')return {response:NextResponse.json({error:'Acesso negado.'},{status:403})} as const;
  return {db,user} as const;
}
export async function GET(){
  const auth=await authorize();if(auth.response)return auth.response;
  try{return NextResponse.json({generation:await getCiSolutionGeneration(auth.db)});}
  catch(cause){return NextResponse.json({error:cause instanceof Error?cause.message:'Não foi possível consultar a geração.'},{status:500});}
}
export async function POST(){
  const auth=await authorize();if(auth.response)return auth.response;
  const rate=consumeRateLimit(`ci-generate:${auth.user.id}`,{limit:5,windowMs:60000});if(!rate.allowed)return rateLimitResponse(rate.retryAfterSeconds);
  try{return NextResponse.json(await publishCiGeneratedSolutions(auth.db));}
  catch(cause){return NextResponse.json({error:cause instanceof Error?cause.message:'Não foi possível gerar as soluções C&I.'},{status:409});}
}
