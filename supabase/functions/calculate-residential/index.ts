import { createClient } from 'jsr:@supabase/supabase-js@2';
import {
  batteryTopologyMap,
  clampNumber,
  gridTopologyMap,
  matchingEssBatteryConfig,
  normalizeStandardGridTopology,
  ruleMatches,
  standardGridTopologyMap,
  totalDailyKwh,
  totalNominalW,
  totalPeakW,
  validateResidentialOptions,
  type AccessoryRule,
  type ApprovedSolution,
  type BatteryCatalogRow,
  type EssCompatibilityRule,
  type ResidentialOptions,
} from './logic.ts';

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
    let rawOptions: unknown;
    try {
      rawOptions = await req.json();
    } catch {
      return Response.json(
        { error: 'invalid_payload', details: ['body must be valid JSON'] },
        { status: 400 }
      );
    }

    const validationErrors = validateResidentialOptions(rawOptions);
    if (validationErrors.length > 0) {
      return Response.json(
        { error: 'invalid_payload', details: validationErrors },
        { status: 400 }
      );
    }

    const options = rawOptions as ResidentialOptions;

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const nominalW = totalNominalW(options.loads);
    const peakW = totalPeakW(options.loads, options.peakCalcMode ?? 'sum');
    const dailyKwh = totalDailyKwh(options.loads);
    const gridTopology = gridTopologyMap[options.gridType];
    const standardGridTopology = standardGridTopologyMap[options.gridType];
    const batteryTopology = batteryTopologyMap[options.topology];

    // Target storage: daily consumption x 0.5 (50% coverage), stored in Wh.
    const targetEnergyWh = dailyKwh * 0.5 * 1000;
    let usefulEnergyWhPerBattery: number | null = null;

    if (options.batteryModel) {
      const { data: batterySpec, error: batterySpecErr } = await supabase
        .from('batteries')
        .select('capacity_kwh, min_soc_percent')
        .eq('model', options.batteryModel)
        .maybeSingle();

      if (batterySpecErr) {
        console.error(batterySpecErr);
        return Response.json({ error: 'battery_lookup_failed' }, { status: 500 });
      }

      if (batterySpec) {
        const spec = batterySpec as BatteryCatalogRow;
        const minSocPercent = Number(spec.min_soc_percent ?? 10);
        usefulEnergyWhPerBattery = Number(spec.capacity_kwh) * (1 - minSocPercent / 100) * 1000;
      }
    }

    let solutionQuery = supabase
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
      .gte('rated_power_w', nominalW)
      .gte('peak_power_w', peakW)
      .order('rated_power_w', { ascending: true })
      .order('available_energy_wh', { ascending: true })
      .order('battery_quantity', { ascending: true })
      .limit(50);

    if (usefulEnergyWhPerBattery === null) {
      solutionQuery = solutionQuery.gte('available_energy_wh', targetEnergyWh * 0.8);
    }

    if (options.batteryModel) {
      solutionQuery = solutionQuery.eq('battery_model', options.batteryModel);
    }

    if (options.inverterModel) {
      solutionQuery = solutionQuery.eq('inverter_model', options.inverterModel);
    }

    const { data: solutions, error: solutionErr } = await solutionQuery;

    if (solutionErr) {
      console.error(solutionErr);
      return Response.json({ error: 'solution_lookup_failed' }, { status: 500 });
    }

    if (!solutions?.length) {
      return Response.json({ error: 'no_approved_solution' }, { status: 422 });
    }

    let compatibleSolutions = solutions as ApprovedSolution[];

    if (usefulEnergyWhPerBattery !== null) {
      compatibleSolutions = compatibleSolutions.filter(
        (solution) => usefulEnergyWhPerBattery! * solution.battery_quantity >= targetEnergyWh * 0.8
      );

      if (!compatibleSolutions.length) {
        return Response.json({ error: 'no_approved_solution' }, { status: 422 });
      }
    }

    if (options.batteryModel) {
      const { data: essRules, error: essRulesErr } = await supabase
        .from('ess_compatibility_rules')
        .select(
          'id, inverter_model, battery_model, battery_topology, grid_topology, max_parallel_inverters, min_battery_qty, max_battery_qty, battery_configs, active'
        )
        .eq('active', true);

      if (essRulesErr) {
        console.error(essRulesErr);
        return Response.json({ error: 'ess_rules_lookup_failed' }, { status: 500 });
      }

      const relevantRules = ((essRules ?? []) as EssCompatibilityRule[]).filter((rule) => {
        const config = matchingEssBatteryConfig(rule, options.batteryModel!);
        return (
          config &&
          (!config.battery_topology || config.battery_topology === batteryTopology) &&
          (!rule.grid_topology || normalizeStandardGridTopology(rule.grid_topology) === standardGridTopology)
        );
      });

      if (relevantRules.length > 0) {
        compatibleSolutions = compatibleSolutions.filter((solution) =>
          relevantRules.some((rule) => {
            const config = matchingEssBatteryConfig(rule, options.batteryModel!);
            if (!config) return false;
            const maxParallel = clampNumber(rule.max_parallel_inverters, 1, 10, 1);
            const minBatteryQty = clampNumber(config.min_battery_qty, 1, 7, 1);
            const maxBatteryQty = clampNumber(config.max_battery_qty, 1, 15, 1);
            return (
              rule.inverter_model === solution.inverter_model &&
              solution.inverter_quantity <= maxParallel &&
              solution.battery_quantity >= minBatteryQty &&
              solution.battery_quantity <= maxBatteryQty
            );
          })
        );
      }
    }

    if (!compatibleSolutions.length) {
      return Response.json({ error: 'no_compatible_ess_rule' }, { status: 422 });
    }

    const solution = compatibleSolutions[0] as ApprovedSolution;
    const availableEnergyWh =
      usefulEnergyWhPerBattery === null
        ? solution.available_energy_wh
        : Math.round(usefulEnergyWhPerBattery * solution.battery_quantity);

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
        inverter_models,
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
      if (!rule.accessories?.model || !ruleMatches(solution, rule, standardGridTopology)) continue;

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
        availableEnergyWh,
        pvPowerKw: Math.ceil(pvPowerKw * 10) / 10,
        accessories,
        comments: Array.from(new Set([...solution.comments, ...automaticComments])),
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
