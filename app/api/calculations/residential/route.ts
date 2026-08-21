import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import type { ResidentialCalculationRequest } from '@/lib/api-contracts';
import { createClient } from '@/lib/supabase/server';
import { invokeResidentialCalculation, recordSimulation } from '@/lib/data/calculation-repository';
import { getNetworkErrorMessage, resolveCalculationErrorMessage } from '@/lib/calculation-error-messages';
import type { Solution } from '@/lib/types';
import { DEMO_SESSION_COOKIE, isValidDemoSessionToken } from '@/lib/demo/demo-session';
import { consumeRateLimit, getRequestClientKey, rateLimitResponse } from '@/lib/security/rate-limit';

export async function POST(request: Request) {
  let body: ResidentialCalculationRequest;
  try {
    body = (await request.json()) as ResidentialCalculationRequest;
  } catch {
    return NextResponse.json({ error: 'Dados de cálculo inválidos.' }, { status: 400 });
  }

  if (
    !body ||
    typeof body.batteryModel !== 'string' ||
    body.batteryModel.trim().length === 0 ||
    body.batteryModel.length > 200 ||
    !Array.isArray(body.loads) ||
    (body.projectName !== undefined && body.projectName !== null && (typeof body.projectName !== 'string' || body.projectName.length > 200)) ||
    (body.peakW !== undefined && (typeof body.peakW !== 'number' || !Number.isFinite(body.peakW) || body.peakW < 0)) ||
    (body.dailyKwh !== undefined && (typeof body.dailyKwh !== 'number' || !Number.isFinite(body.dailyKwh) || body.dailyKwh < 0))
  ) {
    return NextResponse.json({ error: 'Dados de cálculo inválidos.' }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  const rate = consumeRateLimit(`calculation:${user.id}:${getRequestClientKey(request)}`, { limit: 30, windowMs: 60_000 });
  if (!rate.allowed) return rateLimitResponse(rate.retryAfterSeconds);

  try {
    const { projectName, peakW, dailyKwh, ...calculationInput } = body;
    const { data, error: functionError } = await invokeResidentialCalculation(supabase, {
      ...calculationInput,
      batteryModel: body.batteryModel,
    });

    if (functionError || !data) {
      return NextResponse.json({ error: await resolveCalculationErrorMessage(functionError) }, { status: 422 });
    }

    const solution = data as Solution;
    const simulationPayload = {
      user_id: user.id,
      project_name: projectName ?? null,
      topology: body.topology,
      grid_type: body.gridType,
      peak_w: peakW ?? 0,
      daily_kwh: dailyKwh ?? 0,
      loads: body.loads,
      inverter_model: solution.inverterModel,
      battery_model: solution.batteryModel,
      accessories: solution.accessories.map((accessory) => accessory.model),
      solution_code: solution.solutionCode ?? null,
    };
    const demoSession = isValidDemoSessionToken((await cookies()).get(DEMO_SESSION_COOKIE)?.value);
    const { error: simulationError } = demoSession ? { error: null } : await recordSimulation(supabase, simulationPayload);

    return NextResponse.json({
      solution,
      ...(simulationError ? { simulationPending: true, simulationPayload } : {}),
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: getNetworkErrorMessage() }, { status: 502 });
  }
}
