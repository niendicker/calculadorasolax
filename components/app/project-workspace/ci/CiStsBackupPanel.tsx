'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { InfoTooltip } from '@/components/ui/tooltip';
import { loadCiStsCatalog } from '@/lib/data/ci-sts-repository';
import { isApprovedStsRule } from '@/supabase/functions/_shared/commercial-industrial/sts';
import type { CiStsCatalog } from '@/supabase/functions/_shared/commercial-industrial/sts-types';
import type { CiBackupConfig, CommercialIndustrialOptions } from '@/supabase/functions/_shared/commercial-industrial/types';

export function CiStsBackupPanel({
  options,
  backup,
}: {
  options: CommercialIndustrialOptions;
  backup: CiBackupConfig;
  onChange?: (partial: Partial<CiBackupConfig>) => void;
}) {
  const requested = backup.enabled;
  const is220V = options.lineVoltageV === 220;
  const [loaded, setLoaded] = useState<{
    key: string;
    catalog: CiStsCatalog;
    pcsId: string | null;
    bessId: string | null;
  } | null>(null);
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null);
  const [attempt, setAttempt] = useState(0);

  const modular = options.bessSystem?.kind === 'modular';
  const automatic = options.bessSystem?.kind === 'automatic';
  const compatibilityId = options.bessSystem?.kind === 'modular' ? options.bessSystem.compatibilityId : null;
  const solutionKey = options.bessSystem?.kind === 'solution' ? options.bessSystem.solutionKey : null;
  const model = options.bessSystem?.kind === 'model' ? options.bessSystem : null;
  const modelPcsId = model?.sourceKind === 'assembly' ? model.pcsId : null;
  const bessId = model?.sourceKind === 'cabinet' ? model.productId : options.bessProductId;
  const targetKey = JSON.stringify([modular, automatic, compatibilityId, bessId, modelPcsId, options.lineVoltageV, solutionKey, attempt]);

  useEffect(() => {
    if (!requested || is220V) return;
    let alive = true;
    const pcsLookup = solutionKey
      ? Promise.all([import('@/lib/data/ci-generated-solutions-repository'), import('@/lib/supabase/client')])
          .then(([repo, client]) => repo.queryCiGeneratedSolutions(client.createClient(), { solutionKey, minPowerKw: 0, minEnergyKwh: 0, applications: [] }))
          .then((data) => ({ pcsId: data.solutions[0]?.transferTarget.pcsId ?? null, bessId: data.solutions[0]?.transferTarget.bessProductId ?? null }))
      : modular
      ? import('@/lib/data/ci-modular-catalog-repository')
          .then((m) => m.loadCiModularCatalog())
          .then((data) => data.rules.find((r) => r.id === compatibilityId)?.pcs_id ?? null)
          .then((pcsId) => ({ pcsId, bessId: null }))
      : Promise.resolve({ pcsId: modelPcsId, bessId: bessId ?? null });

    Promise.all([loadCiStsCatalog(), pcsLookup])
      .then(([catalog, target]) => {
        if (alive) {
          setLoaded({ key: targetKey, catalog, ...target });
          setFailure(null);
        }
      })
      .catch((e) => {
        if (alive) {
          setFailure({ key: targetKey, message: e instanceof Error ? e.message : 'Não foi possível carregar STS e composição.' });
        }
      });

    return () => {
      alive = false;
    };
  }, [requested, is220V, modular, compatibilityId, targetKey, solutionKey, bessId, modelPcsId]);

  if (!backup.enabled) return null;

  const catalog = loaded?.key === targetKey ? loaded.catalog : null;
  const equipmentPcs = loaded?.key === targetKey ? loaded.pcsId : null;
  const error = failure?.key === targetKey ? failure.message : '';
  const effectiveVoltage = (options.lineVoltageV as number | undefined) === 400 ? 400 : 380;
  const rules =
    catalog?.rules.filter(
      (r) =>
        isApprovedStsRule(r) &&
        r.line_voltage_v === effectiveVoltage &&
        r.frequency_hz === 60 &&
        (automatic || (equipmentPcs ? r.pcs_id === equipmentPcs : Boolean(loaded?.bessId) && r.bess_product_id === loaded?.bessId))
    ) ?? [];
  const specs = catalog?.specs.filter((s) => s.active && s.accessoryActive && rules.some((r) => r.accessory_id === s.accessory_id)) ?? [];

  return (
    <section aria-label="Transferência / STS" className="space-y-3 rounded-xl border bg-muted/15 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold">Transferência / STS</h3>
        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
          Seleção automática
        </span>
        <InfoTooltip label="Sobre a seleção automática de STS">
          Uma STS por barramento trifásico com neutro e PE. A menor STS aprovada que atende à corrente nominal contínua, tensão, frequência e quantidade de PCS é selecionada, sem presumir sobrecarga. O preço do Portfólio entra no CAPEX. Transferência de 0 ms não é garantida pelo cálculo.
        </InfoTooltip>
      </div>

      {is220V ? (
        <div role="status" className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400 space-y-1">
          <p className="font-semibold">Rede em 220 V trifásico</p>
          <p>
            Os modelos SolaX Nexus Zero STS operam em 380 V / 400 V. Para contingência em 220 V, prever autotransformador de acoplamento ou chave de transferência externa. O dimensionamento BESS avalia potência e energia de backup normalmente.
          </p>
        </div>
      ) : error ? (
        <div role="alert" className="space-y-2 text-sm text-destructive">
          <p>{error}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => setAttempt((a) => a + 1)}>
            Tentar novamente
          </Button>
        </div>
      ) : !catalog ? (
        <p role="status" className="text-xs text-muted-foreground">
          Carregando catálogo STS…
        </p>
      ) : (
        <div className="space-y-1 text-xs text-muted-foreground">
          {specs.length === 0 ? (
            <p role="status">
              Nenhuma STS com compatibilidade aprovada para este equipamento. Cadastre em Administração → BESS C&I → STS / Transferência.
            </p>
          ) : (
            <p>
              Modelos com compatibilidade aprovada: {specs.map((s) => s.model).join(', ')}. A seleção final do modelo, corrente exigida e custo são calculados automaticamente e incluídos no CAPEX.
            </p>
          )}
          <p className="text-[11px]">
            Parâmetros de dimensionamento: {effectiveVoltage} V · 60 Hz · Barramento da instalação.
          </p>
        </div>
      )}
    </section>
  );
}
