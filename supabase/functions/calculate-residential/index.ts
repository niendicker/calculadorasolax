import { createClient } from 'jsr:@supabase/supabase-js@2';
import {
  batteryTopologyMap,
  buildSolutionPayload,
  clampNumber,
  effectiveTargetEnergyWh,
  effectiveTargetPowerW,
  gridTopologyMap,
  inverterSatisfiesRequiredFlags,
  matchingEssBatteryConfig,
  normalizeStandardGridTopology,
  requiredInverterFlags,
  solutionSupportsMicrogrid,
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

interface InverterCapabilities {
  model: string;
  flags: string[] | null;
  max_power_per_phase_w: number | null;
}

// Every response — success or error — must carry this header: the browser
// enforces CORS on the actual response, not just the OPTIONS preflight, so
// an error path missing it makes the request fail as an opaque network
// error instead of surfacing the specific status/body to the client.
const CORS_HEADERS = { 'Access-Control-Allow-Origin': '*' };

function jsonResponse(body: unknown, init: { status?: number } = {}): Response {
  return Response.json(body, { ...init, headers: CORS_HEADERS });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        ...CORS_HEADERS,
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  try {
    let rawOptions: unknown;
    try {
      rawOptions = await req.json();
    } catch {
      return jsonResponse(
        { error: 'invalid_payload', details: ['body must be valid JSON'] },
        { status: 400 }
      );
    }

    const validationErrors = validateResidentialOptions(rawOptions);
    if (validationErrors.length > 0) {
      return jsonResponse(
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
    const desiredFeatures = options.desiredFeatures ?? [];

    // Target storage: the full daily consumption, stored in Wh, with no
    // operational margin for now — the proposed solution's available energy
    // must cover at least what's consumed in a day. When Tarifa Branca is
    // active, this (and minRatedPowerW/targetPowerW below) is combined with
    // the customer's tariff-window requirements instead of used as-is.
    const targetEnergyWh = effectiveTargetEnergyWh(desiredFeatures, options.whiteTariff, dailyKwh * 1000);
    // The white-tariff window's required power must be *sustained*, so it has
    // to raise the inverter's continuous rating (rated_power_w), not just its
    // brief-surge rating (peak_power_w) — otherwise an inverter that can only
    // deliver that power for a few seconds could get approved for a multi-hour
    // tariff window.
    const minRatedPowerW = effectiveTargetPowerW(desiredFeatures, options.whiteTariff, nominalW);
    const targetPowerW = effectiveTargetPowerW(desiredFeatures, options.whiteTariff, peakW);
    let usefulEnergyWhPerBattery: number | null = null;

    if (options.batteryModel) {
      const { data: batterySpec, error: batterySpecErr } = await supabase
        .from('batteries')
        .select('capacity_kwh, min_soc_percent')
        .eq('model', options.batteryModel)
        .maybeSingle();

      if (batterySpecErr) {
        console.error(batterySpecErr);
        return jsonResponse({ error: 'battery_lookup_failed' }, { status: 500 });
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
      .gte('rated_power_w', minRatedPowerW)
      .gte('peak_power_w', targetPowerW)
      .order('rated_power_w', { ascending: true })
      .order('available_energy_wh', { ascending: true })
      .order('battery_quantity', { ascending: true })
      // Generous safety cap, not a real page size: every filter that can
      // reject a row here (feature flags, ESS rules, microgrid) runs in JS
      // *after* this fetch, so a tight limit can silently truncate away the
      // only rows that would've passed those filters. 500 is ~10x the
      // largest single topology/battery-topology bucket in the catalog today.
      .limit(500);

    if (usefulEnergyWhPerBattery === null) {
      solutionQuery = solutionQuery.gte('available_energy_wh', targetEnergyWh);
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
      return jsonResponse({ error: 'solution_lookup_failed' }, { status: 500 });
    }

    if (!solutions?.length) {
      return jsonResponse({ error: 'no_approved_solution' }, { status: 422 });
    }

    let compatibleSolutions = solutions as ApprovedSolution[];

    if (usefulEnergyWhPerBattery !== null) {
      compatibleSolutions = compatibleSolutions.filter(
        (solution) => usefulEnergyWhPerBattery! * solution.battery_quantity >= targetEnergyWh
      );

      if (!compatibleSolutions.length) {
        return jsonResponse({ error: 'no_approved_solution' }, { status: 422 });
      }
    }

    const microgridSelected = desiredFeatures.includes('microgrid');
    const microgridConfig = microgridSelected ? options.microgrid : null;
    const microgridIsFundamental = microgridConfig?.isFundamentalRequirement ?? false;

    // When microgrid is selected but not a hard requirement, the baseline
    // ("economic") recommendation below is computed without it — the
    // dedicated microgrid block further down decides whether to also offer
    // a microgrid-compatible alternative on top of this baseline.
    const hardFilterFeatures =
      microgridSelected && !microgridIsFundamental
        ? desiredFeatures.filter((feature) => feature !== 'microgrid')
        : desiredFeatures;

    const requiredFlags = requiredInverterFlags(hardFilterFeatures);

    if (requiredFlags.length > 0) {
      const candidateInverterModels = Array.from(
        new Set(compatibleSolutions.map((solution) => solution.inverter_model))
      );

      const { data: candidateInverters, error: inverterErr } = await supabase
        .from('inverters')
        .select('model, flags, max_power_per_phase_w')
        .in('model', candidateInverterModels);

      if (inverterErr) {
        console.error(inverterErr);
        return jsonResponse({ error: 'inverter_lookup_failed' }, { status: 500 });
      }

      const matchingModels = new Set(
        ((candidateInverters ?? []) as InverterCapabilities[])
          .filter((inverter) => inverterSatisfiesRequiredFlags(inverter.flags, requiredFlags))
          .map((inverter) => inverter.model)
      );

      compatibleSolutions = compatibleSolutions.filter((solution) => matchingModels.has(solution.inverter_model));

      if (!compatibleSolutions.length) {
        return jsonResponse({ error: 'no_solution_matches_desired_features' }, { status: 422 });
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
        return jsonResponse({ error: 'ess_rules_lookup_failed' }, { status: 500 });
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
      return jsonResponse({ error: 'no_compatible_ess_rule' }, { status: 422 });
    }

    // Microgrid compatibility is checked last, against whatever already
    // satisfies every other requirement — it needs the inverter's own
    // max_power_per_phase_w, which the generic flag-filter above may not have
    // fetched (e.g. when microgrid was excluded from hardFilterFeatures, or
    // when it's the only flag-based feature selected).
    let microgridAlternativeSolution: ApprovedSolution | null = null;

    if (microgridConfig) {
      const candidateModels = Array.from(new Set(compatibleSolutions.map((solution) => solution.inverter_model)));

      const { data: microgridInverters, error: microgridInverterErr } = await supabase
        .from('inverters')
        .select('model, flags, max_power_per_phase_w')
        .in('model', candidateModels);

      if (microgridInverterErr) {
        console.error(microgridInverterErr);
        return jsonResponse({ error: 'inverter_lookup_failed' }, { status: 500 });
      }

      const inverterByModel = new Map(
        ((microgridInverters ?? []) as InverterCapabilities[]).map((inverter) => [inverter.model, inverter])
      );

      const microgridCompatibleSolutions = compatibleSolutions.filter((candidate) => {
        const inverter = inverterByModel.get(candidate.inverter_model);
        if (!inverter) return false;
        if (!inverterSatisfiesRequiredFlags(inverter.flags, ['microgrid'])) return false;
        return solutionSupportsMicrogrid(candidate, inverter.max_power_per_phase_w, microgridConfig);
      });

      if (microgridIsFundamental) {
        if (!microgridCompatibleSolutions.length) {
          return jsonResponse({ error: 'no_solution_matches_desired_features' }, { status: 422 });
        }
        compatibleSolutions = microgridCompatibleSolutions;
      } else {
        const economicTop = compatibleSolutions[0];
        const microgridTop = microgridCompatibleSolutions[0] ?? null;
        if (microgridTop && microgridTop.id !== economicTop.id) {
          microgridAlternativeSolution = microgridTop;
        }
      }
    }

    const solution = compatibleSolutions[0] as ApprovedSolution;

    // PV recommendation: dailyKwh / 4 peak sun hours (Brazil average); null when
    // the customer opted out of PV sizing via the 'no_pv' desired feature.
    const pvPowerKw = desiredFeatures.includes('no_pv') ? null : dailyKwh / 4;

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
      return jsonResponse({ error: 'accessory_rules_lookup_failed' }, { status: 500 });
    }

    const accessoryRules = (rules ?? []) as unknown as AccessoryRule[];

    const payload = buildSolutionPayload(solution, {
      usefulEnergyWhPerBattery,
      pvPowerKw,
      accessoryRules,
      standardGridTopology,
    });

    if (microgridAlternativeSolution) {
      const microgridAlternative = buildSolutionPayload(microgridAlternativeSolution, {
        usefulEnergyWhPerBattery,
        pvPowerKw,
        accessoryRules,
        standardGridTopology,
      });
      return jsonResponse({ ...payload, microgridAlternative });
    }

    return jsonResponse(payload);
  } catch (err) {
    console.error(err);
    return jsonResponse({ error: 'internal' }, { status: 500 });
  }
});
