import { createClient } from 'jsr:@supabase/supabase-js@2';

interface SingleLoad {
  powerW: number;
  hoursPerDay: number;
  qty: number;
}

interface ResidentialOptions {
  topology: 'HighVoltage' | 'LowVoltage';
  gridType: 'singlePhase_220' | 'splitPhase_220' | 'threePhase_220' | 'threePhase_380';
  loads: SingleLoad[];
  microGrid: 'Gerador' | 'Microinversor' | 'Desabilitada' | null;
}

interface ApprovedSolution {
  id: string;
  source_file: string;
  solution_code: string;
  inverter_model: string;
  inverter_quantity: number;
  battery_ports_used: number;
  rated_power_w: number;
  peak_power_w: number;
  grid_topology: '1p_220V' | '3p_220V' | '3p_380V';
  battery_model: string;
  battery_topology: 'HV' | 'LV';
  battery_quantity: number;
  battery_power_w: number;
  available_energy_wh: number;
  accessories: { model: string | null; quantity: number }[];
  comments: string[];
}

interface AccessoryRule {
  id: string;
  name: string;
  inclusion: 'required' | 'optional';
  trigger_metric: 'inverter_quantity' | 'battery_quantity' | 'battery_ports_used';
  min_quantity: number;
  inverter_model: string | null;
  battery_model: string | null;
  grid_topology: ApprovedSolution['grid_topology'] | null;
  battery_topology: ApprovedSolution['battery_topology'] | null;
  quantity_per_match: number;
  comment: string | null;
  accessories: { model: string } | null;
}

const batteryTopologyMap: Record<ResidentialOptions['topology'], 'HV' | 'LV'> = {
  HighVoltage: 'HV',
  LowVoltage: 'LV',
};

const gridTopologyMap: Record<ResidentialOptions['gridType'], ApprovedSolution['grid_topology']> = {
  singlePhase_220: '1p_220V',
  splitPhase_220: '1p_220V',
  threePhase_220: '3p_220V',
  threePhase_380: '3p_380V',
};

function totalPeakW(loads: SingleLoad[]): number {
  return loads.reduce((acc, l) => acc + l.powerW * l.qty, 0);
}

function totalDailyKwh(loads: SingleLoad[]): number {
  return loads.reduce((acc, l) => acc + (l.powerW * l.hoursPerDay * l.qty) / 1000, 0);
}

function ruleMetricValue(solution: ApprovedSolution, metric: AccessoryRule['trigger_metric']): number {
  if (metric === 'inverter_quantity') return solution.inverter_quantity;
  if (metric === 'battery_quantity') return solution.battery_quantity;
  return solution.battery_ports_used;
}

function ruleMatches(solution: ApprovedSolution, rule: AccessoryRule): boolean {
  if (rule.inverter_model && rule.inverter_model !== solution.inverter_model) return false;
  if (rule.battery_model && rule.battery_model !== solution.battery_model) return false;
  if (rule.grid_topology && rule.grid_topology !== solution.grid_topology) return false;
  if (rule.battery_topology && rule.battery_topology !== solution.battery_topology) return false;
  return ruleMetricValue(solution, rule.trigger_metric) >= rule.min_quantity;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  try {
    const options: ResidentialOptions = await req.json();

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const peakW = totalPeakW(options.loads);
    const dailyKwh = totalDailyKwh(options.loads);
    const gridTopology = gridTopologyMap[options.gridType];
    const batteryTopology = batteryTopologyMap[options.topology];

    // Target storage: daily consumption x 0.5 (50% coverage), stored in Wh.
    const targetEnergyWh = dailyKwh * 0.5 * 1000;

    const { data: solutions, error: solutionErr } = await supabase
      .from('approved_solutions')
      .select(
        `
        id,
        source_file,
        solution_code,
        inverter_model,
        inverter_quantity,
        battery_ports_used,
        rated_power_w,
        peak_power_w,
        grid_topology,
        battery_model,
        battery_topology,
        battery_quantity,
        battery_power_w,
        available_energy_wh,
        accessories,
        comments
      `
      )
      .eq('active', true)
      .eq('grid_topology', gridTopology)
      .eq('battery_topology', batteryTopology)
      .gte('rated_power_w', peakW)
      .gte('available_energy_wh', targetEnergyWh * 0.8)
      .order('rated_power_w', { ascending: true })
      .order('available_energy_wh', { ascending: true })
      .order('battery_quantity', { ascending: true })
      .limit(1);

    if (solutionErr) {
      console.error(solutionErr);
      return Response.json({ error: 'solution_lookup_failed' }, { status: 500 });
    }

    if (!solutions?.length) {
      return Response.json({ error: 'no_approved_solution' }, { status: 422 });
    }

    const solution = solutions[0] as ApprovedSolution;

    // PV recommendation: dailyKwh / 4 peak sun hours (Brazil average)
    const pvPowerKw = dailyKwh / 4;

    const accessories = solution.accessories
      .filter((accessory) => accessory.model && accessory.quantity > 0)
      .map((accessory) =>
        accessory.quantity > 1 ? `${accessory.model} x${accessory.quantity}` : accessory.model!
      );

    const { data: rules, error: rulesErr } = await supabase
      .from('accessory_rules')
      .select(
        `
        id,
        name,
        inclusion,
        trigger_metric,
        min_quantity,
        inverter_model,
        battery_model,
        grid_topology,
        battery_topology,
        quantity_per_match,
        comment,
        accessories (model)
      `
      )
      .eq('active', true);

    if (rulesErr) {
      console.error(rulesErr);
      return Response.json({ error: 'accessory_rules_lookup_failed' }, { status: 500 });
    }

    const normalizedAccessoryModels = new Set(
      accessories.map((accessory) => accessory.replace(/ x\d+$/, '').toLowerCase())
    );
    const automaticComments: string[] = [];

    for (const rule of (rules ?? []) as AccessoryRule[]) {
      if (!rule.accessories?.model || !ruleMatches(solution, rule)) continue;

      const normalizedModel = rule.accessories.model.toLowerCase();
      const label =
        rule.quantity_per_match > 1
          ? `${rule.accessories.model} x${rule.quantity_per_match}`
          : rule.accessories.model;

      if (!normalizedAccessoryModels.has(normalizedModel)) {
        accessories.push(rule.inclusion === 'optional' ? `${label} (opcional)` : label);
        normalizedAccessoryModels.add(normalizedModel);
      }

      if (rule.comment) automaticComments.push(rule.comment);
    }

    return Response.json(
      {
        solutionId: solution.id,
        solutionCode: solution.solution_code,
        sourceFile: solution.source_file,
        inverterId: solution.id,
        inverterModel: solution.inverter_model,
        inverterQty: solution.inverter_quantity,
        inverterRatedPowerW: solution.rated_power_w,
        inverterPeakPowerW: solution.peak_power_w,
        batteryId: solution.id,
        batteryModel: solution.battery_model,
        batteryQty: solution.battery_quantity,
        batteryPowerW: solution.battery_power_w,
        availableEnergyWh: solution.available_energy_wh,
        pvPowerKw: Math.ceil(pvPowerKw * 10) / 10,
        accessories,
        comments: [...solution.comments, ...automaticComments],
      },
      {
        headers: { 'Access-Control-Allow-Origin': '*' },
      }
    );
  } catch (err) {
    console.error(err);
    return Response.json({ error: 'internal' }, { status: 500 });
  }
});
