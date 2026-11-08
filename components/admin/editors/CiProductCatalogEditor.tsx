'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { buildCiInverterPayload, buildBatteryPayload, buildAccessoryPayload } from '../save-payloads';
import { InvertersEditor } from './InvertersEditor';
import { BatteriesEditor } from './BatteriesEditor';
import { AccessoriesEditor } from './AccessoriesEditor';
import { emptyInverter, emptyBattery, emptyAccessory, type InverterRow, type BatteryRow, type AccessoryRow } from '../types';
import type { CiModularActivity } from './CiModularCatalogEditor';

type Kind = 'pcs' | 'batteries' | 'accessories';
type Row = InverterRow | BatteryRow | AccessoryRow;
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
    createClient().from(table).select('*').order('model').then(({data,error}) => { if (!alive) return; if (error) setError(error.message); else setRows((data ?? []) as unknown as Row[]); setLoading(false); });
    return () => { alive = false; };
  }, [table, attempt]);
  async function save(afterPersist?: () => void) {
    if (!form.model?.trim()) { setError('Informe o modelo.'); return; }
    setSaving(true); setError(null);
    try {
      const before = rows.find(row => row.id === form.id);
      // Price lists are keyed by model. Keep established identities stable.
      if (before && before.model !== form.model.trim()) throw new Error('Para preservar preços e histórico, mantenha o modelo cadastrado. Use o apelido para alterar o nome exibido.');
      const fields = kind === 'pcs' ? buildCiInverterPayload(form as Partial<InverterRow>) : kind === 'batteries' ? buildBatteryPayload(form as Partial<BatteryRow>) : buildAccessoryPayload(form as Partial<AccessoryRow>);
      const payload = {...fields,...(form.id ? {id:form.id} : {})};
      const {data,error} = await createClient().from(table).upsert(payload as never).select('*').single();
      if (error) throw new Error(error.message);
      setRows(current => [...current.filter(row => row.id !== data.id), data as unknown as Row].sort((a,b) => a.model.localeCompare(b.model)));
      afterPersist?.();
      await onActivity?.({entityType: kind === 'pcs' ? 'ci_pcs' : kind === 'batteries' ? 'ci_battery' : 'ci_accessory',action: before ? 'update' : 'create',targetId:data.id,targetLabel:data.model,beforeData:before ?? null,afterData:data});
    } catch (cause) {setError(cause instanceof Error ? cause.message : 'Não foi possível salvar o produto C&I.');}
    finally {setSaving(false);}
  }
  // Product removal is intentionally blocked by foreign keys when a documented rule uses it.
  async function remove(id: string) {
    setError(null);
    const {error} = await createClient().from(table).delete().eq('id',id);
    if (error) setError(error.message); else setRows(current => current.filter(row => row.id !== id));
  }
  const upload: Upload = (_table,model,kind,file) => uploadAsset(table,model,kind,file);
  const common = {onSave:(afterPersist?:()=>void) => {void save(afterPersist);},onRemove:(id:string)=>{void remove(id);},removingIds:new Set<string>(),uploadAsset:upload,saving,error};
  if (loading) return <p role="status">Carregando catálogo C&I…</p>;
  return <div className="space-y-4"><p className="text-sm text-muted-foreground">Catálogo exclusivo C&I. Preços definidos nas categorias C&I do Portfólio.</p>{error && <div role="alert" className="text-sm text-destructive">{error}<Button variant="ghost" onClick={()=>{setLoading(true);setAttempt(value=>value+1);}}>Recarregar</Button></div>}
    {kind === 'pcs' ? <InvertersEditor ciBatteryPorts {...common} rows={rows as InverterRow[]} form={form as Partial<InverterRow>} setForm={setForm} essRows={[]} onViewEssRules={onViewRules}/>
      : kind === 'batteries' ? <BatteriesEditor {...common} rows={rows as BatteryRow[]} form={form as Partial<BatteryRow>} setForm={setForm}/>
      : <AccessoriesEditor {...common} rows={rows as AccessoryRow[]} form={form as Partial<AccessoryRow>} setForm={setForm} rules={[]} onViewRules={onViewRules}/>}
  </div>;
}
