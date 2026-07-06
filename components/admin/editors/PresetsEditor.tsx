'use client';

import { useMemo, useState } from 'react';
import { Search, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { toNumber } from '../helpers';
import { Actions, CatalogLayout, Field, NumberWithUnitField } from '../shared-ui';
import { emptyPreset, type LoadCatalogRow, type PresetLoad, type PresetRow } from '../types';

export function PresetsEditor(props: {
  rows: PresetRow[];
  loadCatalogItems: LoadCatalogRow[];
  form: Partial<PresetRow>;
  setForm: (value: Partial<PresetRow>) => void;
  onSave: (afterPersist?: () => void) => void;
  onRemove: (id: string) => void;
  removingIds: Set<string>;
  saving: boolean;
}) {
  const { form, setForm } = props;
  const [formOpen, setFormOpen] = useState(false);
  const [catalogQuery, setCatalogQuery] = useState('');

  const loads = useMemo(() => form.loads ?? [], [form.loads]);

  const filteredCatalog = useMemo(() => {
    const q = catalogQuery.trim().toLowerCase();
    if (!q) return props.loadCatalogItems;
    return props.loadCatalogItems.filter((item) => item.name_pt.toLowerCase().includes(q));
  }, [props.loadCatalogItems, catalogQuery]);

  function openNew() {
    setForm(emptyPreset);
    setFormOpen(true);
  }

  function openEdit(row: PresetRow) {
    setForm(row);
    setFormOpen(true);
  }

  function updateLoad(index: number, partial: Partial<PresetLoad>) {
    setForm({ ...form, loads: loads.map((load, i) => (i === index ? { ...load, ...partial } : load)) });
  }

  function removeLoad(index: number) {
    setForm({ ...form, loads: loads.filter((_, i) => i !== index) });
  }

  function addFromCatalog(item: LoadCatalogRow) {
    const newLoad: PresetLoad = {
      name: item.name_pt,
      powerW: item.power_w,
      hoursPerDay: 4,
      qty: 1,
      ipInRatio: item.ip_in_ratio ?? 1,
    };
    setForm({ ...form, loads: [...loads, newLoad] });
  }

  return (
    <CatalogLayout
      title="Presets de cargas"
      count={props.rows.length}
      formOpen={formOpen}
      formTitle={form.id ? `Editar "${form.name ?? ''}"` : 'Novo preset'}
      newLabel="Novo preset"
      onNew={openNew}
      onClose={() => setFormOpen(false)}
      expandForm
      form={
        <>
          <Field label="Nome">
            <Input value={form.name ?? ''} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          </Field>
          <Field label="Descrição">
            <textarea
              className="min-h-20 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              value={form.description ?? ''}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
            />
          </Field>

          <div className="space-y-2">
            <p className="text-sm font-medium">Cargas do preset ({loads.length})</p>
            {loads.length === 0 ? (
              <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
                Nenhuma carga adicionada ainda. Use a busca abaixo para adicionar do catálogo.
              </p>
            ) : (
              <div className="space-y-2">
                {loads.map((load, index) => (
                  <div key={`${load.name}-${index}`} className="rounded-lg border bg-card p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-medium">{load.name}</p>
                      <button
                        type="button"
                        aria-label={`Remover ${load.name}`}
                        onClick={() => removeLoad(index)}
                        className="shrink-0 text-muted-foreground transition-colors hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <NumberWithUnitField
                        label="Potência"
                        tip="Potência aparente nominal."
                        unit="VA"
                        value={load.powerW}
                        onChange={(event) => updateLoad(index, { powerW: toNumber(event.target.value) })}
                      />
                      <NumberWithUnitField
                        label="Horas/dia"
                        tip="Horas de uso por dia, usado para estimar o consumo diário."
                        unit="h"
                        step={0.5}
                        value={load.hoursPerDay}
                        onChange={(event) => updateLoad(index, { hoursPerDay: toNumber(event.target.value) })}
                      />
                      <NumberWithUnitField
                        label="Qtd"
                        tip="Quantidade de unidades desta carga."
                        unit="×"
                        min={1}
                        value={load.qty}
                        onChange={(event) => updateLoad(index, { qty: toNumber(event.target.value, 1) })}
                      />
                      <NumberWithUnitField
                        label="IP/IN"
                        tip="Relação entre a potência de partida (pico) e a nominal."
                        unit="×"
                        min={1}
                        step={0.1}
                        value={load.ipInRatio}
                        onChange={(event) => updateLoad(index, { ipInRatio: toNumber(event.target.value, 1) })}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Adicionar do catálogo</p>
            <label className="relative block">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                aria-label="Buscar carga no catálogo"
                className="pl-8"
                placeholder="Buscar por nome..."
                value={catalogQuery}
                onChange={(event) => setCatalogQuery(event.target.value)}
              />
            </label>
            <div className="grid max-h-52 grid-cols-1 gap-1.5 overflow-y-auto sm:grid-cols-2">
              {filteredCatalog.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => addFromCatalog(item)}
                  className="flex items-center justify-between gap-2 rounded-md border bg-card px-2 py-1.5 text-left text-sm transition-colors hover:border-primary/50 hover:bg-primary/10"
                >
                  <span className="truncate">{item.name_pt}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{item.power_w}VA</span>
                </button>
              ))}
            </div>
          </div>

          <Actions onSave={() => props.onSave(() => setFormOpen(false))} saving={props.saving} />
        </>
      }
      items={props.rows.map((row) => ({
        id: row.id,
        title: row.name,
        description: row.description,
        badges: [`${row.loads.length} carga${row.loads.length === 1 ? '' : 's'}`],
        details: [],
        removing: props.removingIds.has(row.id),
        onEdit: () => openEdit(row),
        onRemove: () => props.onRemove(row.id),
        removeDescription: `O preset "${row.name}" será removido e deixará de aparecer para os usuários.`,
      }))}
    />
  );
}
