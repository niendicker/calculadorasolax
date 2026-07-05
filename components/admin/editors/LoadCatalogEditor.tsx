'use client';

import { useMemo, useState } from 'react';
import { Activity, Search, Zap } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { toNumber } from '../helpers';
import { Actions, CatalogLayout, Field, InfoLabel, NumberWithUnitField, SegmentedTabs } from '../shared-ui';
import { emptyLoadCatalogItem, type LoadCatalogRow } from '../types';

export function LoadCatalogEditor(props: {
  rows: LoadCatalogRow[];
  form: Partial<LoadCatalogRow>;
  setForm: (value: Partial<LoadCatalogRow>) => void;
  onSave: (afterPersist?: () => void) => void;
  onRemove: (id: string) => void;
  onDeactivate: (id: string) => void;
  removingIds: Set<string>;
  saving: boolean;
}) {
  const { form, setForm } = props;
  const [formOpen, setFormOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [query, setQuery] = useState('');

  const categoryOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of props.rows) {
      counts.set(row.category, (counts.get(row.category) ?? 0) + 1);
    }
    return [
      { value: 'all', label: 'Todas', count: props.rows.length },
      ...Array.from(counts.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([category, count]) => ({ value: category, label: category, count })),
    ];
  }, [props.rows]);

  const existingCategories = useMemo(
    () => Array.from(new Set(props.rows.map((row) => row.category))).sort((a, b) => a.localeCompare(b)),
    [props.rows]
  );

  const visibleRows = useMemo(() => {
    const byCategory =
      selectedCategory === 'all' ? props.rows : props.rows.filter((row) => row.category === selectedCategory);
    const q = query.trim().toLowerCase();
    if (!q) return byCategory;
    return byCategory.filter((row) =>
      [row.name_pt, row.name_en, row.name_zh].some((name) => name.toLowerCase().includes(q))
    );
  }, [props.rows, selectedCategory, query]);

  function openNew() {
    setForm(emptyLoadCatalogItem);
    setFormOpen(true);
  }

  function openEdit(row: LoadCatalogRow) {
    setForm(row);
    setFormOpen(true);
  }

  return (
    <CatalogLayout
      title="Cargas"
      count={visibleRows.length}
      formOpen={formOpen}
      formTitle={form.id ? 'Editar carga' : 'Nova carga'}
      newLabel="Nova carga"
      onNew={openNew}
      onClose={() => setFormOpen(false)}
      search={
        <label className="relative block sm:w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Buscar carga por nome"
            className="pl-8 md:pl-8"
            placeholder="Buscar por nome..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      }
      filter={
        categoryOptions.length > 2 ? (
          <div className="rounded-lg border bg-card p-3">
            <SegmentedTabs
              label="Categoria"
              value={selectedCategory}
              options={categoryOptions}
              onChange={setSelectedCategory}
            />
          </div>
        ) : undefined
      }
      form={
        <>
          <Field label="Nome (PT)">
            <Input
              value={form.name_pt ?? ''}
              onChange={(event) => setForm({ ...form, name_pt: event.target.value })}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={<InfoLabel label="Nome (EN)" tip="Se vazio, usa o nome em português como padrão." />}>
              <Input
                value={form.name_en ?? ''}
                onChange={(event) => setForm({ ...form, name_en: event.target.value })}
              />
            </Field>
            <Field label={<InfoLabel label="Nome (ZH)" tip="Se vazio, usa o nome em português como padrão." />}>
              <Input
                value={form.name_zh ?? ''}
                onChange={(event) => setForm({ ...form, name_zh: event.target.value })}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <NumberWithUnitField
              label="Potência"
              tip="Potência aparente nominal do equipamento."
              icon={<Zap className="h-4 w-4" />}
              unit="VA"
              value={form.power_w ?? 0}
              onChange={(event) => setForm({ ...form, power_w: toNumber(event.target.value) })}
            />
            <NumberWithUnitField
              label="IP/IN"
              tip="Relação entre a potência aparente de partida (pico) e a nominal. Motores/compressores costumam usar 2-3; cargas resistivas/eletrônicas usam 1."
              icon={<Activity className="h-4 w-4" />}
              unit="×"
              min={1}
              step={0.1}
              value={form.ip_in_ratio ?? 1}
              onChange={(event) => setForm({ ...form, ip_in_ratio: toNumber(event.target.value, 1) })}
            />
          </div>
          <Field label="Categoria">
            <Input
              list="load-catalog-categories"
              value={form.category ?? ''}
              onChange={(event) => setForm({ ...form, category: event.target.value })}
              placeholder="Ex.: Climatização, Refrigeração..."
            />
            <datalist id="load-catalog-categories">
              {existingCategories.map((category) => (
                <option key={category} value={category} />
              ))}
            </datalist>
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.active ?? true}
              onChange={(event) => setForm({ ...form, active: event.target.checked })}
            />
            Ativa
          </label>
          <Actions onSave={() => props.onSave(() => setFormOpen(false))} saving={props.saving} />
        </>
      }
      items={visibleRows.map((row) => ({
        id: row.id,
        title: row.name_pt,
        badges: [row.category, row.active ? 'ativa' : 'inativa'],
        details: [
          ['Potência', `${row.power_w} VA`],
          ['IP/IN', `${row.ip_in_ratio}×`],
        ],
        removing: props.removingIds.has(row.id),
        onEdit: () => openEdit(row),
        onRemove: () => props.onRemove(row.id),
        removeDescription: `A carga "${row.name_pt}" será removida do catálogo.`,
        onDeactivate: row.active ? () => props.onDeactivate(row.id) : undefined,
        deactivateDescription: `A carga "${row.name_pt}" fica inativa e para de aparecer para os usuários, sem ser removida do cadastro.`,
      }))}
    />
  );
}
