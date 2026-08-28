import { useEffect, useMemo, useRef, useState } from 'react';
import type { createClient } from '@/lib/supabase/client';
import { calculateResidentialSolution } from '@/lib/calculate-residential';
import { listProductMedia } from '@/lib/data/product-media-repository';
import type { ProjectInfo, ResidentialOptions, Solution } from '@/lib/types';
import { desiredFeatureHasPendingIssue } from '../tabs/sizing/feature-status';
import {
  normalizeAccessoryLine,
} from '../helpers';
import { availableInverterModelsFor, type AccessoryCatalogOption, type ApprovedInverterCombo, type BatteryCatalogOption, type InverterCatalogOption, type ProductMedia } from '../types';

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
  approvedInverterCombos,
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
  approvedInverterCombos: ApprovedInverterCombo[];
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
  const serializedOptions = useMemo(() => JSON.stringify(residentialOptions), [residentialOptions]);
  const serializedOptionsRef = useRef(serializedOptions);
  useEffect(() => {
    serializedOptionsRef.current = serializedOptions;
  }, [serializedOptions]);
  const hasUncalculatedChanges = lastCalculatedOptions !== serializedOptions || Boolean(error) || Boolean(secondaryError);

  // A solution loaded or refreshed from a saved project is already based on
  // the current options, so it establishes a new clean calculation baseline.
  useEffect(() => {
    if (solution) setLastCalculatedOptions(serializedOptionsRef.current);
  }, [solution]);

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

        const [inverterRows, batteryRows, accessoryRows] = await Promise.all([
          listProductMedia(supabase, 'inverters', missingByTable.inverters),
          listProductMedia(supabase, 'batteries', missingByTable.batteries),
          listProductMedia(supabase, 'accessories', missingByTable.accessories),
        ]);

        const rows = [
          ...inverterRows,
          ...batteryRows,
          ...accessoryRows,
        ] as unknown as {
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

  const { gridType, topology } = residentialOptions;
  const availableInverterModels = useMemo(
    () => availableInverterModelsFor({ gridType, topology }, approvedInverterCombos),
    [approvedInverterCombos, gridType, topology]
  );

  const hasPendingEnabledFeature = residentialOptions.desiredFeatures.some((id) =>
    desiredFeatureHasPendingIssue(id, residentialOptions.desiredFeatures, {
      microgrid: residentialOptions.microgrid,
      generator: residentialOptions.generator,
      pv: residentialOptions.pv,
      whiteTariff: residentialOptions.whiteTariff,
      atsBackupAcknowledged: residentialOptions.atsBackupAcknowledged,
      gridType: residentialOptions.gridType,
      peakW,
      loadsCount: residentialOptions.loads.length,
      operationHours: residentialOptions.operationHours,
      inverterCatalog,
      availableInverterModels,
      selectedInverterModel: residentialOptions.inverterModel,
    })
  );

  const canCalculate = Boolean(
    residentialOptions.topology &&
    residentialOptions.batteryModel &&
    residentialOptions.gridType &&
    residentialOptions.loads.length > 0 &&
    !hasPendingEnabledFeature
  );

  async function runCalculation(
    batteryModel: string,
    setResultSolution: (solution: Solution | null) => void,
    setResultError: (error: string | null) => void
  ): Promise<string | null> {
    const result = await calculateResidentialSolution({
      residentialOptions,
      batteryModel,
      projectName: projectInfo.name || null,
      peakW,
      dailyKwh,
    });

    if ('error' in result) {
      setResultSolution(null);
      setResultError(result.error);
      return result.error;
    }

    setResultSolution(result.solution);
    setResultError(null);
    return null;
  }

  // Returns the primary battery's error message (or null on success) so
  // callers that trigger a recalculation from outside the sizing form (e.g.
  // the Workspace's "Recalcular solução" button) can report the actual
  // outcome instead of guessing from stale state.
  async function calculate(): Promise<string | null> {
    if (!canCalculate) return null;

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

    const [primaryResult] = await Promise.allSettled(calls);
    setLoading(false);
    return primaryResult.status === 'fulfilled' ? primaryResult.value : null;
  }

  return { loading, error, secondaryError, canCalculate, hasUncalculatedChanges, calculate, productMedia };
}
