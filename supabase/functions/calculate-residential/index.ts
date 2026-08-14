import { createClient } from 'jsr:@supabase/supabase-js@2';
import {
  batteryTopologyMap,
  blockingDesiredFeatures,
  buildSolutionPayload,
  computeHardFilterFeatures,
  desiredPvPowerKw,
  effectiveTargetEnergyWh,
  effectiveTargetPowerW,
  filterSolutionsByPvCapacity,
  filterSolutionsByRequiredFlags,
  gridTopologyMap,
  rankByLeastShortfall,
  requiredInverterFlags,
  resolveMicrogridSelection,
  standardGridTopologyMap,
  totalDailyKwh,
  totalNominalW,
  totalPeakW,
  validateResidentialOptions,
  type AccessoryRule,
  type ApprovedSolution,
  type BatteryCatalogRow,
  type InverterCapabilities,
  type PvCapableInverter,
  type ResidentialOptions,
} from './logic.ts';

// Every response — success or error — must carry this header: the browser
// enforces CORS on the actual response, not just the OPTIONS preflight, so
// an error path missing it makes the request fail as an opaque network
// error instead of surfacing the specific status/body to the client.
const CORS_HEADERS = { 'Access-Control-Allow-Origin': '*' };

function jsonResponse(body: unknown, init: { status?: number } = {}): Response {
  return Response.json(body, { ...init, headers: CORS_HEADERS });
}

/** The full request→response orchestration (query cascade, flags/ESS/
 * microgrid filtering, PV/accessory enrichment), separated from Deno.serve
 * below so it can be exercised directly in tests with a fake `supabase`
 * client instead of needing a live Supabase instance — see index.test.ts. */
export async function handleCalculateResidential(
  req: Request,
  // createClient<any> (not the bare, untyped createClient) — an explicit
  // ReturnType<typeof createClient> here loses the generic Database default
  // supabase-js infers at a normal call site, which silently turns every
  // .rpc(name, args) call's args parameter into `undefined`.
  supabase: ReturnType<typeof createClient<any>>
): Promise<Response> {
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

    const nominalW = totalNominalW(options.loads);
    const peakW = totalPeakW(options.loads, options.peakCalcMode ?? 'sum');
    const dailyKwh = totalDailyKwh(options.loads, options.operationHours);
    const gridTopology = gridTopologyMap[options.gridType];
    const standardGridTopology = standardGridTopologyMap[options.gridType];
    const batteryTopology = batteryTopologyMap[options.topology];
    const desiredFeatures = options.desiredFeatures ?? [];

    // Target storage: the full daily consumption, stored in Wh, with no
    // operational margin for now — the proposed solution's available energy
    // must cover at least what's consumed in a day. When Tarifa Branca is
    // active, this (and minRatedPowerW/targetPowerW below) is combined with
    // the customer's tariff-window requirements instead of used as-is.
    let targetEnergyWh = effectiveTargetEnergyWh(desiredFeatures, options.whiteTariff, dailyKwh * 1000);
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
        .select('capacity_kwh, min_soc_percent, round_trip_efficiency_percent')
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
        targetEnergyWh = effectiveTargetEnergyWh(
          desiredFeatures,
          options.whiteTariff,
          dailyKwh * 1000,
          Number(spec.round_trip_efficiency_percent ?? 100)
        );
      }
    }

    const solutionColumns = `
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
    `;

    let strictQuery = supabase
      .from('approved_solutions')
      .select(solutionColumns)
      .eq('active', true)
      .eq('grid_topology', gridTopology)
      .eq('battery_topology', batteryTopology)
      .gte('rated_power_w', minRatedPowerW)
      .gte('peak_power_w', targetPowerW)
      // The inverter's own rating being sufficient isn't enough — the battery
      // bank has to be able to sustain the continuous load too, or the
      // inverter can't actually draw the power it's rated for.
      .gte('battery_power_w', minRatedPowerW)
      .order('rated_power_w', { ascending: true })
      .order('available_energy_wh', { ascending: true })
      .order('battery_power_w', { ascending: true })
      .order('battery_quantity', { ascending: true })
      // Generous safety cap, not a real page size: every filter that can
      // reject a row here (feature flags, ESS rules, microgrid) runs in JS
      // *after* this fetch, so a tight limit can silently truncate away the
      // only rows that would've passed those filters. 500 is ~10x the
      // largest single topology/battery-topology bucket in the catalog today.
      .limit(500);

    if (usefulEnergyWhPerBattery === null) {
      strictQuery = strictQuery.gte('available_energy_wh', targetEnergyWh);
    }
    if (options.batteryModel) strictQuery = strictQuery.eq('battery_model', options.batteryModel);
    if (options.inverterModel) strictQuery = strictQuery.eq('inverter_model', options.inverterModel);
    if (options.minInverterQty) strictQuery = strictQuery.gte('inverter_quantity', options.minInverterQty);

    const { data: strictRows, error: strictErr } = await strictQuery;

    if (strictErr) {
      console.error(strictErr);
      return jsonResponse({ error: 'solution_lookup_failed' }, { status: 500 });
    }

    let compatibleSolutions = (strictRows ?? []) as ApprovedSolution[];

    if (usefulEnergyWhPerBattery !== null) {
      compatibleSolutions = compatibleSolutions.filter(
        (solution) => usefulEnergyWhPerBattery! * solution.battery_quantity >= targetEnergyWh
      );
    }

    // The relaxed (topology/pinned-model-only) candidate pool, fetched at
    // most once and reused by every fallback below — not just the strict
    // power/energy shortfall case, but also when a downstream filter (flags,
    // ESS rule, microgrid) empties the strict-derived pool. Lazy: most
    // requests never need it, since the strict pool already survives every
    // stage.
    let relaxedRowsCache: ApprovedSolution[] | undefined;
    async function getRelaxedRows(): Promise<{ rows: ApprovedSolution[] } | { error: unknown }> {
      if (relaxedRowsCache) return { rows: relaxedRowsCache };
      let relaxedQuery = supabase
        .from('approved_solutions')
        .select(solutionColumns)
        .eq('active', true)
        .eq('grid_topology', gridTopology)
        .eq('battery_topology', batteryTopology)
        .limit(500);
      if (options.batteryModel) relaxedQuery = relaxedQuery.eq('battery_model', options.batteryModel);
      if (options.inverterModel) relaxedQuery = relaxedQuery.eq('inverter_model', options.inverterModel);
      if (options.minInverterQty) relaxedQuery = relaxedQuery.gte('inverter_quantity', options.minInverterQty);
      const { data, error } = await relaxedQuery;
      if (error) return { error };
      relaxedRowsCache = (data ?? []) as ApprovedSolution[];
      return { rows: relaxedRowsCache };
    }

    // Nothing fully satisfies every power/energy requirement — rather than a
    // dead-end error, fall back to the largest available combination for the
    // selected grid/battery topology and (if pinned) inverter/battery model,
    // ranked by least overall shortfall (see rankByLeastShortfall). The
    // frontend already renders negative margins and blocks PDF export for
    // this case (see MarginSummary/hasInsufficientSolution in SizingTab.tsx)
    // — this is the intentional "show what's available, not just a wall"
    // path, not an error condition. Identity/compatibility filters (grid and
    // battery topology, pinned models) stay exactly as strict.
    let usedRelaxedFallback = false;

    if (!compatibleSolutions.length) {
      const relaxed = await getRelaxedRows();
      if ('error' in relaxed) {
        console.error(relaxed.error);
        return jsonResponse({ error: 'solution_lookup_failed' }, { status: 500 });
      }
      if (!relaxed.rows.length) {
        return jsonResponse({ error: 'no_approved_solution' }, { status: 422 });
      }
      compatibleSolutions = rankByLeastShortfall(relaxed.rows, {
        minRatedPowerW,
        targetPowerW,
        targetEnergyWh,
        usefulEnergyWhPerBattery,
      });
      usedRelaxedFallback = true;
    }

    const microgridSelected = desiredFeatures.includes('microgrid');
    const microgridConfig = microgridSelected ? options.microgrid : null;
    const microgridIsFundamental = microgridConfig?.isFundamentalRequirement ?? false;

    // When microgrid is selected but not a hard requirement, the baseline
    // ("economic") recommendation below is computed without it — the
    // dedicated microgrid block further down decides whether to also offer
    // a microgrid-compatible alternative on top of this baseline.
    const hardFilterFeatures = computeHardFilterFeatures(desiredFeatures, microgridIsFundamental);
    const requiredFlags = requiredInverterFlags(hardFilterFeatures);

    // Hoisted above runPipeline: the desired PV array is now a real
    // requirement gate (filterSolutionsByPvCapacity below), not just a
    // post-hoc sizing detail, so it needs to be known before the pipeline
    // runs, not after a solution is already picked.
    const pv = desiredFeatures.includes('pv') ? (options.pv ?? null) : null;
    const desiredPvKw = pv ? desiredPvPowerKw(pv) : 0;

    type PipelineResult =
      | { ok: true; compatibleSolutions: ApprovedSolution[]; microgridAlternativeSolution: ApprovedSolution | null }
      | { ok: false; response: Response };

    // Runs the flags → ESS rule → microgrid gates against a given candidate
    // pool. Pulled out so it can run twice: once against the strict-derived
    // (or already-relaxed, if the strict query itself came back empty) pool,
    // and — only if that's blocked by one of these gates rather than an
    // outright missing catalog — once more against the full relaxed pool, so
    // a solution that only a downstream gate (not the power/energy filter)
    // would have rejected still gets a fair shot instead of a dead end.
    async function runPipeline(candidates: ApprovedSolution[]): Promise<PipelineResult> {
      let pool = candidates;

      if (requiredFlags.length > 0 || desiredPvKw > 0) {
        const candidateInverterModels = Array.from(new Set(pool.map((solution) => solution.inverter_model)));

        const { data: candidateInverters, error: inverterErr } = await supabase
          .from('inverters')
          .select('model, flags, max_power_per_phase_w, pv_oversizing_percent')
          .in('model', candidateInverterModels);

        if (inverterErr) {
          console.error(inverterErr);
          return { ok: false, response: jsonResponse({ error: 'inverter_lookup_failed' }, { status: 500 }) };
        }

        if (requiredFlags.length > 0) {
          const flagsResult = filterSolutionsByRequiredFlags(
            pool,
            requiredFlags,
            (candidateInverters ?? []) as InverterCapabilities[]
          );
          pool = flagsResult.compatibleSolutions;

          if (flagsResult.blocked) {
            return {
              ok: false,
              response: jsonResponse(
                {
                  error: 'no_solution_matches_desired_features',
                  blockingFeatures: blockingDesiredFeatures(hardFilterFeatures, (candidateInverters ?? []) as InverterCapabilities[]),
                },
                { status: 422 }
              ),
            };
          }
        }

        if (desiredPvKw > 0) {
          const pvResult = filterSolutionsByPvCapacity(
            pool,
            desiredPvKw,
            (candidateInverters ?? []) as PvCapableInverter[]
          );
          pool = pvResult.compatibleSolutions;

          if (pvResult.blocked) {
            return {
              ok: false,
              response: jsonResponse(
                { error: 'no_solution_matches_desired_features', blockingFeatures: ['pv'] },
                { status: 422 }
              ),
            };
          }
        }
      }

      if (options.batteryModel) {
        // The scaled min/max-battery-quantity-per-inverter check lives in the
        // database (see migration 0052_ess_compatible_solution_ids.sql) — it's
        // the one place both this Edge Function and the admin's solution
        // generator (components/admin/helpers.ts) can read the same rule
        // without re-deriving the inverterQty/battery_ports_used scaling twice.
        const { data: compatibleIds, error: essErr } = await supabase.rpc('ess_compatible_solution_ids', {
          p_battery_model: options.batteryModel,
          p_battery_topology: batteryTopology,
          p_grid_topology: gridTopology,
          p_solution_ids: pool.map((solution) => solution.id),
        });

        if (essErr) {
          console.error(essErr);
          return { ok: false, response: jsonResponse({ error: 'ess_rules_lookup_failed' }, { status: 500 }) };
        }

        const compatibleIdSet = new Set(compatibleIds as string[]);
        pool = pool.filter((solution) => compatibleIdSet.has(solution.id));

        if (!pool.length) {
          return { ok: false, response: jsonResponse({ error: 'no_compatible_ess_rule' }, { status: 422 }) };
        }
      }

      // Microgrid compatibility is checked last, against whatever already
      // satisfies every other requirement — it needs the inverter's own
      // max_power_per_phase_w, which the generic flag-filter above may not
      // have fetched (e.g. when microgrid was excluded from
      // hardFilterFeatures, or when it's the only flag-based feature
      // selected).
      let microgridAlternativeSolution: ApprovedSolution | null = null;

      if (microgridConfig) {
        const candidateModels = Array.from(new Set(pool.map((solution) => solution.inverter_model)));

        const { data: microgridInverters, error: microgridInverterErr } = await supabase
          .from('inverters')
          .select('model, flags, max_power_per_phase_w')
          .in('model', candidateModels);

        if (microgridInverterErr) {
          console.error(microgridInverterErr);
          return { ok: false, response: jsonResponse({ error: 'inverter_lookup_failed' }, { status: 500 }) };
        }

        const microgridResult = resolveMicrogridSelection(
          pool,
          microgridConfig,
          microgridIsFundamental,
          (microgridInverters ?? []) as InverterCapabilities[]
        );

        if (microgridResult.blocked) {
          return {
            ok: false,
            response: jsonResponse(
              { error: 'no_solution_matches_desired_features', blockingFeatures: ['microgrid'] },
              { status: 422 }
            ),
          };
        }

        pool = microgridResult.compatibleSolutions;
        microgridAlternativeSolution = microgridResult.microgridAlternativeSolution;
      }

      return { ok: true, compatibleSolutions: pool, microgridAlternativeSolution };
    }

    let pipelineResult = await runPipeline(compatibleSolutions);

    if (!pipelineResult.ok) {
      // Already the widest possible pool (strict was empty, so this is the
      // relaxed one) — the block is real, nothing broader to try.
      if (usedRelaxedFallback) {
        return pipelineResult.response;
      }

      const relaxed = await getRelaxedRows();
      if ('error' in relaxed) {
        console.error(relaxed.error);
        return jsonResponse({ error: 'solution_lookup_failed' }, { status: 500 });
      }
      if (!relaxed.rows.length) {
        return pipelineResult.response;
      }

      const relaxedRanked = rankByLeastShortfall(relaxed.rows, {
        minRatedPowerW,
        targetPowerW,
        targetEnergyWh,
        usefulEnergyWhPerBattery,
      });
      const retryResult = await runPipeline(relaxedRanked);
      if (!retryResult.ok) {
        return retryResult.response;
      }
      pipelineResult = retryResult;
    }

    compatibleSolutions = pipelineResult.compatibleSolutions;
    const microgridAlternativeSolution = pipelineResult.microgridAlternativeSolution;

    const solution = compatibleSolutions[0] as ApprovedSolution;

    // PV sizing: only relevant when the customer opts into PV via the 'pv'
    // desired feature. pv_oversizing_percent lives on the inverter catalog
    // row (not denormalized onto approved_solutions, unlike rated_power_w),
    // so it needs its own lookup — for both the primary and, if present, the
    // microgrid-alternative solution's inverter.
    const pvInverterModels = Array.from(
      new Set([solution.inverter_model, microgridAlternativeSolution?.inverter_model].filter((m): m is string => Boolean(m)))
    );
    const pvOversizingByModel = new Map<string, number>();
    if (desiredFeatures.includes('pv') && pvInverterModels.length > 0) {
      const { data: inverterRows, error: inverterErr } = await supabase
        .from('inverters')
        .select('model, pv_oversizing_percent')
        .in('model', pvInverterModels);
      if (inverterErr) {
        console.error(inverterErr);
        return jsonResponse({ error: 'inverter_lookup_failed' }, { status: 500 });
      }
      for (const row of (inverterRows ?? []) as { model: string; pv_oversizing_percent: number | null }[]) {
        pvOversizingByModel.set(row.model, row.pv_oversizing_percent ?? 100);
      }
    }

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
        scale_with_metric,
        metric_divisor,
        comment,
        desired_features,
        excludes_accessory_models,
        bundled,
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
      pv,
      pvOversizingPercent: pvOversizingByModel.get(solution.inverter_model) ?? 100,
      accessoryRules,
      standardGridTopology,
      desiredFeatures,
    });

    if (microgridAlternativeSolution) {
      const microgridAlternative = buildSolutionPayload(microgridAlternativeSolution, {
        usefulEnergyWhPerBattery,
        pv,
        pvOversizingPercent: pvOversizingByModel.get(microgridAlternativeSolution.inverter_model) ?? 100,
        accessoryRules,
        standardGridTopology,
        desiredFeatures,
      });
      return jsonResponse({ ...payload, microgridAlternative });
    }

    return jsonResponse(payload);
  } catch (err) {
    console.error(err);
    return jsonResponse({ error: 'internal' }, { status: 500 });
  }
}

// Guarded so importing this module (e.g. from index.test.ts) doesn't also
// start a real HTTP listener — only the actual deployed entry point runs it.
if (import.meta.main) {
  Deno.serve((req) =>
    handleCalculateResidential(
      req,
      createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    )
  );
}
