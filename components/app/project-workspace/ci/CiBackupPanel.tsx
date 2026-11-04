'use client';

import { useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Clock, Plus, Shield, ShieldAlert, Sparkles, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type {
  CiBackupConfig,
  CiBackupInputMode,
  CiCriticalLoad,
  CommercialIndustrialOptions,
} from '@/supabase/functions/_shared/commercial-industrial/types';
import { computeBackupRequirements } from '@/supabase/functions/_shared/commercial-industrial/backup';

const inputModeOptions: { value: CiBackupInputMode; label: string; hint: string }[] = [
  { value: 'simple', label: 'Dimensionamento Direto', hint: 'Informe diretamente a potência crítica e a autonomia desejada.' },
  { value: 'detailed', label: 'Lista de Cargas Críticas', hint: 'Cadastre cargas individuais como servidores, iluminação e refrigeração.' },
];

interface CriticalLoadPreset {
  name: string;
  powerW: number;
  quantity: number;
  usageFactor: number;
}

const CRITICAL_LOAD_PRESETS: CriticalLoadPreset[] = [
  { name: 'Data Center / Servidores TI', powerW: 5000, quantity: 2, usageFactor: 1.0 },
  { name: 'Iluminação de Emergência LED', powerW: 1500, quantity: 1, usageFactor: 0.9 },
  { name: 'Câmaras Frias / Refrigeração', powerW: 12000, quantity: 1, usageFactor: 0.8 },
  { name: 'Portaria / Controle de Acesso', powerW: 800, quantity: 1, usageFactor: 1.0 },
  { name: 'Bomba de Incêndio / Pressurização', powerW: 15000, quantity: 1, usageFactor: 0.5 },
];

function toNumber(value: string, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function CiBackupPanel({
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
  const backup = ciOptions.backup ?? {
    enabled: false,
    inputMode: 'simple',
    targetPowerKw: 0,
    targetPeakPowerKw: 0,
    autonomyHours: 4,
    loads: [],
    safetyMarginPercent: 10,
  };

  // State for new load entry in detailed mode
  const [newLoadName, setNewLoadName] = useState('');
  const [newLoadPowerW, setNewLoadPowerW] = useState('');
  const [newLoadQty, setNewLoadQty] = useState('1');
  const [newLoadFactor, setNewLoadFactor] = useState('100');

  function updateBackup(partial: Partial<CiBackupConfig>) {
    onChange({ backup: { ...backup, ...partial } });
  }

  function handleAddLoad() {
    if (!newLoadName.trim()) return;
    const powerW = Math.max(1, toNumber(newLoadPowerW, 100));
    const quantity = Math.max(1, Math.round(toNumber(newLoadQty, 1)));
    const usageFactor = Math.min(1, Math.max(0.1, toNumber(newLoadFactor, 100) / 100));

    const load: CiCriticalLoad = {
      id: `load-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: newLoadName.trim(),
      powerW,
      quantity,
      usageFactor,
    };

    updateBackup({
      loads: [...backup.loads, load],
    });

    setNewLoadName('');
    setNewLoadPowerW('');
    setNewLoadQty('1');
    setNewLoadFactor('100');
  }

  function handleRemoveLoad(id: string) {
    updateBackup({
      loads: backup.loads.filter((load) => load.id !== id),
    });
  }

  const requirements = backup.enabled ? computeBackupRequirements(backup) : null;

  return (
    <div className="space-y-6">
      {/* Enable / Disable Card */}
      <div className="flex flex-col gap-3 rounded-xl border bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-amber-600" aria-hidden="true" />
            <h2 className="text-base font-semibold">Proteção para Falta de Rede (Backup C&amp;I)</h2>
          </div>
          <p className="text-xs text-muted-foreground">
            Dimensiona a reserva de energia do BESS para manter cargas críticas em funcionamento durante apagões da concessionária.
          </p>
        </div>
        <Button
          type="button"
          variant={backup.enabled ? 'default' : 'outline'}
          size="sm"
          onClick={() => updateBackup({ enabled: !backup.enabled })}
          className="shrink-0"
        >
          {backup.enabled ? 'Backup Habilitado' : 'Habilitar Backup'}
        </Button>
      </div>

      {!backup.enabled ? (
        <div className="flex items-center gap-3 rounded-xl border border-dashed bg-muted/10 p-5 text-sm text-muted-foreground">
          <Shield className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <p>
            A proteção de backup está desativada. O BESS será dimensionado exclusivamente para benefícios tarifários on-grid (Peak Shaving e Load Shifting), sem reservar capacidade para blecautes.
          </p>
        </div>
      ) : (
        <>
          {/* Mode Selector */}
          <div className="space-y-3">
            <div>
              <p className="text-sm font-semibold">Método de dimensionamento das cargas críticas</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Escolha se deseja informar a demanda estimada diretamente ou detalhar item a item.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1 sm:w-fit">
              {inputModeOptions.map((option) => {
                const active = backup.inputMode === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => updateBackup({ inputMode: option.value })}
                    title={option.hint}
                    className={cn(
                      'flex h-8 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium transition',
                      active ? 'bg-background text-foreground shadow-sm ring-1 ring-border' : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {active && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Simple Mode Form */}
          {backup.inputMode === 'simple' && (
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <label htmlFor="target-power-kw" className="text-xs font-medium text-foreground">
                  Potência crítica contínua (kW)
                </label>
                <Input
                  id="target-power-kw"
                  type="number"
                  min="0"
                  step="0.5"
                  value={backup.targetPowerKw || ''}
                  onChange={(e) => updateBackup({ targetPowerKw: Math.max(0, toNumber(e.target.value)) })}
                  placeholder="Ex: 50"
                />
                <p className="text-[11px] text-muted-foreground">Potência média das cargas durante a falta de rede.</p>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="target-peak-power-kw" className="text-xs font-medium text-foreground">
                  Potência de pico / surto (kW) <span className="text-muted-foreground">(opcional)</span>
                </label>
                <Input
                  id="target-peak-power-kw"
                  type="number"
                  min="0"
                  step="0.5"
                  value={backup.targetPeakPowerKw || ''}
                  onChange={(e) => updateBackup({ targetPeakPowerKw: Math.max(0, toNumber(e.target.value)) })}
                  placeholder="Ex: 75"
                />
                <p className="text-[11px] text-muted-foreground">Partida de motores ou picos de curta duração.</p>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="autonomy-hours" className="text-xs font-medium text-foreground">
                  Autonomia desejada (horas)
                </label>
                <Input
                  id="autonomy-hours"
                  type="number"
                  min="0.5"
                  step="0.5"
                  value={backup.autonomyHours || ''}
                  onChange={(e) => updateBackup({ autonomyHours: Math.max(0.5, toNumber(e.target.value, 4)) })}
                  placeholder="Ex: 4"
                />
                <p className="text-[11px] text-muted-foreground">Tempo mínimo de sustentação sem rede.</p>
              </div>
            </div>
          )}

          {/* Detailed Mode Form */}
          {backup.inputMode === 'detailed' && (
            <div className="space-y-4">
              {/* Presets catalog */}
              <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
                <div className="flex items-center gap-1.5 text-xs font-semibold">
                  <Sparkles className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                  <span>Catálogo rápido de cargas comerciais essenciais:</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {CRITICAL_LOAD_PRESETS.map((preset) => (
                    <button
                      key={preset.name}
                      type="button"
                      onClick={() => {
                        const load: CiCriticalLoad = {
                          id: `load-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                          name: preset.name,
                          powerW: preset.powerW,
                          quantity: preset.quantity,
                          usageFactor: preset.usageFactor,
                        };
                        updateBackup({ loads: [...backup.loads, load] });
                      }}
                      className="rounded border bg-background/80 px-2 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-primary/10 hover:border-primary/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                    >
                      + {preset.name} ({(preset.powerW * preset.quantity * preset.usageFactor / 1000).toFixed(1)} kW)
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border bg-muted/10 p-4 space-y-3">
                <p className="text-xs font-semibold">Adicionar carga crítica</p>
                <div className="grid gap-2 sm:grid-cols-4">
                  <div className="sm:col-span-1">
                    <Input
                      placeholder="Nome da carga (ex: Servidores TI)"
                      value={newLoadName}
                      onChange={(e) => setNewLoadName(e.target.value)}
                    />
                  </div>
                  <div>
                    <Input
                      type="number"
                      placeholder="Potência unitária (W)"
                      value={newLoadPowerW}
                      onChange={(e) => setNewLoadPowerW(e.target.value)}
                    />
                  </div>
                  <div>
                    <Input
                      type="number"
                      placeholder="Quantidade"
                      value={newLoadQty}
                      onChange={(e) => setNewLoadQty(e.target.value)}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      placeholder="Fator uso (%)"
                      value={newLoadFactor}
                      onChange={(e) => setNewLoadFactor(e.target.value)}
                      title="Fator de uso simultâneo ou ciclo de carga (%)"
                    />
                    <Button type="button" size="sm" onClick={handleAddLoad} disabled={!newLoadName.trim()} aria-label="Adicionar carga">
                      <Plus className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              </div>

              {backup.loads.length === 0 ? (
                <div className="rounded-xl border border-dashed p-4 text-center text-xs text-muted-foreground">
                  Nenhuma carga crítica cadastrada. Adicione os equipamentos essenciais acima.
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b bg-muted/40 font-medium text-muted-foreground">
                      <tr>
                        <th className="p-2.5">Carga Crítica</th>
                        <th className="p-2.5">Qtd</th>
                        <th className="p-2.5">Potência Unitária</th>
                        <th className="p-2.5">Fator de Uso</th>
                        <th className="p-2.5">Potência Contínua Total</th>
                        <th className="p-2.5 text-right">Ação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {backup.loads.map((load) => {
                        const continuousW = load.powerW * load.quantity * (load.usageFactor ?? 1);
                        return (
                          <tr key={load.id} className="hover:bg-muted/20">
                            <td className="p-2.5 font-medium">{load.name}</td>
                            <td className="p-2.5">{load.quantity}</td>
                            <td className="p-2.5">{load.powerW} W</td>
                            <td className="p-2.5">{Math.round((load.usageFactor ?? 1) * 100)}%</td>
                            <td className="p-2.5 font-semibold">{(continuousW / 1000).toFixed(2)} kW</td>
                            <td className="p-2.5 text-right">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => handleRemoveLoad(load.id)}
                                className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                              >
                                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="max-w-xs space-y-1.5 pt-2">
                <label htmlFor="detailed-autonomy-hours" className="text-xs font-medium text-foreground">
                  Autonomia desejada para as cargas acima (horas)
                </label>
                <Input
                  id="detailed-autonomy-hours"
                  type="number"
                  min="0.5"
                  step="0.5"
                  value={backup.autonomyHours || ''}
                  onChange={(e) => updateBackup({ autonomyHours: Math.max(0.5, toNumber(e.target.value, 4)) })}
                  placeholder="Ex: 4"
                />
              </div>
            </div>
          )}

          {/* Operational Settings (Safety Margin) */}
          <div className="space-y-3 border-t pt-4">
            <p className="text-xs font-semibold">Parâmetros Operacionais</p>
            <div className="max-w-xs space-y-1.5">
              <label htmlFor="safety-margin-percent" className="text-xs font-medium text-foreground">
                Margem de segurança sobre a potência (%)
              </label>
              <Input
                id="safety-margin-percent"
                type="number"
                min="0"
                max="50"
                step="1"
                value={backup.safetyMarginPercent}
                onChange={(e) => updateBackup({ safetyMarginPercent: Math.max(0, toNumber(e.target.value, 10)) })}
              />
              <p className="text-[11px] text-muted-foreground">
                Garante folga operacional para absorver variações momentâneas de carga.
              </p>
            </div>
          </div>

          {/* Requirements Live Summary */}
          {requirements && (
            <div className="rounded-xl border bg-muted/20 p-4 space-y-2">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-primary" aria-hidden="true" />
                <p className="text-xs font-semibold">Requisitos Calculados para Falta de Rede</p>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 pt-1">
                <div>
                  <span className="text-xs text-muted-foreground">Potência Contínua Necessária</span>
                  <p className="text-sm font-bold text-foreground">
                    {requirements.requiredContinuousPowerKw.toFixed(1)} kW
                  </p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">Potência de Pico/Surto</span>
                  <p className="text-sm font-bold text-foreground">
                    {requirements.requiredPeakPowerKw.toFixed(1)} kW
                  </p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">Energia Mínima para {requirements.autonomyHours}h</span>
                  <p className="text-sm font-bold text-primary">
                    {requirements.requiredEnergyKwh.toFixed(1)} kWh
                  </p>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground pt-1">
                O motor utilizará esses requisitos para filtrar os cenários viáveis e preservar a reserva mínima de SOC durante o despacho diário.
              </p>
            </div>
          )}
        </>
      )}

      {(onNavigatePrev || onNavigateNext) && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          {onNavigatePrev ? (
            <Button type="button" variant="outline" onClick={onNavigatePrev} className="gap-1.5 rounded-lg text-xs">
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              Voltar para Estratégia
            </Button>
          ) : (
            <div />
          )}

          {onNavigateNext && (
            <Button
              type="button"
              onClick={onNavigateNext}
              className="gap-1.5 rounded-lg text-xs font-semibold"
            >
              Avançar para Resultados
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
