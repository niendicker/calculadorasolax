import { useEffect, useState } from 'react';
import type { createClient } from '@/lib/supabase/client';
import { enqueuePendingSimulation } from '@/lib/metrics-queue';
import { getNetworkErrorMessage } from '@/lib/calculation-error-messages';
import type { ProjectInfo, ResidentialOptions, Solution } from '@/lib/types';
import {
  isGeneratorAtsUnacknowledged,
  isGeneratorPowerInsufficient,
  isMicrogridPowerNoticeUnacknowledged,
  normalizeAccessoryLine,
  resolveCalculationErrorMessage,
} from '../helpers';
import type { AccessoryCatalogOption, BatteryCatalogOption, InverterCatalogOption, ProductMedia } from '../types';

export function useCalculation({
  supabase,
  residentialOptions,
  projectInfo,
  peakW,
  dailyKwh,
  solution,
  setSolution,
  secondarySolution,
  setSecondarySolution,
  inverterCatalog,
  batteryCatalog,
  accessoryCatalog,
}: {
  supabase: ReturnType<typeof createClient>;
  residentialOptions: ResidentialOptions;
  projectInfo: ProjectInfo;
  peakW: number;
  dailyKwh: number;
  solution: Solution | null;
  setSolution: (solution: Solution | null) => void;
  secondarySolution: Solution | null;
  setSecondarySolution: (solution: Solution | null) => void;
  inverterCatalog: InverterCatalogOption[];
  batteryCatalog: BatteryCatalogOption[];
  accessoryCatalog: AccessoryCatalogOption[];
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [secondaryError, setSecondaryError] = useState<string | null>(null);
  const [productMedia, setProductMedia] = useState<Record<string, ProductMedia>>({});

  useEffect(() => {
    async function loadProductMedia() {
      if (!solution && !secondarySolution) {
        setProductMedia({});
        return;
      }

      const solutions = [solution, secondarySolution].filter((item): item is Solution => item !== null);
      const accessoryModels = solutions.flatMap((item) =>
        item.accessories.map((accessory) => normalizeAccessoryLine(accessory).model)
      );
      const media: Record<string, ProductMedia> = {};
      const missing: { table: 'inverters' | 'batteries' | 'accessories'; model: string }[] = [];

      function resolveFromCatalog(
        model: string | undefined,
        table: 'inverters' | 'batteries' | 'accessories',
        catalog: {
          model: string;
          nickname?: string | null;
          imageUrl: string | null;
          documents: ProductMedia['documents'];
        }[]
      ) {
        if (!model || media[model]) return;
        const match = catalog.find((item) => item.model === model);
        if (match) {
          media[model] = { model, nickname: match.nickname ?? null, imageUrl: match.imageUrl, documents: match.documents };
        } else {
          missing.push({ table, model });
        }
      }

      for (const item of solutions) {
        resolveFromCatalog(item.inverterModel, 'inverters', inverterCatalog);
        resolveFromCatalog(item.batteryModel, 'batteries', batteryCatalog);
        // The expansion/Slave model (e.g. "T58 Slave") never appears directly on
        // the Solution — it's only known via the Master battery's catalog row —
        // so it needs its own resolve call to get its card the same media.
        const expansionModel = batteryCatalog.find((battery) => battery.model === item.batteryModel)?.expansionModel;
        if (expansionModel) resolveFromCatalog(expansionModel, 'batteries', batteryCatalog);
      }
      for (const model of accessoryModels) resolveFromCatalog(model, 'accessories', accessoryCatalog);

      if (missing.length > 0) {
        const missingByTable = {
          inverters: missing.filter((item) => item.table === 'inverters').map((item) => item.model),
          batteries: missing.filter((item) => item.table === 'batteries').map((item) => item.model),
          accessories: missing.filter((item) => item.table === 'accessories').map((item) => item.model),
        };

        const [inverterResult, batteryResult, accessoryResult] = await Promise.all([
          missingByTable.inverters.length > 0
            ? supabase.from('inverters').select('model, nickname, image_url, documents').in('model', missingByTable.inverters)
            : Promise.resolve({ data: [] }),
          missingByTable.batteries.length > 0
            ? supabase.from('batteries').select('model, nickname, image_url, documents').in('model', missingByTable.batteries)
            : Promise.resolve({ data: [] }),
          missingByTable.accessories.length > 0
            ? supabase.from('accessories').select('model, nickname, image_url, documents').in('model', missingByTable.accessories)
            : Promise.resolve({ data: [] }),
        ]);

        const rows = [
          ...(inverterResult.data ?? []),
          ...(batteryResult.data ?? []),
          ...(accessoryResult.data ?? []),
        ] as { model: string; nickname: string | null; image_url: string | null; documents: ProductMedia['documents'] | null }[];

        for (const row of rows) {
          media[row.model] = {
            model: row.model,
            nickname: row.nickname ?? null,
            imageUrl: row.image_url,
            documents: row.documents ?? [],
          };
        }
      }

      setProductMedia(media);
    }

    loadProductMedia();
  }, [solution, secondarySolution, supabase, inverterCatalog, batteryCatalog, accessoryCatalog]);

  const canCalculate = Boolean(
    residentialOptions.topology &&
    residentialOptions.batteryModel &&
    residentialOptions.gridType &&
    residentialOptions.loads.length > 0 &&
    !isGeneratorPowerInsufficient(residentialOptions.desiredFeatures, residentialOptions.generator, peakW) &&
    !isGeneratorAtsUnacknowledged(residentialOptions.desiredFeatures, residentialOptions.generator) &&
    !isMicrogridPowerNoticeUnacknowledged(residentialOptions.desiredFeatures, residentialOptions.microgrid)
  );

  async function runCalculation(
    batteryModel: string,
    setResultSolution: (solution: Solution | null) => void,
    setResultError: (error: string | null) => void
  ) {
    try {
      const { data, error: functionError } = await supabase.functions.invoke('calculate-residential', {
        body: { ...residentialOptions, batteryModel },
      });

      if (functionError || !data) {
        setResultSolution(null);
        setResultError(await resolveCalculationErrorMessage(functionError));
        return;
      }

      const nextSolution = data as Solution;
      setResultSolution(nextSolution);
      setResultError(null);

      const { data: userData } = await supabase.auth.getUser();
      const simulationPayload = {
        user_id: userData.user?.id ?? null,
        project_name: projectInfo.name || null,
        topology: residentialOptions.topology,
        grid_type: residentialOptions.gridType,
        peak_w: peakW,
        daily_kwh: dailyKwh,
        loads: residentialOptions.loads,
        inverter_model: nextSolution.inverterModel,
        battery_model: nextSolution.batteryModel,
        // app_simulations is an analytics table keyed on plain accessory
        // names (see admin DashboardPanels.tsx countAccessories) — keep it
        // decoupled from the richer Solution.accessories shape used for display.
        accessories: nextSolution.accessories.map((accessory) => accessory.model),
        solution_code: nextSolution.solutionCode ?? null,
      };
      const { error: simulationError } = await supabase.from('app_simulations').insert(simulationPayload);

      if (simulationError) {
        console.error(simulationError);
        enqueuePendingSimulation(simulationPayload);
      }
    } catch (err) {
      console.error(err);
      setResultSolution(null);
      setResultError(getNetworkErrorMessage());
    }
  }

  async function calculate() {
    if (!canCalculate) return;

    setLoading(true);
    setError(null);
    setSecondaryError(null);
    if (!residentialOptions.secondaryBatteryModel) {
      setSecondarySolution(null);
    }

    const calls = [runCalculation(residentialOptions.batteryModel as string, setSolution, setError)];
    if (residentialOptions.secondaryBatteryModel) {
      calls.push(runCalculation(residentialOptions.secondaryBatteryModel, setSecondarySolution, setSecondaryError));
    }

    await Promise.allSettled(calls);
    setLoading(false);
  }

  return { loading, error, secondaryError, canCalculate, calculate, productMedia };
}
