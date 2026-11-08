'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Json } from '@/lib/database.types';
import { CiEquipmentLimitsFields } from './CiEquipmentLimitsFields';
import { buildCiEquipmentLimits, type CiEquipmentLimits } from './ci-equipment-limits';
import { Button } from '@/components/ui/button';
import { buildCiInverterPayload, buildBatteryPayload, buildAccessoryPayload } from '../save-payloads';
import { InvertersEditor } from './InvertersEditor';
import { BatteriesEditor } from './BatteriesEditor';
import { AccessoriesEditor } from './AccessoriesEditor';
import { emptyInverter, emptyBattery, emptyAccessory, type InverterRow, type BatteryRow, type AccessoryRow } from '../types';
import type { CiModularActivity } from './CiModularCatalogEditor';

type Kind = 'pcs' | 'batteries' | 'accessories';
type Row = (InverterRow | BatteryRow | AccessoryRow) & { limits?: CiEquipmentLimits };
type Upload = Parameters<typeof InvertersEditor>[0]['uploadAsset'];
const tables = { pcs: 'ci_inverters', batteries: 'ci_batteries', accessories: 'ci_accessories' } as const;
const defaults = { pcs: emptyInverter, batteries: emptyBattery, accessories: emptyAccessory };

/** Reuse the residential editors; persistence and product identities belong exclusively to C&I. */
export function CiProductCatalogEditor({ kind, uploadAsset, onActivity, onViewRules }: {kind: Kind; uploadAsset: Upload; onActivity?: (activity: CiModularActivity) => Promise<void>; onViewRules: () => void}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [form, setForm] = useState<Partial<Row>>(defaults[kind]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [saving, setSaving] = useState(false);
  const table = tables[kind];
  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const db = createClient();
        const [products, specs] = await Promise.all([
          db.from(table).select('*').order('model'),
          kind === 'accessories' ? Promise.resolve({ data: [], error: null })
            : db.from(kind === 'pcs' ? 'ci_pcs_specs' : 'ci_battery_specs').select('*'),
        ]);
        if (products.error) throw new Error(products.error.message);
        if (specs.error) throw new Error(specs.error.message);
        const limits = new Map((specs.data ?? []).map(spec => {
          const value = spec as CiEquipmentLimits;
          return [value.inverter_id ?? value.battery_id, value];
        }));
        if (alive) setRows((products.data ?? []).map(product => ({ ...product, limits: limits.get(product.id) })) as unknown as Row[]);
      } catch (cause) {
        if (alive) setError(cause instanceof Error ? cause.message : 'Não foi possível carregar o catálogo C&I.');
      } finally { if (alive) setLoading(false); }
    }
    void load();
    return () => { alive = false; };
  }, [table, kind, attempt]);
  async function save(afterPersist?: () => void) {
    if (!form.model?.trim()) { setError('Informe o modelo.'); return; }
    setSaving(true); setError(null);
    try {
      const before = rows.find(row => row.id === form.id);
      // Price lists are keyed by model. Keep established identities stable.
      if (before && before.model !== form.model.trim()) throw new Error('Para preservar preços e histórico, mantenha o modelo cadastrado. Use o apelido para alterar o nome exibido.');
      const fields = kind === 'pcs' ? buildCiInverterPayload(form as Partial<InverterRow>) : kind === 'batteries' ? buildBatteryPayload(form as Partial<BatteryRow>) : buildAccessoryPayload(form as Partial<AccessoryRow>);
      const payload = {...fields,...(form.id ? {id:form.id} : {})};
      let saved: Row;
      if (kind === 'accessories') {
        const { data, error } = await createClient().from(table).upsert(payload as never).select('*').single();
        if (error) throw new Error(error.message);
        saved = data as unknown as Row;
      } else {
        const limits = buildCiEquipmentLimits(kind, kind === 'pcs' ? buildCiInverterPayload(form as Partial<InverterRow>) : buildBatteryPayload(form as Partial<BatteryRow>), form.limits);
        const { data, error } = await createClient().rpc('save_ci_equipment', {
          p_kind: kind, p_product: fields as unknown as Json, p_limits: limits as Json, p_id: form.id ?? null,
        });
        if (error) throw new Error(error.message);
        const result = data as unknown as { product: Row; limits: CiEquipmentLimits | null };
        saved = { ...result.product, limits: result.limits ?? undefined };
      }
      setRows(current => [...current.filter(row => row.id !== saved.id), saved].sort((a,b) => a.model.localeCompare(b.model)));
      afterPersist?.();
      await onActivity?.({entityType: kind === 'pcs' ? 'ci_pcs' : kind === 'batteries' ? 'ci_battery' : 'ci_accessory',action: before ? 'update' : 'create',targetId:saved.id,targetLabel:saved.model,beforeData:before ?? null,afterData:saved});
    } catch (cause) {setError(cause instanceof Error ? cause.message : 'Não foi possível salvar o produto C&I.');}
    finally {setSaving(false);}
  }
  // Product removal is intentionally blocked by foreign keys when a documented rule uses it.
  async function remove(id: string) {
    setError(null);
    const {error} = kind === 'accessories'
      ? await createClient().from(table).delete().eq('id',id)
      : await createClient().rpc('delete_ci_equipment', { p_kind: kind, p_id: id });
    if (error) setError(error.message); else setRows(current => current.filter(row => row.id !== id));
  }
  const upload: Upload = (_table,model,kind,file) => uploadAsset(table,model,kind,file);
  const additionalFields = kind === 'accessories' ? undefined : <CiEquipmentLimitsFields kind={kind} value={form.limits ?? {}} onChange={limits => setForm({ ...form, limits })} />;
  const additionalBadges = (row: { id: string }) => {
    const limits = rows.find(item => item.id === row.id)?.limits;
    const required = kind === 'pcs'
      ? ['charge_power_kw', 'discharge_power_kw', 'port_charge_current_a', 'port_discharge_current_a'] as const
      : ['charge_power_kw', 'discharge_power_kw', 'charge_current_a', 'discharge_current_a'] as const;
    if (!limits || required.some(key => !Number.isFinite(limits[key]) || Number(limits[key]) <= 0)) return ['Limites pendentes'];
    return [limits.active ? 'Ativo' : 'Inativo'];
  };
  const common = {onSave:(afterPersist?:()=>void) => {void save(afterPersist);},onRemove:(id:string)=>{void remove(id);},removingIds:new Set<string>(),uploadAsset:upload,saving,error};
  if (loading) return <p role="status">Carregando catálogo C&I…</p>;
  return <div className="space-y-4"><p className="text-sm text-muted-foreground">Catálogo exclusivo C&I. Preços definidos nas categorias C&I do Portfólio.</p>{error && <div role="alert" className="text-sm text-destructive">{error}<Button variant="ghost" onClick={()=>{setLoading(true);setAttempt(value=>value+1);}}>Recarregar</Button></div>}
    {kind === 'pcs' ? <InvertersEditor ciBatteryPorts additionalFields={additionalFields} additionalBadges={additionalBadges} {...common} rows={rows as InverterRow[]} form={form as Partial<InverterRow>} setForm={setForm} essRows={[]} onViewEssRules={onViewRules}/>
      : kind === 'batteries' ? <BatteriesEditor additionalFields={additionalFields} additionalBadges={additionalBadges} {...common} rows={rows as BatteryRow[]} form={form as Partial<BatteryRow>} setForm={setForm}/>
      : <AccessoriesEditor {...common} rows={rows as AccessoryRow[]} form={form as Partial<AccessoryRow>} setForm={setForm} rules={[]} onViewRules={onViewRules}/>}
  </div>;
}
