'use client';

import { FieldHelpLabel, FieldHelpProvider } from '../field-help';
import { CI_FIELD_HELP } from './ci-field-help';
import { CiAccessoryRulesEditor } from './CiAccessoryRulesEditor';
import { CiProductCatalogEditor } from './CiProductCatalogEditor';
import { CiGeneratedSolutionsEditor } from './CiGeneratedSolutionsEditor';
import { CiStsCatalogEditor } from './CiStsCatalogEditor';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { loadCiModularCatalog, saveCiCompatibilityRule, type CiEquipmentCatalog } from '@/lib/data/ci-modular-catalog-repository';
import type { CiCompatibilityRule } from '@/supabase/functions/_shared/commercial-industrial/modular-types';
import { validateCiCompatibility } from '@/supabase/functions/_shared/commercial-industrial/modular';
import { CatalogLayout, Field, InlineOptionTabs } from '../shared-ui';

export interface CiModularActivity { entityType: 'ci_pcs' | 'ci_battery' | 'ci_compatibility' | 'ci_sts' | 'ci_sts_compatibility' | 'ci_accessory' | 'ci_accessory_rule'; action: 'create' | 'update'; targetId: string; targetLabel: string; beforeData: unknown; afterData: unknown }
const emptyRule: Omit<CiCompatibilityRule, 'id'> = { name: '', pcs_id: '', battery_id: '', active: true, approval_status: 'draft', min_series: 1, max_series: 1,min_ports_per_pcs:1,max_ports_per_pcs:1, min_parallel_strings: 1, max_parallel_strings: 1, min_pcs: 1, max_pcs: 1, supports_backup: false, communication_profile: '', pcs_firmware: '', battery_firmware: '', reference_document: '', revision: '', controller_accessory_id: null, controller_quantity_per_pcs: 1, notes: '' };
type Section = 'integrated' | 'pcs' | 'batteries' | 'compatibility' | 'sts' | 'accessories' | 'accessoryRules' | 'solutions';

export function CiModularCatalogEditor({ integrated, onActivity, uploadAsset }: { uploadAsset: Parameters<typeof CiProductCatalogEditor>[0]['uploadAsset']; integrated: ReactNode; onActivity?: (activity: CiModularActivity) => Promise<void>; onOpenCatalog?: (tab: 'inverters' | 'batteries') => void }) {
  const [section, setSection] = useState<Section>('integrated');
  return <FieldHelpProvider tips={CI_FIELD_HELP}><div className="space-y-4">
    <div className="overflow-x-auto"><div className="min-w-[32rem]"><InlineOptionTabs value={section} onChange={setSection} options={[{ value: 'integrated', label: 'BESS integrados' }, { value: 'pcs', label: 'Inversores / PCS' }, { value: 'batteries', label: 'Baterias C&I' }, { value: 'compatibility', label: 'Compatibilidades' }, {value:'solutions',label:'Soluções geradas'}, {value:'sts',label:'STS / Transferência'}, {value:'accessories',label:'Acessórios'}, {value:'accessoryRules',label:'Regras de acessórios'}]} /></div></div>
    {section === 'solutions' ? <CiGeneratedSolutionsEditor/> : section === 'integrated' ? integrated : section === 'accessoryRules' ? <CiAccessoryRulesEditor onActivity={onActivity}/> : section === 'sts' ? <CiStsCatalogEditor onActivity={onActivity} uploadAsset={uploadAsset} /> : section === 'accessories' || section === 'pcs' || section === 'batteries' ? <CiProductCatalogEditor key={section} kind={section as 'pcs'|'batteries'|'accessories'} uploadAsset={uploadAsset} onActivity={onActivity} onViewRules={() => setSection(section === 'accessories' ? 'accessoryRules' : 'compatibility')}/> : <CompatibilityRecords onActivity={onActivity} />}
  </div></FieldHelpProvider>;
}

function CompatibilityRecords({ onActivity }: { onActivity?: (activity: CiModularActivity) => Promise<void> }) {
  const [catalog, setCatalog] = useState<CiEquipmentCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [rule, setRule] = useState<Omit<CiCompatibilityRule, 'id'>>(emptyRule);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    let alive = true;
    loadCiModularCatalog().then((data) => { if (alive) { setCatalog(data); setLoading(false); } }).catch((cause) => { if (alive) { setError(cause instanceof Error ? cause.message : 'Não foi possível carregar o catálogo C&I.'); setLoading(false); } });
    return () => { alive = false; };
  }, [attempt]);

  const rows = catalog?.rules ?? [];
  const num = (label: string, value: number, change: (value: number) => void, integer = false) => <Field label={label}><Input type="number" required min={integer ? 1 : 0.000001} step={integer ? 1 : 'any'} value={value || ''} onChange={(event) => change(Number(event.target.value))} /></Field>;
  const checkbox = (label: string, checked: boolean, change: (value: boolean) => void) => <label className="flex items-center gap-2 text-sm"><input type="checkbox" aria-label={label} checked={checked} onChange={(event) => change(event.target.checked)} /><FieldHelpLabel label={label} /></label>;

  async function save() {
    if (!catalog || !formRef.current?.reportValidity()) return;
    setSaving(true); setError(null); setStatus(null);
    try {
      if (rule.approval_status === 'approved' && rule.active) {
        const errors = validateCiCompatibility({ ...rule, id: editingId ?? 'new', active: true }, catalog.pcs.find((item) => item.inverter_id === rule.pcs_id), catalog.batteries.find((item) => item.battery_id === rule.battery_id));
        if (rule.controller_accessory_id && !catalog.accessories.some((item) => item.id === rule.controller_accessory_id && item.active)) errors.push('O controlador obrigatório precisa estar ativo.');
        if (errors.length) throw new Error(errors.join(' '));
      }
      const id = await saveCiCompatibilityRule({ ...rule, ...(editingId ? { id: editingId } : {}) });
      const activity: CiModularActivity = { entityType: 'ci_compatibility', action: editingId ? 'update' : 'create', targetId: id, targetLabel: rule.name, beforeData: catalog.rules.find((item) => item.id === editingId) ?? null, afterData: rule };
      setOpen(false); setStatus('Cadastro salvo.');
      await onActivity?.(activity);
      setCatalog(await loadCiModularCatalog());
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível salvar o cadastro.'); }
    finally { setSaving(false); }
  }

  if (loading) return <p role="status" className="p-4 text-sm text-muted-foreground">Carregando equipamentos e compatibilidades…</p>;
  if (!catalog) return <div role="alert" className="space-y-3 rounded-lg border border-destructive/40 p-4 text-sm"><p>{error}</p><Button variant="outline" onClick={() => { setError(null); setLoading(true); setAttempt((value) => value + 1); }}>Tentar novamente</Button></div>;

  return <div className="space-y-4">
    {error && !open && <p role="alert" className="rounded-lg border border-destructive/40 p-3 text-sm text-destructive">{error}</p>}
    {status && <p role="status" className="text-sm">{status}</p>}
    <p className="text-sm text-muted-foreground">Combinações documentadas pelo fabricante entre os equipamentos C&I. As quantidades série/paralelo são explícitas.</p>
    <CatalogLayout title="Compatibilidades PCS + bateria" count={rows.length} formOpen={open} formTitle={`${editingId ? 'Editar' : 'Cadastrar'} compatibilidade C&I`} newLabel="Nova compatibilidade C&I" onNew={() => { setEditingId(null); setRule(emptyRule); setError(null); setOpen(true); }} onClose={() => { if (!saving) setOpen(false); }} form={
      <form ref={formRef} className="space-y-4" onSubmit={(event) => { event.preventDefault(); void save(); }}>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <Field label="Nome da composição compatível"><Input required value={rule.name} onChange={(event) => setRule({ ...rule, name: event.target.value })} /></Field>
          <div className="grid gap-3 sm:grid-cols-2"><Field label="PCS"><Select aria-label="PCS" required value={rule.pcs_id} onChange={(event) => setRule({ ...rule, pcs_id: event.target.value })}><option value="">Selecione um PCS</option>{catalog.pcs.map((item) => <option key={item.inverter_id} value={item.inverter_id}>{item.model}{item.active ? '' : ' · Inativo'}</option>)}</Select></Field><Field label="Bateria"><Select aria-label="Bateria" required value={rule.battery_id} onChange={(event) => setRule({ ...rule, battery_id: event.target.value })}><option value="">Selecione uma bateria</option>{catalog.batteries.map((item) => <option key={item.battery_id} value={item.battery_id}>{item.model}{item.active ? '' : ' · Inativa'}</option>)}</Select></Field></div>
          <p className="text-xs text-muted-foreground">Cada porta recebe seu próprio banco de baterias. A geração compara quantidades diferentes de módulos entre as portas, dentro das faixas aprovadas. Strings em paralelo são conexões dentro de uma única porta; não representam portas adicionais.</p>
          <div className="grid gap-3 sm:grid-cols-2">{([['min_series', 'Baterias em série: mínimo'], ['max_series', 'Baterias em série: máximo'], ['min_ports_per_pcs', 'Portas utilizadas por PCS: mínimo'], ['max_ports_per_pcs', 'Portas utilizadas por PCS: máximo'], ['min_parallel_strings', 'Strings em paralelo por porta: mínimo'], ['max_parallel_strings', 'Strings em paralelo por porta: máximo'], ['min_pcs', 'PCS em paralelo: mínimo'], ['max_pcs', 'PCS em paralelo: máximo']] as const).map(([key, label]) => <div key={key}>{num(label, rule[key]??1, (value) => setRule({ ...rule, [key]: value }), true)}</div>)}</div>
          <Field label="Controlador / acessório obrigatório"><Select aria-label="Controlador / acessório obrigatório" value={rule.controller_accessory_id ?? ''} onChange={(event) => setRule({ ...rule, controller_accessory_id: event.target.value || null })}><option value="">Nenhum acessório adicional obrigatório</option>{catalog.accessories.map((item) => <option key={item.id} value={item.id}>{item.model}{item.active ? '' : ' · Inativo'}</option>)}</Select></Field>
          {rule.controller_accessory_id && num('Controladores por PCS', rule.controller_quantity_per_pcs, (value) => setRule({ ...rule, controller_quantity_per_pcs: value }), true)}
          <Field label="Situação da compatibilidade"><Select aria-label="Situação da compatibilidade" value={rule.approval_status} onChange={(event) => setRule({ ...rule, approval_status: event.target.value as CiCompatibilityRule['approval_status'] })}><option value="draft">Rascunho</option><option value="approved">Aprovada conforme documento</option><option value="revoked">Revogada</option></Select></Field>
          <div className="grid gap-3 sm:grid-cols-2">{([['communication_profile', 'Perfil de comunicação / BMS'], ['pcs_firmware', 'Firmware aprovado do PCS'], ['battery_firmware', 'Firmware aprovado da bateria / BMS'], ['reference_document', 'Documento de referência (link ou identificação)'], ['revision', 'Revisão / data do documento'], ['notes', 'Observações']] as const).map(([key, label]) => <Field key={key} label={label}><Input required={rule.approval_status === 'approved' && key !== 'notes'} value={rule[key]} onChange={(event) => setRule({ ...rule, [key]: event.target.value })} /></Field>)}</div>
          {checkbox('Integração FV aprovada conforme documento', rule.supports_solar ?? false, (value) => setRule({...rule,supports_solar:value}))}{checkbox('Integração com gerador aprovada conforme documento', rule.supports_generator ?? false, (value) => setRule({...rule,supports_generator:value}))}
          {checkbox('Composição aprovada para backup', rule.supports_backup, (value) => setRule({ ...rule, supports_backup: value }))}{checkbox('Ativa', rule.active, (value) => setRule({ ...rule, active: value }))}
        <div className="flex gap-2 border-t pt-3"><Button type="submit" disabled={saving}>{saving ? 'Salvando…' : 'Salvar'}</Button><Button type="button" variant="ghost" disabled={saving} onClick={() => setOpen(false)}>Fechar</Button></div>
      </form>
    } items={catalog.rules.map((item) => ({ id: item.id, title: item.name, badges: [!item.active ? 'Inativa' : item.approval_status === 'approved' ? 'Aprovada' : item.approval_status === 'revoked' ? 'Revogada' : 'Rascunho'], description: `${catalog.pcs.find((pcs) => pcs.inverter_id === item.pcs_id)?.model ?? 'PCS'} + ${catalog.batteries.find((battery) => battery.battery_id === item.battery_id)?.model ?? 'Bateria'}`, details: [['Portas por PCS',`${item.min_ports_per_pcs??1}–${item.max_ports_per_pcs??1}`],['Associação por porta', `${item.min_series}–${item.max_series} em série × ${item.min_parallel_strings}–${item.max_parallel_strings} strings`], ['PCS em paralelo', `${item.min_pcs}–${item.max_pcs}`], ['Referência', item.revision || 'Pendente']], onEdit: () => { const { id, ...value } = item; setRule(value); setEditingId(id); setError(null); setOpen(true); } }))} />
    {rows.length === 0 && <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Nenhuma compatibilidade cadastrada. Cadastre os equipamentos com seus limites de operação e registre a composição documentada aqui.</p>}
  </div>;
}
