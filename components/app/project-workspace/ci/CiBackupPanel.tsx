'use client';

import { CiAcPowerFactorInput, useCiAcPower } from './ci-ac-power';
import { useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Clock, Fuel, Gauge, Plus, Shield, ShieldAlert, Sparkles, Trash2, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { InfoTooltip } from '@/components/ui/tooltip';
import { Input } from '@/components/ui/input';
import { NumberField, NumberFieldControl } from '@/components/ui/number-field';
import { cn } from '@/lib/utils';
import type {
  CiBackupConfig,
  CiBackupInputMode,
  CiCriticalLoad,
  CiGeneratorConfig,
  CiGeneratorDispatchMode,
  CiGeneratorFuelType,
  CommercialIndustrialOptions,
} from '@/supabase/functions/_shared/commercial-industrial/types';
import { DEFAULT_CI_GENERATOR_CONFIG } from '@/supabase/functions/_shared/commercial-industrial/types';
import { withAutomaticBackupSts } from '@/supabase/functions/_shared/commercial-industrial/automatic-sts';
import { CiStsBackupPanel } from './CiStsBackupPanel';
import { computeBackupRequirements } from '@/supabase/functions/_shared/commercial-industrial/backup';

const inputModeOptions: { value: CiBackupInputMode; label: string; hint: string }[] = [
  { value: 'simple', label: 'Dimensionamento Direto', hint: 'Informe diretamente a potência crítica e a autonomia desejada.' },
  { value: 'detailed', label: 'Lista de Cargas Críticas', hint: 'Cadastre cargas individuais como servidores, iluminação e refrigeração.' },
];

const generatorModeOptions: { value: CiGeneratorDispatchMode; label: string; hint: string }[] = [
  { value: 'blackout_only', label: 'Emergência (Falta de Rede)', hint: 'Acionado apenas durante queda da concessionária quando a bateria descarregar.' },
  { value: 'peak_support', label: 'Suporte de Ponta / Arbitragem', hint: 'Opera na ponta quando a tarifa da rede for mais cara que o custo do combustível.' },
  { value: 'peak_and_blackout', label: 'Ponta + Emergência', hint: 'Atua tanto em interrupções quanto para alívio de demanda crítica no horário de ponta.' },
];

const fuelTypeOptions: { value: CiGeneratorFuelType; label: string; unit: string; defaultCost: number }[] = [
  { value: 'diesel', label: 'Diesel S10', unit: 'R$/litro', defaultCost: 6.2 },
  { value: 'natural_gas', label: 'Gás Natural', unit: 'R$/m³', defaultCost: 4.5 },
  { value: 'biogas', label: 'Biogás', unit: 'R$/m³', defaultCost: 2.8 },
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
  section = 'all',
}: {
  section?: 'backup' | 'generator' | 'all';
  ciOptions: CommercialIndustrialOptions;
  onChange: (partial: Partial<CommercialIndustrialOptions>) => void;
  onNavigatePrev?: () => void;
  onNavigateNext?: () => void;
}) {
  const { toKva, fromKva } = useCiAcPower(ciOptions.acPowerFactor);

  const backup = ciOptions.backup ?? {
    enabled: false,
    inputMode: 'simple',
    targetPowerKw: 0,
    targetPeakPowerKw: 0,
    autonomyHours: 4,
    loads: [],
    safetyMarginPercent: 10,
  };

  const generator = ciOptions.generator ?? DEFAULT_CI_GENERATOR_CONFIG;

  function updateGenerator(partial: Partial<CiGeneratorConfig>) {
    onChange({ generator: { ...generator, ...partial } });
  }

  // State for new load entry in detailed mode
  const [newLoadName, setNewLoadName] = useState('');
  const [newLoadPowerKva, setNewLoadPowerKva] = useState('');
  const [newLoadQty, setNewLoadQty] = useState('1');
  const [newLoadFactor, setNewLoadFactor] = useState('100');

  function updateBackup(partial: Partial<CiBackupConfig>) {
    onChange({
      backup: withAutomaticBackupSts(
        { ...backup, ...partial },
        { lineVoltageV: ciOptions.lineVoltageV, acPowerFactor: ciOptions.acPowerFactor }
      ),
    });
  }

  function handleAddLoad() {
    if (!newLoadName.trim()) return;
    const powerW = fromKva(Math.max(0.001, toNumber(newLoadPowerKva, 0.1))) * 1000;
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
    setNewLoadPowerKva('');
    setNewLoadQty('1');
    setNewLoadFactor('100');
  }

  function handleRemoveLoad(id: string) {
    updateBackup({
      loads: backup.loads.filter((load) => load.id !== id),
    });
  }

  let requirements: ReturnType<typeof computeBackupRequirements> = null;
  let selectionError: string | null = null;
  try { requirements = backup.enabled ? computeBackupRequirements(backup, ciOptions.loadCurve) : null; }
  catch(cause) { selectionError=cause instanceof Error?cause.message:'Intervalo de backup inválido.'; }
  const directValues=requirements?{targetPowerKw:requirements.requiredContinuousPowerKw/(1+backup.safetyMarginPercent/100),targetPeakPowerKw:requirements.requiredPeakPowerKw/(1+backup.safetyMarginPercent/100),autonomyHours:requirements.autonomyHours}:{};

  return (
    <div className="space-y-6">
      {section !== 'generator' && <>
      {/* Enable / Disable Card */}
      <div className="flex flex-col gap-3 rounded-xl border bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-amber-600" aria-hidden="true" />
            <h2 className="text-base font-semibold">Backup</h2><InfoTooltip label="Sobre a proteção de backup">Reserva energia no BESS para manter as cargas críticas durante a falta de rede. Sem backup, o dimensionamento considera apenas os benefícios tarifários.</InfoTooltip>
          </div>
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
            Backup desativado. Não há reserva para falta de rede.
          </p>
        </div>
      ) : (
        <>
          {/* Mode Selector */}
          <div className="space-y-3">
            <div>
              <div className="flex items-center gap-1"><p className="text-sm font-semibold">Cargas críticas</p><InfoTooltip label="Sobre o dimensionamento das cargas">Informe a demanda estimada diretamente ou detalhe cada carga. Os dois métodos determinam a potência e a energia reservadas para o backup.</InfoTooltip></div>
            </div>
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1 sm:w-fit">
              {inputModeOptions.map((option) => {
                const active = backup.inputMode === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => updateBackup({ inputMode: option.value, curveSelection: undefined,...(option.value==='simple'&&backup.curveSelection?directValues:{}) })}
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

          {backup.curveSelection && <div className="space-y-2 rounded-lg border p-3 text-sm"><div className="flex items-center gap-1">Backup vinculado à curva<InfoTooltip label="Sobre o backup vinculado à curva">Potência, energia e duração acompanham o intervalo selecionado. Use valores diretos para remover esse vínculo.</InfoTooltip></div>{selectionError && <p role="alert" className="text-destructive">{selectionError}</p>}<Button variant="outline" onClick={()=>updateBackup({curveSelection:undefined,...directValues})}>Usar valores diretos</Button></div>}
          {/* Simple Mode Form */}
          {backup.inputMode === 'simple' && !backup.curveSelection && (
            <div className="grid gap-4 sm:grid-cols-3">
              <NumberField
                id="target-power-kw"
                compact
                label="Potência crítica contínua"
                unit="kVA"
                icon={<Zap />}
                tipLabel="Sobre a potência crítica contínua"
                tip="Potência média das cargas durante a falta de rede."
                min="0"
                step="0.5"
                value={backup.targetPowerKw ? toKva(backup.targetPowerKw) : ''}
                onChange={(e) => updateBackup({ targetPowerKw: fromKva(Math.max(0, toNumber(e.target.value))) })}
                placeholder="Ex: 50"
              />

              <NumberField
                id="target-peak-power-kw"
                compact
                label="Potência de pico / surto"
                unit="kVA"
                icon={<Zap />}
                optional
                tipLabel="Sobre a potência de pico"
                tip="Partida de motores ou picos de curta duração."
                min="0"
                step="0.5"
                value={backup.targetPeakPowerKw ? toKva(backup.targetPeakPowerKw) : ''}
                onChange={(e) => updateBackup({ targetPeakPowerKw: fromKva(Math.max(0, toNumber(e.target.value))) })}
                placeholder="Ex: 75"
              />

              <NumberField
                id="autonomy-hours"
                compact
                label="Autonomia desejada"
                unit="horas"
                tipLabel="Sobre a autonomia de backup"
                tip="Tempo mínimo de sustentação sem rede."
                min="0.5"
                step="0.5"
                value={backup.autonomyHours || ''}
                onChange={(e) => updateBackup({ autonomyHours: Math.max(0.5, toNumber(e.target.value, 4)) })}
                placeholder="Ex: 4"
              />
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
                      + {preset.name} ({toKva(preset.powerW * preset.quantity * preset.usageFactor / 1000).toFixed(1)} kVA)
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border bg-muted/10 p-4 space-y-3">
                <p className="text-xs font-semibold">Adicionar carga crítica</p>
                <div className="grid gap-2 sm:grid-cols-4">
                  <div className="sm:col-span-1">
                    <Input
                      aria-label="Nome da carga"
                      placeholder="Nome da carga (ex: Servidores TI)"
                      value={newLoadName}
                      onChange={(e) => setNewLoadName(e.target.value)}
                    />
                  </div>
                  <div>
                    <NumberFieldControl
                      unit="kVA"
                      icon={<Zap />}
                      aria-label="Potência unitária (kVA)"
                      min={0.001}
                      step={0.001}
                      placeholder="Potência unitária"
                      value={newLoadPowerKva}
                      onChange={(e) => setNewLoadPowerKva(e.target.value)}
                    />
                  </div>
                  <div>
                    <NumberFieldControl
                      unit="un."
                      aria-label="Quantidade"
                      placeholder="Quantidade"
                      value={newLoadQty}
                      onChange={(e) => setNewLoadQty(e.target.value)}
                    />
                  </div>
                  <div className="flex gap-2">
                    <NumberFieldControl
                      unit="%"
                      icon={<Gauge />}
                      aria-label="Fator de uso (%)"
                      placeholder="Fator uso"
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
                            <td className="p-2.5">{toKva(load.powerW / 1000).toFixed(3)} kVA</td>
                            <td className="p-2.5">{Math.round((load.usageFactor ?? 1) * 100)}%</td>
                            <td className="p-2.5 font-semibold">{toKva(continuousW / 1000).toFixed(2)} kVA</td>
                            <td className="p-2.5 text-right">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                aria-label={`Remover carga ${load.name}`}
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
                <NumberField
                  id="detailed-autonomy-hours"
                  compact
                  label="Autonomia desejada para as cargas acima"
                  unit="horas"
                  min="0.5"
                  step="0.5"
                  value={backup.autonomyHours || ''}
                  onChange={(e) => updateBackup({ autonomyHours: Math.max(0.5, toNumber(e.target.value, 4)) })}
                  placeholder="Ex: 4"
                />
              </div>
            </div>
          )}

          {backup.curveSelection && <NumberField className="max-w-xs" compact label="Potência total na partida" unit="kVA" icon={<Zap />} min={0} step="any" value={toKva(backup.targetPeakPowerKw ?? 0)} onChange={event=>updateBackup({targetPeakPowerKw:fromKva(Math.max(0,toNumber(event.target.value)))})} />}
          {/* Operational Settings (Safety Margin) */}
          <div className="space-y-3 border-t pt-4">
            <p className="text-xs font-semibold">Parâmetros Operacionais</p>
            <NumberField
              id="safety-margin-percent"
              compact
              className="max-w-xs"
              label="Margem de segurança sobre a potência"
              unit="%"
              icon={<Gauge />}
              tipLabel="Sobre a margem de segurança"
              tip="Garante folga operacional para absorver variações momentâneas de carga."
              min="0"
              max="50"
              step="1"
              value={backup.safetyMarginPercent}
              onChange={(e) => updateBackup({ safetyMarginPercent: Math.max(0, toNumber(e.target.value, 10)) })}
            />
          </div>

          {/* Requirements Live Summary */}
          {requirements && (
            <div className="rounded-xl border bg-muted/20 p-4 space-y-2">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-primary" aria-hidden="true" />
                <p className="text-xs font-semibold">Requisitos de backup</p><InfoTooltip label="Sobre os requisitos de backup">O motor usa estes requisitos para filtrar as soluções viáveis e preservar a reserva mínima de SOC durante o despacho diário.</InfoTooltip>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 pt-1">
                <div>
                  <span className="text-xs text-muted-foreground">Potência Contínua Necessária</span>
                  <p className="text-sm font-bold text-foreground">
                    {toKva(requirements.requiredContinuousPowerKw).toFixed(1)} kVA
                  </p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">Potência de Pico/Surto</span>
                  <p className="text-sm font-bold text-foreground">
                    {toKva(requirements.requiredPeakPowerKw).toFixed(1)} kVA
                  </p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">Energia Mínima para {requirements.autonomyHours}h</span>
                  <p className="text-sm font-bold text-primary">
                    {requirements.requiredEnergyKwh.toFixed(1)} kWh
                  </p>
                </div>
              </div>

            </div>
          )}

          <CiStsBackupPanel options={ciOptions} backup={backup} />


        </>
      )}

      </>}
      {section !== 'backup' && <>
          {/* Generator (GMG) Section */}
          <div className="space-y-4 border-t pt-5">
            <div className="flex flex-col gap-3 rounded-xl border bg-muted/15 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Fuel className="h-5 w-5 text-amber-600" aria-hidden="true" />
                  <h3 className="text-sm font-semibold">Grupo Motor Gerador (GMG)</h3><InfoTooltip label="Sobre a integração do gerador">Use o gerador a combustão para estender a autonomia em apagões longos ou dar suporte no horário de ponta.</InfoTooltip>
                </div>

              </div>
              <Button
                type="button"
                variant={generator.enabled ? 'default' : 'outline'}
                size="sm"
                onClick={() => updateGenerator({ enabled: !generator.enabled })}
                className="shrink-0 font-medium"
              >
                {generator.enabled ? 'Gerador Habilitado' : 'Integrar Gerador'}
              </Button>
            </div>

            {generator.enabled && (
              <div className="space-y-4 rounded-xl border bg-muted/5 p-4">
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <NumberField
                      id="gen-power-kva"
                      compact
                      label="Potência Nominal"
                      unit="kVA"
                      icon={<Zap />}
                      min="0"
                      step="5"
                      value={generator.ratedPowerKva || ''}
                      onChange={(e) => updateGenerator({ ratedPowerKva: Math.max(0, toNumber(e.target.value)) })}
                      placeholder="Ex: 150"
                    />
                    <label className="mt-2 block space-y-1 text-xs">Fator de potência do gerador<CiAcPowerFactorInput label="Fator de potência do gerador" value={generator.powerFactor} onChange={value=>updateGenerator({powerFactor:value})} /></label>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1"><label htmlFor="gen-fuel-type" className="text-xs font-medium text-foreground">
                      Combustível
                    </label><InfoTooltip label="Sobre combustível">Fonte de energia primária do motor.</InfoTooltip></div>
                    <select
                      id="gen-fuel-type"
                      value={generator.fuelType}
                      onChange={(e) => {
                        const ft = e.target.value as CiGeneratorFuelType;
                        const opt = fuelTypeOptions.find((o) => o.value === ft);
                        updateGenerator({ fuelType: ft, fuelCostBrlPerUnit: opt?.defaultCost ?? 6.2 });
                      }}
                      className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-xs shadow-xs focus:ring-1 focus:ring-ring"
                    >
                      {fuelTypeOptions.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label} ({o.unit})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <NumberField
                      id="gen-fuel-cost"
                      compact
                      label="Preço do Combustível"
                      unit="R$"
                      min="0"
                      step="0.05"
                      value={generator.fuelCostBrlPerUnit || ''}
                      onChange={(e) => updateGenerator({ fuelCostBrlPerUnit: Math.max(0, toNumber(e.target.value)) })}
                      placeholder="Ex: 6.20"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Custo estimado por kWh gerado: ~R$ {((generator.fuelCostBrlPerUnit || 6.2) * (generator.specificConsumption || 0.28)).toFixed(2)}/kWh
                    </p>
                  </div>
                </div>

                <div className="space-y-2 pt-2 border-t">
                  <span className="text-xs font-medium text-foreground">Modo de Operação e Despacho do Gerador</span>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {generatorModeOptions.map((mode) => {
                      const isSelected = generator.dispatchMode === mode.value;
                      return (
                        <button
                          key={mode.value}
                          type="button"
                          onClick={() => updateGenerator({ dispatchMode: mode.value })}
                          className={cn(
                            'flex flex-col text-left p-3 rounded-lg border text-xs transition-colors',
                            isSelected
                              ? 'border-primary bg-primary/5 font-medium shadow-xs'
                              : 'border-border/80 bg-background/80 hover:bg-muted/40 text-muted-foreground'
                          )}
                        >
                          <span className={cn('font-semibold', isSelected && 'text-primary')}>{mode.label}</span>
                          <span className="text-[11px] text-muted-foreground mt-1">{mode.hint}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
      </>}

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
