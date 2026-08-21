import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { invokeResidentialCalculation, recordSimulation } from '@/lib/data/calculation-repository';
import { getNetworkErrorMessage, resolveCalculationErrorMessage } from '@/lib/calculation-error-messages';
import type { ResidentialOptions, Solution } from '@/lib/types';

type RequestBody = ResidentialOptions & {
  batteryModel: string;
  projectName?: string | null;
  peakW?: number;
  dailyKwh?: number;
  isDemo?: boolean;
};

export async function POST(request: Request) {
  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
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
    (body.dailyKwh !== undefined && (typeof body.dailyKwh !== 'number' || !Number.isFinite(body.dailyKwh) || body.dailyKwh < 0)) ||
    (body.isDemo !== undefined && typeof body.isDemo !== 'boolean')
  ) {
    return NextResponse.json({ error: 'Dados de cálculo inválidos.' }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });

  try {
    const { projectName, peakW, dailyKwh, isDemo, ...calculationInput } = body;
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
    const { error: simulationError } = isDemo === true ? { error: null } : await recordSimulation(supabase, simulationPayload);

    return NextResponse.json({
      solution,
      ...(simulationError ? { simulationPending: true, simulationPayload } : {}),
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: getNetworkErrorMessage() }, { status: 502 });
  }
}
