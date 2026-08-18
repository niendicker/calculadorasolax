import { useEffect, useState } from 'react';
import type { createClient } from '@/lib/supabase/client';
import { calculateResidentialSolution } from '@/lib/calculate-residential';
import type { ProjectInfo, ResidentialOptions, Solution } from '@/lib/types';
import {
  isGeneratorAtsUnacknowledged,
  isGeneratorPhaseVoltageIncompatible,
  isGeneratorPowerInsufficient,
  isMicrogridPhaseVoltageIncompatible,
  isPvConfigIncomplete,
  isWhiteTariffConfigIncomplete,
  normalizeAccessoryLine,
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

  // Tracks the residentialOptions snapshot as of the last calculate() call
  // (set the moment it starts, not when it resolves) — lets the "Calcular"
  // button disable itself once its own last click already covers the
  // current inputs, instead of letting the user fire off redundant repeat
  // calculations of the same configuration. This is state (not a ref) on
  // purpose: a ref mutation is invisible to React's bail-out check, so if the
  // rest of a calculate() call nets out to no visible state change (e.g. a
  // fast success where `loading` goes true then back to false within the
  // same batch), React can skip committing that render — silently stranding
  // anything derived from the ref. An error always overrides this back to
  // "needs calculating", even with zero further edits — otherwise a failed
  // attempt would permanently lock the button with no way to retry.
  const [lastCalculatedOptions, setLastCalculatedOptions] = useState<string | null>(null);
  const serializedOptions = JSON.stringify(residentialOptions);
  const hasUncalculatedChanges = lastCalculatedOptions !== serializedOptions || Boolean(error) || Boolean(secondaryError);

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
          description?: string | null;
          imageUrl: string | null;
          documents: ProductMedia['documents'];
        }[]
      ) {
        if (!model || media[model]) return;
        const match = catalog.find((item) => item.model === model);
        if (match) {
          media[model] = {
            model,
            nickname: match.nickname ?? null,
            description: match.description ?? null,
            imageUrl: match.imageUrl,
            documents: match.documents,
          };
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
            ? supabase.from('accessories').select('model, nickname, description, image_url, documents').in('model', missingByTable.accessories)
            : Promise.resolve({ data: [] }),
        ]);

        const rows = [
          ...(inverterResult.data ?? []),
          ...(batteryResult.data ?? []),
          ...(accessoryResult.data ?? []),
        ] as {
          model: string;
          nickname: string | null;
          description?: string | null;
          image_url: string | null;
          documents: ProductMedia['documents'] | null;
        }[];

        for (const row of rows) {
          media[row.model] = {
            model: row.model,
            nickname: row.nickname ?? null,
            description: row.description ?? null,
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
    !isGeneratorPhaseVoltageIncompatible(residentialOptions.desiredFeatures, residentialOptions.generator, residentialOptions.gridType) &&
    !isMicrogridPhaseVoltageIncompatible(residentialOptions.desiredFeatures, residentialOptions.microgrid, residentialOptions.gridType) &&
    !isPvConfigIncomplete(residentialOptions.desiredFeatures, residentialOptions.pv)
    && !isWhiteTariffConfigIncomplete(residentialOptions.desiredFeatures, residentialOptions.whiteTariff)
  );

  async function runCalculation(
    batteryModel: string,
    setResultSolution: (solution: Solution | null) => void,
    setResultError: (error: string | null) => void
  ) {
    const result = await calculateResidentialSolution({
      supabase,
      residentialOptions,
      batteryModel,
      projectName: projectInfo.name || null,
      peakW,
      dailyKwh,
    });

    if ('error' in result) {
      setResultSolution(null);
      setResultError(result.error);
      return;
    }

    setResultSolution(result.solution);
    setResultError(null);
  }

  async function calculate() {
    if (!canCalculate) return;

    setLastCalculatedOptions(serializedOptions);
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

  return { loading, error, secondaryError, canCalculate, hasUncalculatedChanges, calculate, productMedia };
}
