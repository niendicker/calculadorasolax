'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { loadCiModularCatalog } from '@/lib/data/ci-modular-catalog-repository';
import { normalizeCiModularSelection, buildModularConfigurations, validateCiCompatibility, validateModularSelection } from '@/supabase/functions/_shared/commercial-industrial/modular';
import type { CiModularCatalog, CiModularSelection } from '@/supabase/functions/_shared/commercial-industrial/modular-types';
import type { CommercialIndustrialOptions } from '@/supabase/functions/_shared/commercial-industrial/types';

export const emptyModularSelection: CiModularSelection = { kind: 'modular',connectionModel:'independent_ports',ports:{min:1,max:1}, compatibilityId: null, mode: 'fixed', pcs: { min: 1, max: 1 }, series: { min: 1, max: 1 }, parallel: { min: 1, max: 1 } };

export function CiModularConfigurationPanel({ ciOptions, onChange, onNavigatePrev, onNavigateNext }: {
  ciOptions: CommercialIndustrialOptions; onChange: (partial: Partial<CommercialIndustrialOptions>) => void; onNavigatePrev?: () => void; onNavigateNext?: () => void;
}) {
  const [catalog, setCatalog] = useState<CiModularCatalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [selectedPcs, setSelectedPcs] = useState('');
  const selection = useMemo(()=>normalizeCiModularSelection(ciOptions.bessSystem?.kind === 'modular' ? ciOptions.bessSystem : emptyModularSelection),[ciOptions.bessSystem]);
  useEffect(() => {
    let alive = true;
    loadCiModularCatalog().then((data) => { if (alive) setCatalog(data); }).catch(() => { if (alive) setError('Não foi possível carregar o catálogo modular. Tente novamente ou contate o administrador.'); });
    return () => { alive = false; };
  }, [attempt]);
  const approved = useMemo(() => catalog?.rules.filter((rule) => validateCiCompatibility(rule, catalog.pcs.find((pcs) => pcs.inverter_id === rule.pcs_id), catalog.batteries.find((battery) => battery.battery_id === rule.battery_id)).length === 0 && (!rule.controller_accessory_id || catalog.accessories.some((item) => item.id === rule.controller_accessory_id && item.active))) ?? [], [catalog]);
  const rule = approved.find((item) => item.id === selection.compatibilityId);
  const effectivePcs = selectedPcs || rule?.pcs_id || '';
  const pcs = catalog?.pcs.find((item) => item.inverter_id === effectivePcs);
  const battery = catalog?.batteries.find((item) => item.battery_id === rule?.battery_id);
  const update = (partial: Partial<CiModularSelection>) => onChange({ bessSystem: { ...selection, ...partial }, bessProductId: null });
  const errors = rule ? validateModularSelection(selection) : [];
  const preview = useMemo(() => {
    if (!catalog || !rule) return { configurations: [], error: null };
    try { return { configurations: buildModularConfigurations(catalog, selection, { pcsUnitBrl: 0, batteryUnitBrl: 0, controllerUnitBrl: 0 }), error: null }; }
    catch (cause) { return { configurations: [], error: cause instanceof Error ? cause.message : 'Revise a configuração.' }; }
  }, [catalog, rule, selection]);

  function chooseRule(id: string, mode = selection.mode) {
    const next = approved.find((item) => item.id === id);
    if (!next) { update({ compatibilityId: null }); return; }
    update({connectionModel:'independent_ports',ports:{min:next.min_ports_per_pcs??1,max:mode==='fixed'?(next.min_ports_per_pcs??1):(next.max_ports_per_pcs??1)}, compatibilityId: id, mode, pcs: { min: next.min_pcs, max: mode === 'fixed' ? next.min_pcs : next.max_pcs }, series: { min: next.min_series, max: mode === 'fixed' ? next.min_series : next.max_series }, parallel: { min: next.min_parallel_strings, max: mode === 'fixed' ? next.min_parallel_strings : next.max_parallel_strings } });
  }
  return <div className="space-y-5">
    <div><h2 className="text-sm font-semibold">PCS + baterias</h2><p className="mt-1 text-xs text-muted-foreground">Selecione uma composição aprovada. A potência do PCS e a quantidade de baterias são dimensionadas separadamente.</p></div>
    {error ? <div role="alert" className="space-y-3 rounded-lg border border-destructive/40 p-4 text-sm text-destructive"><p>{error}</p><Button type="button" variant="outline" onClick={() => { setError(null); setAttempt((value) => value + 1); }}>Tentar novamente</Button></div> : !catalog ? <p role="status" className="text-sm text-muted-foreground">Carregando PCS, baterias e compatibilidades…</p> : approved.length === 0 ? <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Nenhuma compatibilidade modular aprovada e com fichas completas. Peça ao administrador para cadastrar os equipamentos e aprovar uma combinação em C&I BESS → Compatibilidades.</p> : <>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1.5 text-sm font-medium">Inversor / PCS<Select aria-label="Inversor / PCS" value={effectivePcs} onChange={(event) => { setSelectedPcs(event.target.value); update({ compatibilityId: null }); }}><option value="">Selecione o PCS</option>{catalog.pcs.filter((item) => approved.some((rule) => rule.pcs_id === item.inverter_id)).map((item) => <option key={item.inverter_id} value={item.inverter_id}>{item.model} · {item.discharge_power_kw} kW AC</option>)}</Select></label>
        <label className="space-y-1.5 text-sm font-medium">Bateria / compatibilidade aprovada<Select aria-label="Bateria / compatibilidade aprovada" disabled={!effectivePcs} value={selection.compatibilityId ?? ''} onChange={(event) => chooseRule(event.target.value)}><option value="">Selecione a combinação</option>{approved.filter((item) => item.pcs_id === effectivePcs).map((item) => <option key={item.id} value={item.id}>{catalog.batteries.find((battery) => battery.battery_id === item.battery_id)?.model} · {item.name}</option>)}</Select></label>
      </div>
      {selection.compatibilityId && !rule && <p role="alert" className="text-sm text-destructive">A compatibilidade salva está indisponível ou foi revogada. Selecione uma combinação aprovada para recalcular.</p>}
      {rule && <>
        <div className="space-y-2 rounded-lg border bg-muted/20 p-3 text-xs text-muted-foreground"><p className="font-medium text-foreground">{rule.name} · Revisão {rule.revision}</p><p>{pcs?.model} + {battery?.model} · {battery?.capacityKwh} kWh por {battery?.unit_kind === 'rack' ? 'rack' : battery?.unit_kind === 'cabinet' ? 'gabinete' : 'módulo'}</p><p>Comunicação/BMS: {rule.communication_profile}. Firmware PCS: {rule.pcs_firmware}; bateria: {rule.battery_firmware}.</p><p className="break-words">Referência: {rule.reference_document}</p>{rule.controller_accessory_id && <p>Controlador obrigatório: {catalog.accessories.find((item) => item.id === rule.controller_accessory_id)?.model ?? 'Indisponível'} · {rule.controller_quantity_per_pcs} por PCS.</p>}</div>
        <div className="flex flex-wrap gap-2">{(['fixed', 'auto'] as const).map((mode) => <Button key={mode} type="button" variant={selection.mode === mode ? 'default' : 'outline'} aria-pressed={selection.mode === mode} onClick={() => { if (mode !== selection.mode) chooseRule(rule.id, mode); }}>{mode === 'fixed' ? 'Composição fixa' : 'Comparar composições'}</Button>)}</div>
        <div className="grid gap-4 sm:grid-cols-3">{([
          ['pcs', 'Quantidade de PCS', rule.min_pcs, rule.max_pcs],
          ['ports','Portas utilizadas por PCS',rule.min_ports_per_pcs??1,rule.max_ports_per_pcs??1],
          ['series', 'Baterias em série por string', rule.min_series, rule.max_series],
          ['parallel', 'Strings em paralelo por porta', rule.min_parallel_strings, rule.max_parallel_strings],
        ] as const).map(([key, label, min, max]) => <fieldset key={key} className="space-y-2 rounded-lg border p-3"><legend className="px-1 text-xs font-medium">{label}</legend><p className="text-xs text-muted-foreground">Permitido: {min}–{max}</p>{(selection.mode === 'auto' ? ['min', 'max'] as const : ['min'] as const).map((bound) => <label key={bound} className="block space-y-1 text-xs">{selection.mode === 'fixed' ? 'Quantidade' : bound === 'min' ? 'Mínimo' : 'Máximo'}<Input aria-label={selection.mode === 'fixed' ? label : `${bound === 'min' ? 'Mínimo' : 'Máximo'}: ${label}`} type="number" min={min} max={max} step={1} value={(selection[key]??{min:1,max:1})[bound]} onChange={(event) => { const value = Number(event.target.value); update({ [key]: selection.mode === 'fixed' ? { min: value, max: value } : { ...selection[key], [bound]: value } }); }} /></label>)}</fieldset>)}</div>
        <p className="text-xs text-muted-foreground">A quantidade total de baterias soma os bancos de todas as portas e PCS. Na comparação automática, cada porta pode receber um arranjo diferente dentro das faixas aprovadas. O CAPEX utiliza os preços de cada equipamento e controlador no seu Portfólio.</p>
        {(errors.length > 0 || preview.error) && <div role="alert" className="rounded-lg border border-destructive/40 p-3 text-sm text-destructive">{[...new Set([...errors, ...(preview.error ? [preview.error] : [])])].map((message) => <p key={message}>{message}</p>)}</div>}
        {preview.configurations.length > 0 && <div className="grid gap-3 rounded-lg border bg-muted/20 p-4 text-sm sm:grid-cols-3"><div><p className="text-xs text-muted-foreground">Composições avaliadas</p><p className="font-semibold">{preview.configurations.length}</p></div><div><p className="text-xs text-muted-foreground">Potência de descarga AC</p><p className="font-semibold">{Math.min(...preview.configurations.map((item) => item.product.modulePowerKw)).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}–{Math.max(...preview.configurations.map((item) => item.product.modulePowerKw)).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} kW</p></div><div><p className="text-xs text-muted-foreground">Capacidade nominal</p><p className="font-semibold">{Math.min(...preview.configurations.map((item) => item.product.moduleCapacityKwh)).toLocaleString('pt-BR')}–{Math.max(...preview.configurations.map((item) => item.product.moduleCapacityKwh)).toLocaleString('pt-BR')} kWh</p></div></div>}
        {ciOptions.backup?.enabled && !rule.supports_backup && <p role="alert" className="text-sm text-amber-700">Esta composição não está aprovada para backup. Desative Falta de rede ou escolha outra compatibilidade antes de calcular.</p>}
      </>}
    </>}
    {(onNavigatePrev || onNavigateNext) && <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">{onNavigatePrev && <Button type="button" variant="outline" onClick={onNavigatePrev}><ChevronLeft aria-hidden="true" />Voltar para Visão geral</Button>}{onNavigateNext && <Button type="button" onClick={onNavigateNext} disabled={!rule || errors.length > 0 || Boolean(preview.error)} className="ml-auto">Avançar para Curvas e aplicações<ChevronRight aria-hidden="true" /></Button>}</div>}
  </div>;
}
