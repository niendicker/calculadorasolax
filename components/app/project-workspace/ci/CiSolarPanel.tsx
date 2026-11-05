'use client';

// Painel de Configuração de Geração Fotovoltaica (FV) para C&I.
// Permite dimensionar o sistema solar acoplado (ou existente), sua produção média
// e a prioridade de recarga do BESS com o excedente solar diurno.

import { ChevronLeft, ChevronRight, Sun, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import dynamic from 'next/dynamic';
import { CiEnergyImport } from './CiEnergyImport';
import type {
  CiSolarConfig,
  CommercialIndustrialOptions,
} from '@/supabase/functions/_shared/commercial-industrial/types';
import { DEFAULT_CI_SOLAR_CONFIG } from '@/supabase/functions/_shared/commercial-industrial/types';

const LoadCurveChart = dynamic(() => import('./LoadCurveChart').then((module) => module.LoadCurveChart), { ssr: false });

function toNumber(value: string, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function CiSolarPanel({
  ciOptions,
  onChange,
  onNavigatePrev,
  onNavigateNext,
}: {
  ciOptions: CommercialIndustrialOptions;
  onChange: (partial: Partial<CommercialIndustrialOptions>) => void;
  onNavigatePrev?: () => void;
  onNavigateNext?: () => void;
}) {
  const solar = ciOptions.solar ?? DEFAULT_CI_SOLAR_CONFIG;

  function updateSolar(partial: Partial<CiSolarConfig>) {
    onChange({ solar: { ...solar, ...partial } });
  }

  const imported = solar.generationCurve;
  const estimatedDailyKwh = solar.enabled
    ? solar.installedPowerKwp * (solar.dailyYieldKwhPerKwp || 4.5)
    : 0;
  const estimatedMonthlyKwh = estimatedDailyKwh * 30;

  return (
    <div className="space-y-6">
      {/* Enable / Disable Solar Card */}
      <div className="flex flex-col gap-3 rounded-xl border bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Sun className="h-5 w-5 text-amber-500" aria-hidden="true" />
            <h2 className="text-base font-semibold">Geração Fotovoltaica (FV)</h2>
          </div>
          <p className="text-xs text-muted-foreground">
            Integra a curva de geração solar diurna para autoconsumo e recarga direta do BESS com excedente renovável.
          </p>
        </div>
        <Button
          type="button"
          variant={solar.enabled ? 'default' : 'outline'}
          size="sm"
          onClick={() => {
            if (!solar.enabled) {
              updateSolar({
                enabled: true,
                installedPowerKwp: solar.installedPowerKwp > 0 ? solar.installedPowerKwp : 50,
                inverterPowerKw: solar.inverterPowerKw > 0 ? solar.inverterPowerKw : (solar.installedPowerKwp > 0 ? solar.installedPowerKwp : 50),
              });
            } else {
              updateSolar({ enabled: false });
            }
          }}
          className="shrink-0 font-medium"
        >
          {solar.enabled ? 'Sistema FV Habilitado' : 'Habilitar Geração FV'}
        </Button>
      </div>

      <CiEnergyImport defaultSeries="generation" ciOptions={ciOptions} onChange={onChange} />

      {!solar.enabled ? (
        <div className="rounded-xl border border-dashed p-8 text-center text-xs text-muted-foreground space-y-2">
          <p className="font-medium text-foreground">A integração solar fotovoltaica está desativada para este projeto.</p>
          <p>Habilite a geração FV para calcular o autoconsumo e o armazenamento de sobras solares no BESS.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {imported ? (
            <div className="space-y-4 rounded-xl border bg-muted/10 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div><h3 className="text-sm font-semibold">{imported.source === 'manual' ? 'Geração FV personalizada' : 'Geração FV importada'}</h3><p className="mt-1 text-xs text-muted-foreground">{imported.periodStart} a {imported.periodEnd} · {imported.points.length} amostras · {imported.resolutionMinutes} min</p></div>
                <Button type="button" variant="outline" size="sm" onClick={() => updateSolar({ generationCurve: undefined, generationPoints: undefined })}>Usar geração estimada</Button>
              </div>
              <p className="text-xs text-muted-foreground">{imported.source === 'manual' ? 'O cálculo usa o perfil FV ajustado no editor diário, com padrões independentes para dias úteis e fins de semana.' : 'O cálculo usa a geração AC de cada horário do arquivo, sem estimar ou reescalar a produção por kWp. Importe consumo e geração com o mesmo intervalo e período.'}</p>
              <LoadCurveChart kind="generation" points={imported.points} resolutionMinutes={imported.resolutionMinutes} />
            </div>
          ) : <>
          {/* Sizing Parameters */}
          <div className="space-y-4">
            <p className="text-sm font-semibold">Parâmetros do Gerador Fotovoltaico</p>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <label htmlFor="solar-installed-kwp" className="text-xs font-medium text-foreground">
                  Potência dos Módulos (kWp)
                </label>
                <Input
                  id="solar-installed-kwp"
                  type="number"
                  min="0"
                  step="0.5"
                  value={solar.installedPowerKwp || ''}
                  onChange={(e) => updateSolar({ installedPowerKwp: Math.max(0, toNumber(e.target.value)) })}
                  placeholder="Ex: 150"
                />
                <p className="text-[11px] text-muted-foreground">Capacidade DC instalada no local.</p>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="solar-inverter-kw" className="text-xs font-medium text-foreground">
                  Potência dos Inversores (kW)
                </label>
                <Input
                  id="solar-inverter-kw"
                  type="number"
                  min="0"
                  step="0.5"
                  value={solar.inverterPowerKw || ''}
                  onChange={(e) => updateSolar({ inverterPowerKw: Math.max(0, toNumber(e.target.value)) })}
                  placeholder="Ex: 125"
                />
                <p className="text-[11px] text-muted-foreground">Potência máxima de saída AC para a rede local.</p>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="solar-daily-yield" className="text-xs font-medium text-foreground">
                  Geração Média Diária (kWh/kWp)
                </label>
                <Input
                  id="solar-daily-yield"
                  type="number"
                  min="1"
                  max="10"
                  step="0.1"
                  value={solar.dailyYieldKwhPerKwp || ''}
                  onChange={(e) => updateSolar({ dailyYieldKwhPerKwp: Math.max(0.5, toNumber(e.target.value, 4.5)) })}
                  placeholder="Ex: 4.5"
                />
                <p className="text-[11px] text-muted-foreground">HSP (Horas de Sol Pleno) média da região (4.0 a 5.5).</p>
              </div>
            </div>
          </div>

          {/* Estimates Card */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 rounded-xl border bg-muted/10 p-4">
            <div>
              <p className="text-xs text-muted-foreground">Geração Estimada Diária</p>
              <p className="mt-1 text-base font-semibold text-foreground">
                {estimatedDailyKwh.toFixed(1)} kWh/dia
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Produção Estimada Mensal</p>
              <p className="mt-1 text-base font-semibold text-foreground">
                {(estimatedMonthlyKwh / 1000).toFixed(1)} MWh/mês
              </p>
            </div>
            <div className="col-span-2 sm:col-span-1">
              <p className="text-xs text-muted-foreground">Fator de Sobredimensionamento (FDI)</p>
              <p className="mt-1 text-base font-semibold text-foreground">
                {solar.inverterPowerKw > 0
                  ? `${((solar.installedPowerKwp / solar.inverterPowerKw) * 100).toFixed(0)}%`
                  : '—'}
              </p>
            </div>
          </div>

          </>}

          {/* Integration Policy */}
          <div className="space-y-3 border-t pt-4">
            <p className="text-sm font-semibold">Política de Integração com o BESS</p>
            <div className="flex items-start gap-3 rounded-xl border bg-muted/15 p-3.5">
              <Zap className="h-5 w-5 text-primary shrink-0 mt-0.5" aria-hidden="true" />
              <div className="space-y-1">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-foreground">
                  <input
                    type="checkbox"
                    checked={solar.prioritizeBessCharging}
                    onChange={(e) => updateSolar({ prioritizeBessCharging: e.target.checked })}
                    className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                  />
                  <span>Priorizar armazenamento do excedente solar nas baterias</span>
                </label>
                <p className="text-xs text-muted-foreground">
                  Quando a geração FV ultrapassar o consumo da empresa, o BESS absorve a sobra de energia solar
                  em vez de ceifar a produção ou injetar na rede sob regras desfavoráveis.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Navigation Footer */}
      {(onNavigatePrev || onNavigateNext) && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          {onNavigatePrev ? (
            <Button type="button" variant="outline" onClick={onNavigatePrev} className="gap-1.5 rounded-lg text-xs">
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              Voltar para BESS
            </Button>
          ) : (
            <div />
          )}

          {onNavigateNext && (
            <Button type="button" onClick={onNavigateNext} className="gap-1.5 rounded-lg text-xs font-semibold">
              Avançar para Curva de carga
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
