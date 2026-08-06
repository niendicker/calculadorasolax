'use client';

import { AlertTriangle, Boxes, Settings } from 'lucide-react';
import type { InverterFlag } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Tooltip } from '@/components/ui/tooltip';
import type { InverterCatalogOption } from '../../types';

/** Shows how many catalog inverters support a given flag (e.g. microgrid,
 * external_generator), and — separately — how many among whatever's already
 * chosen in Configurações (a specific model, or the set compatible with the
 * chosen grid type/battery topology when the model is "Automático") do. */
export function InverterSupportSummary({
  flag,
  featureLabel,
  inverterCatalog,
  availableInverterModels,
  selectedInverterModel,
}: {
  flag: InverterFlag;
  featureLabel: string;
  inverterCatalog: InverterCatalogOption[];
  availableInverterModels: Set<string> | null;
  selectedInverterModel: string | null;
}) {
  const totalSupporting = inverterCatalog.filter((inverter) => inverter.flags.includes(flag)).length;

  const selectedCatalog = selectedInverterModel
    ? inverterCatalog.filter((inverter) => inverter.model === selectedInverterModel)
    : availableInverterModels
      ? inverterCatalog.filter((inverter) => availableInverterModels.has(inverter.model))
      : null;
  const selectedSupporting = selectedCatalog?.filter((inverter) => inverter.flags.includes(flag)).length ?? 0;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <SupportCountChip
        icon={Boxes}
        label={`${totalSupporting}/${inverterCatalog.length}`}
        tone="neutral"
        tooltip={`${totalSupporting} de ${inverterCatalog.length} inversores cadastrados no catálogo suportam ${featureLabel}.`}
      />
      {selectedCatalog === null ? (
        <SupportCountChip
          icon={Settings}
          label="-"
          tone="neutral"
          tooltip={`Selecione o tipo de rede em Configurações para ver quantos inversores compatíveis com a seleção atual suportam ${featureLabel}.`}
        />
      ) : (
        <SupportCountChip
          icon={selectedSupporting === 0 ? AlertTriangle : Settings}
          label={`${selectedSupporting}/${selectedCatalog.length}`}
          tone={selectedSupporting === 0 ? 'warning' : 'neutral'}
          tooltip={
            selectedSupporting === 0
              ? `Nenhum inversor das opções selecionadas em Configurações suporta ${featureLabel}.`
              : `${selectedSupporting} de ${selectedCatalog.length} inversores das opções selecionadas em Configurações suportam ${featureLabel}.`
          }
        />
      )}
    </div>
  );
}

/** Compact icon + count pill with a tooltip explaining what it means —
 * used by InverterSupportSummary so the two counts (catalog-wide vs.
 * narrowed by Configurações) read at a glance instead of as full sentences. */
function SupportCountChip({
  icon: Icon,
  label,
  tone,
  tooltip,
}: {
  icon: typeof Boxes;
  label: string;
  tone: 'neutral' | 'warning';
  tooltip: string;
}) {
  return (
    <Tooltip content={tooltip}>
      <span
        aria-label={tooltip}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium',
          tone === 'warning'
            ? 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300'
            : 'border-transparent bg-muted text-muted-foreground'
        )}
      >
        <Icon className="h-3.5 w-3.5" />
        {label}
      </span>
    </Tooltip>
  );
}
