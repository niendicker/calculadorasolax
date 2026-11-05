'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { loadCiModularCatalog, saveCiBatterySpec, saveCiCompatibilityRule, saveCiPcsSpec, type CiEquipmentCatalog } from '@/lib/data/ci-modular-catalog-repository';
import type { CiBatterySpec, CiCompatibilityRule, CiPcsSpec } from '@/supabase/functions/_shared/commercial-industrial/modular-types';
import { validateCiCompatibility } from '@/supabase/functions/_shared/commercial-industrial/modular';
import { CatalogLayout, Field, InlineOptionTabs } from '../shared-ui';

export interface CiModularActivity { entityType: 'ci_pcs' | 'ci_battery' | 'ci_compatibility'; action: 'create' | 'update'; targetId: string; targetLabel: string; beforeData: unknown; afterData: unknown }
const emptyPcs: CiPcsSpec = { inverter_id: '', active: true, charge_power_kw: 0, discharge_power_kw: 0, charge_current_a: 0, discharge_current_a: 0, max_parallel_units: 1, supports_backup: false };
const emptyBattery: CiBatterySpec = { battery_id: '', active: true, unit_kind: 'rack', charge_power_kw: 0, discharge_power_kw: 0, charge_current_a: 0, discharge_current_a: 0, soc_max_percent: 100 };
const emptyRule: Omit<CiCompatibilityRule, 'id'> = { name: '', pcs_id: '', battery_id: '', active: true, approval_status: 'draft', min_series: 1, max_series: 1, min_parallel_strings: 1, max_parallel_strings: 1, min_pcs: 1, max_pcs: 1, supports_backup: false, communication_profile: '', pcs_firmware: '', battery_firmware: '', reference_document: '', revision: '', controller_accessory_id: null, controller_quantity_per_pcs: 1, notes: '' };
type Section = 'integrated' | 'pcs' | 'batteries' | 'compatibility';

export function CiModularCatalogEditor({ integrated, onActivity, onOpenCatalog }: { integrated: ReactNode; onActivity?: (activity: CiModularActivity) => Promise<void>; onOpenCatalog?: (tab: 'inverters' | 'batteries') => void }) {
  const [section, setSection] = useState<Section>('integrated');
  return <div className="space-y-4">
    <div className="overflow-x-auto"><div className="min-w-[32rem]"><InlineOptionTabs value={section} onChange={setSection} options={[{ value: 'integrated', label: 'BESS integrados' }, { value: 'pcs', label: 'Inversores / PCS' }, { value: 'batteries', label: 'Baterias C&I' }, { value: 'compatibility', label: 'Compatibilidades' }]} /></div></div>
    {section === 'integrated' ? integrated : <ModularRecords key={section} section={section} onActivity={onActivity} onOpenCatalog={onOpenCatalog} />}
  </div>;
}

function ModularRecords({ section, onActivity, onOpenCatalog }: { section: Exclude<Section, 'integrated'>; onActivity?: (activity: CiModularActivity) => Promise<void>; onOpenCatalog?: (tab: 'inverters' | 'batteries') => void }) {
  const [catalog, setCatalog] = useState<CiEquipmentCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pcs, setPcs] = useState<CiPcsSpec>(emptyPcs);
  const [battery, setBattery] = useState<CiBatterySpec>(emptyBattery);
  const [rule, setRule] = useState<Omit<CiCompatibilityRule, 'id'>>(emptyRule);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    let alive = true;
    loadCiModularCatalog().then((data) => { if (alive) { setCatalog(data); setLoading(false); } }).catch((cause) => { if (alive) { setError(cause instanceof Error ? cause.message : 'Não foi possível carregar o catálogo C&I.'); setLoading(false); } });
    return () => { alive = false; };
  }, [attempt]);

  const title = section === 'pcs' ? 'Inversores / PCS C&I' : section === 'batteries' ? 'Baterias C&I' : 'Compatibilidades PCS + bateria';
  const rows = section === 'pcs' ? catalog?.pcs ?? [] : section === 'batteries' ? catalog?.batteries ?? [] : catalog?.rules ?? [];
  const num = (label: string, value: number, change: (value: number) => void, integer = false) => <Field label={label}><Input type="number" required min={integer ? 1 : 0.000001} step={integer ? 1 : 'any'} value={value || ''} onChange={(event) => change(Number(event.target.value))} /></Field>;
  const checkbox = (label: string, checked: boolean, change: (value: boolean) => void) => <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={checked} onChange={(event) => change(event.target.checked)} />{label}</label>;

  async function save() {
    if (!catalog || !formRef.current?.reportValidity()) return;
    setSaving(true); setError(null); setStatus(null);
    try {
      let activity: CiModularActivity;
      if (section === 'pcs') {
        const base = catalog.inverterOptions.find((item) => item.id === pcs.inverter_id);
        if (base && base.power_kw > 0 && pcs.discharge_power_kw > base.power_kw) throw new Error('A potência contínua C&I excede a potência nominal da ficha do inversor.');
        await saveCiPcsSpec(pcs);
        activity = { entityType: 'ci_pcs', action: editingId ? 'update' : 'create', targetId: pcs.inverter_id, targetLabel: catalog.inverterOptions.find((item) => item.id === pcs.inverter_id)?.model ?? 'PCS', beforeData: catalog.pcs.find((item) => item.inverter_id === editingId) ?? null, afterData: pcs };
      } else if (section === 'batteries') {
        if (battery.soc_max_percent > 100) throw new Error('SOC máximo deve ser até 100%.');
        const base = catalog.batteryOptions.find((item) => item.id === battery.battery_id);
        if (base?.max_current_a && Math.max(battery.charge_current_a, battery.discharge_current_a) > base.max_current_a) throw new Error('A corrente contínua C&I excede a corrente máxima da ficha da bateria.');
        if (base && battery.soc_max_percent <= base.min_soc_percent) throw new Error('SOC máximo deve ser maior que o SOC mínimo da ficha da bateria.');
        await saveCiBatterySpec(battery);
        activity = { entityType: 'ci_battery', action: editingId ? 'update' : 'create', targetId: battery.battery_id, targetLabel: base?.model ?? 'Bateria', beforeData: catalog.batteries.find((item) => item.battery_id === editingId) ?? null, afterData: battery };
      } else {
        if (rule.approval_status === 'approved' && rule.active) {
          const errors = validateCiCompatibility({ ...rule, id: editingId ?? 'new', active: true }, catalog.pcs.find((item) => item.inverter_id === rule.pcs_id), catalog.batteries.find((item) => item.battery_id === rule.battery_id));
          if (rule.controller_accessory_id && !catalog.accessories.some((item) => item.id === rule.controller_accessory_id && item.active)) errors.push('O controlador obrigatório precisa estar ativo.');
          if (errors.length) throw new Error(errors.join(' '));
        }
        const id = await saveCiCompatibilityRule({ ...rule, ...(editingId ? { id: editingId } : {}) });
        activity = { entityType: 'ci_compatibility', action: editingId ? 'update' : 'create', targetId: id, targetLabel: rule.name, beforeData: catalog.rules.find((item) => item.id === editingId) ?? null, afterData: rule };
      }
      setOpen(false); setStatus('Cadastro salvo.');
      await onActivity?.(activity);
      setCatalog(await loadCiModularCatalog());
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível salvar o cadastro.'); }
    finally { setSaving(false); }
  }

  if (loading) return <p role="status" className="p-4 text-sm text-muted-foreground">Carregando equipamentos e compatibilidades…</p>;
  if (!catalog) return <div role="alert" className="space-y-3 rounded-lg border border-destructive/40 p-4 text-sm"><p>{error}</p><Button variant="outline" onClick={() => { setError(null); setLoading(true); setAttempt((value) => value + 1); }}>Tentar novamente</Button></div>;

  const pcsBase = catalog.inverterOptions.find((item) => item.id === pcs.inverter_id);
  const batteryBase = catalog.batteryOptions.find((item) => item.id === battery.battery_id);
  return <div className="space-y-4">
    {error && !open && <p role="alert" className="rounded-lg border border-destructive/40 p-3 text-sm text-destructive">{error}</p>}
    {status && <p role="status" className="text-sm">{status}</p>}
    <p className="text-sm text-muted-foreground">Os modelos são compartilhados com os catálogos Inversores e Baterias. Aqui são cadastrados os limites contínuos C&I e as combinações documentadas pelo fabricante. As quantidades série/paralelo são explícitas.</p>
    <CatalogLayout title={title} count={rows.length} formOpen={open} formTitle={`${editingId ? 'Editar' : 'Cadastrar'} ${section === 'compatibility' ? 'compatibilidade C&I' : section === 'pcs' ? 'PCS C&I' : 'bateria C&I'}`} newLabel={section === 'compatibility' ? 'Nova compatibilidade C&I' : section === 'pcs' ? 'Cadastrar PCS' : 'Cadastrar bateria C&I'} onNew={() => { setEditingId(null); setPcs(emptyPcs); setBattery(emptyBattery); setRule(emptyRule); setError(null); setOpen(true); }} onClose={() => { if (!saving) setOpen(false); }} form={
      <form ref={formRef} className="space-y-4" onSubmit={(event) => { event.preventDefault(); void save(); }}>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {section === 'pcs' ? <>
          <Field label="Inversor / PCS do catálogo"><Select aria-label="Inversor / PCS do catálogo" required value={pcs.inverter_id} disabled={editingId !== null} onChange={(event) => setPcs({ ...pcs, inverter_id: event.target.value })}><option value="">Selecione um modelo</option>{catalog.inverterOptions.map((item) => <option key={item.id} value={item.id}>{item.model}</option>)}</Select></Field>
          <p className="text-xs text-muted-foreground">Potência nominal AC: {pcsBase?.power_kw ?? '—'} kW. Janela DC herdada: {pcsBase?.battery_voltage_min_v ?? '—'}–{pcsBase?.battery_voltage_max_v ?? '—'} V. Eficiência carga/descarga: {pcsBase?.battery_charge_efficiency_percent ?? '—'}% / {pcsBase?.battery_discharge_efficiency_percent ?? '—'}%. Complete esses campos na ficha do inversor antes de aprovar uma combinação.</p>
          <div className="grid gap-3 sm:grid-cols-2">{num('Potência contínua de carga AC (kW)', pcs.charge_power_kw, (value) => setPcs({ ...pcs, charge_power_kw: value }))}{num('Potência contínua de descarga AC (kW)', pcs.discharge_power_kw, (value) => setPcs({ ...pcs, discharge_power_kw: value }))}{num('Corrente contínua de carga DC total (A)', pcs.charge_current_a, (value) => setPcs({ ...pcs, charge_current_a: value }))}{num('Corrente contínua de descarga DC total (A)', pcs.discharge_current_a, (value) => setPcs({ ...pcs, discharge_current_a: value }))}{num('Máximo de PCS em paralelo', pcs.max_parallel_units, (value) => setPcs({ ...pcs, max_parallel_units: value }), true)}</div>
          {checkbox('PCS apto a operar em backup', pcs.supports_backup, (value) => setPcs({ ...pcs, supports_backup: value }))}{checkbox('Ativo', pcs.active, (value) => setPcs({ ...pcs, active: value }))}
        </> : section === 'batteries' ? <>
          <Field label="Bateria do catálogo"><Select aria-label="Bateria do catálogo" required value={battery.battery_id} disabled={editingId !== null} onChange={(event) => setBattery({ ...battery, battery_id: event.target.value })}><option value="">Selecione um modelo</option>{catalog.batteryOptions.map((item) => <option key={item.id} value={item.id}>{item.model}</option>)}</Select></Field>
          <p className="text-xs text-muted-foreground">Ficha compartilhada: {batteryBase?.capacity_kwh ?? '—'} kWh; {batteryBase?.voltage_min_v ?? '—'}–{batteryBase?.voltage_max_v ?? '—'} V; SOC mínimo {batteryBase?.min_soc_percent ?? '—'}%; eficiência de ciclo {batteryBase?.round_trip_efficiency_percent ?? '—'}%; corrente máxima {batteryBase?.max_current_a ?? '—'} A.</p>
          <Field label="Unidade comercial"><Select aria-label="Unidade comercial" value={battery.unit_kind} onChange={(event) => setBattery({ ...battery, unit_kind: event.target.value as CiBatterySpec['unit_kind'] })}><option value="module">Módulo</option><option value="rack">Rack</option><option value="cabinet">Gabinete</option></Select></Field>
          <div className="grid gap-3 sm:grid-cols-2">{num('Potência contínua de carga DC por unidade (kW)', battery.charge_power_kw, (value) => setBattery({ ...battery, charge_power_kw: value }))}{num('Potência contínua de descarga DC por unidade (kW)', battery.discharge_power_kw, (value) => setBattery({ ...battery, discharge_power_kw: value }))}{num('Corrente contínua de carga por unidade (A)', battery.charge_current_a, (value) => setBattery({ ...battery, charge_current_a: value }))}{num('Corrente contínua de descarga por unidade (A)', battery.discharge_current_a, (value) => setBattery({ ...battery, discharge_current_a: value }))}{num('SOC máximo (%)', battery.soc_max_percent, (value) => setBattery({ ...battery, soc_max_percent: value }))}</div>
          {checkbox('Ativa', battery.active, (value) => setBattery({ ...battery, active: value }))}
        </> : <>
          <Field label="Nome da composição compatível"><Input required value={rule.name} onChange={(event) => setRule({ ...rule, name: event.target.value })} /></Field>
          <div className="grid gap-3 sm:grid-cols-2"><Field label="PCS"><Select aria-label="PCS" required value={rule.pcs_id} onChange={(event) => setRule({ ...rule, pcs_id: event.target.value })}><option value="">Selecione um PCS</option>{catalog.pcs.map((item) => <option key={item.inverter_id} value={item.inverter_id}>{item.model}{item.active ? '' : ' · Inativo'}</option>)}</Select></Field><Field label="Bateria"><Select aria-label="Bateria" required value={rule.battery_id} onChange={(event) => setRule({ ...rule, battery_id: event.target.value })}><option value="">Selecione uma bateria</option>{catalog.batteries.map((item) => <option key={item.battery_id} value={item.battery_id}>{item.model}{item.active ? '' : ' · Inativa'}</option>)}</Select></Field></div>
          <p className="text-xs text-muted-foreground">Uma string contém unidades em série. Cada PCS recebe a mesma quantidade de strings em paralelo, em um barramento DC agregado. Informe somente faixas autorizadas no documento do fabricante.</p>
          <div className="grid gap-3 sm:grid-cols-2">{([['min_series', 'Baterias em série: mínimo'], ['max_series', 'Baterias em série: máximo'], ['min_parallel_strings', 'Strings por PCS: mínimo'], ['max_parallel_strings', 'Strings por PCS: máximo'], ['min_pcs', 'PCS em paralelo: mínimo'], ['max_pcs', 'PCS em paralelo: máximo']] as const).map(([key, label]) => <div key={key}>{num(label, rule[key], (value) => setRule({ ...rule, [key]: value }), true)}</div>)}</div>
          <Field label="Controlador / acessório obrigatório"><Select aria-label="Controlador / acessório obrigatório" value={rule.controller_accessory_id ?? ''} onChange={(event) => setRule({ ...rule, controller_accessory_id: event.target.value || null })}><option value="">Nenhum acessório adicional obrigatório</option>{catalog.accessories.map((item) => <option key={item.id} value={item.id}>{item.model}{item.active ? '' : ' · Inativo'}</option>)}</Select></Field>
          {rule.controller_accessory_id && num('Controladores por PCS', rule.controller_quantity_per_pcs, (value) => setRule({ ...rule, controller_quantity_per_pcs: value }), true)}
          <Field label="Situação da compatibilidade"><Select aria-label="Situação da compatibilidade" value={rule.approval_status} onChange={(event) => setRule({ ...rule, approval_status: event.target.value as CiCompatibilityRule['approval_status'] })}><option value="draft">Rascunho</option><option value="approved">Aprovada conforme documento</option><option value="revoked">Revogada</option></Select></Field>
          <div className="grid gap-3 sm:grid-cols-2">{([['communication_profile', 'Perfil de comunicação / BMS'], ['pcs_firmware', 'Firmware aprovado do PCS'], ['battery_firmware', 'Firmware aprovado da bateria / BMS'], ['reference_document', 'Documento de referência (link ou identificação)'], ['revision', 'Revisão / data do documento'], ['notes', 'Observações']] as const).map(([key, label]) => <Field key={key} label={label}><Input required={rule.approval_status === 'approved' && key !== 'notes'} value={rule[key]} onChange={(event) => setRule({ ...rule, [key]: event.target.value })} /></Field>)}</div>
          {checkbox('Composição aprovada para backup', rule.supports_backup, (value) => setRule({ ...rule, supports_backup: value }))}{checkbox('Ativa', rule.active, (value) => setRule({ ...rule, active: value }))}
        </>}
        <div className="flex gap-2 border-t pt-3"><Button type="submit" disabled={saving}>{saving ? 'Salvando…' : 'Salvar'}</Button><Button type="button" variant="ghost" disabled={saving} onClick={() => setOpen(false)}>Fechar</Button></div>
      </form>
    } items={section === 'pcs' ? catalog.pcs.map((item) => ({ id: item.inverter_id, title: item.model, badges: [item.active ? 'Ativo' : 'Inativo'], details: [['Carga / descarga AC', `${item.charge_power_kw} / ${item.discharge_power_kw} kW`], ['Janela DC', `${item.voltageMinV ?? '—'}–${item.voltageMaxV ?? '—'} V`], ['Paralelismo', `${item.max_parallel_units} PCS`]], onEdit: () => { setPcs({ inverter_id: item.inverter_id, active: item.active, charge_power_kw: item.charge_power_kw, discharge_power_kw: item.discharge_power_kw, charge_current_a: item.charge_current_a, discharge_current_a: item.discharge_current_a, max_parallel_units: item.max_parallel_units, supports_backup: item.supports_backup }); setEditingId(item.inverter_id); setError(null); setOpen(true); } })) : section === 'batteries' ? catalog.batteries.map((item) => ({ id: item.battery_id, title: item.model, badges: [item.active ? 'Ativa' : 'Inativa'], details: [['Unidade', item.unit_kind === 'module' ? 'Módulo' : item.unit_kind === 'rack' ? 'Rack' : 'Gabinete'], ['Capacidade', `${item.capacityKwh} kWh`], ['Tensão DC', `${item.voltageMinV ?? '—'}–${item.voltageMaxV ?? '—'} V`]], onEdit: () => { setBattery({ battery_id: item.battery_id, active: item.active, unit_kind: item.unit_kind, charge_power_kw: item.charge_power_kw, discharge_power_kw: item.discharge_power_kw, charge_current_a: item.charge_current_a, discharge_current_a: item.discharge_current_a, soc_max_percent: item.soc_max_percent }); setEditingId(item.battery_id); setError(null); setOpen(true); } })) : catalog.rules.map((item) => ({ id: item.id, title: item.name, badges: [!item.active ? 'Inativa' : item.approval_status === 'approved' ? 'Aprovada' : item.approval_status === 'revoked' ? 'Revogada' : 'Rascunho'], description: `${catalog.pcs.find((pcs) => pcs.inverter_id === item.pcs_id)?.model ?? 'PCS'} + ${catalog.batteries.find((battery) => battery.battery_id === item.battery_id)?.model ?? 'Bateria'}`, details: [['Associação por PCS', `${item.min_series}–${item.max_series} em série × ${item.min_parallel_strings}–${item.max_parallel_strings} strings`], ['PCS em paralelo', `${item.min_pcs}–${item.max_pcs}`], ['Referência', item.revision || 'Pendente']], onEdit: () => { const { id, ...value } = item; setRule(value); setEditingId(id); setError(null); setOpen(true); } }))} />
    {rows.length === 0 && <div className="space-y-3 rounded-lg border border-dashed p-4 text-sm text-muted-foreground"><p>Nenhum cadastro nesta seção. Cadastre os modelos no catálogo compartilhado e preencha os dados C&I aqui.</p>{onOpenCatalog && section !== 'compatibility' && <Button variant="outline" onClick={() => onOpenCatalog(section === 'pcs' ? 'inverters' : 'batteries')}>Abrir catálogo de {section === 'pcs' ? 'inversores' : 'baterias'}</Button>}</div>}
  </div>;
}
