import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { consumeRateLimit, getRequestClientKey, rateLimitResponse } from '@/lib/security/rate-limit';
import { getNetworkErrorMessage, resolveCommercialIndustrialCalculationErrorMessage } from '@/lib/calculation-error-messages';
import {
  cacheProjectCalculationResult,
  findBessProductModel,
  findOwnCiProject,
  findUserBessUnitPrice,
  invokeCommercialIndustrialCalculation,
  listCalculationRuns,
  recordCalculationRun,
} from '@/lib/data/commercial-industrial-calculation-repository';

/** The canonical (and only) C&I calculation route (plan section 7) — no
 * parallel `/api/calculations/commercial-industrial` alongside it. Unlike
 * calculate-residential's route, the options never come from the request
 * body: they are whatever the project's own `calculation_options` already
 * holds (kept current by the workspace's autosave), so a calculation always
 * reflects the project's actual saved state, not an arbitrary client-
 * submitted payload. The body only carries things that are NOT part of the
 * saved configuration — currently nothing, reserved for e.g. a future
 * targetDemandKw override. */
export async function POST(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });

  const rate = consumeRateLimit(`ci-calculation:${user.id}:${getRequestClientKey(request)}`, { limit: 30, windowMs: 60_000 });
  if (!rate.allowed) return rateLimitResponse(rate.retryAfterSeconds);

  let project;
  try {
    project = await findOwnCiProject(supabase, projectId);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: getNetworkErrorMessage() }, { status: 502 });
  }
  // RLS already makes "belongs to someone else" and "doesn't exist" the
  // same outcome here — never distinguish them in the response.
  if (!project) return NextResponse.json({ error: 'Projeto não encontrado.' }, { status: 404 });
  if (project.installation_type !== 'commercial_industrial') {
    return NextResponse.json({ error: 'Este endpoint é exclusivo para projetos C&I.' }, { status: 400 });
  }

  const options = project.calculation_options as { bessProductId?: string | null } | null;
  if (!options || Object.keys(options).length === 0 || !options.bessProductId) {
    return NextResponse.json(
      { error: 'Configure a curva de carga, a tarifa e o produto BESS antes de calcular.' },
      { status: 422 }
    );
  }

  let unitPriceBrl: number | null;
  try {
    const model = await findBessProductModel(supabase, options.bessProductId);
    if (!model) return NextResponse.json({ error: 'O produto BESS selecionado não foi encontrado ou não está mais ativo no catálogo.' }, { status: 422 });
    unitPriceBrl = await findUserBessUnitPrice(supabase, user.id, model);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: getNetworkErrorMessage() }, { status: 502 });
  }
  if (unitPriceBrl === null) {
    return NextResponse.json(
      { error: 'Defina o preço deste produto BESS no seu Portfólio antes de calcular.' },
      { status: 422 }
    );
  }

  try {
    const { data, error: functionError } = await invokeCommercialIndustrialCalculation(supabase, { options, unitPriceBrl });
    if (functionError || !data) {
      return NextResponse.json({ error: await resolveCommercialIndustrialCalculationErrorMessage(functionError) }, { status: 422 });
    }

    const result = data as { engineVersion: string; inputFingerprint: string; recommendation: { scenarioId: string } };

    const { error: recordError } = await recordCalculationRun(supabase, {
      project_id: projectId,
      user_id: user.id,
      installation_type: 'commercial_industrial',
      engine_version: result.engineVersion,
      input_fingerprint: result.inputFingerprint,
      input_snapshot: { options, unitPriceBrl },
      result_snapshot: result,
      selected_scenario_id: result.recommendation.scenarioId,
    });
    if (recordError) {
      // The calculation itself succeeded — a history-write hiccup shouldn't
      // cost the user their result. Logged for follow-up, not surfaced.
      console.error('recordCalculationRun failed', recordError);
    }

    const { error: cacheError } = await cacheProjectCalculationResult(supabase, projectId, result, result.engineVersion);
    if (cacheError) console.error('cacheProjectCalculationResult failed', cacheError);

    return NextResponse.json(result);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: getNetworkErrorMessage() }, { status: 502 });
  }
}

/** Lightweight run history for the project — engine_version/status/created_at
 * per run, not the full snapshots (plan section 6.3: don't return more than
 * a view needs). Loading one specific run's full detail is a separate
 * concern once the UI (Fase 6) needs it. */
export async function GET(_request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });

  let project;
  try {
    project = await findOwnCiProject(supabase, projectId);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: getNetworkErrorMessage() }, { status: 502 });
  }
  if (!project) return NextResponse.json({ error: 'Projeto não encontrado.' }, { status: 404 });

  try {
    const runs = await listCalculationRuns(supabase, projectId);
    return NextResponse.json({ runs });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: getNetworkErrorMessage() }, { status: 502 });
  }
}
