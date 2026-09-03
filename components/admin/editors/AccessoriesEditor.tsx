'use client';

import { useMemo, useState } from 'react';
import { ListChecks, Search, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { accessoryRuleInverterModels, textareaClasses, toNumber } from '../helpers';
import { useCatalogEditorForm } from '../hooks/useCatalogEditorForm';
import { Actions, CatalogLayout, Field, InlineOptionTabs, MediaSummary, ModelNicknameFields, NumberWithUnitField, ProductMediaFields, SegmentedTabs } from '../shared-ui';
import { emptyAccessory, productEditorTabOptions, type AccessoryRow, type AccessoryRuleRow } from '../types';

type AccessoryCategory = 'all' | 'system' | 'inverter' | 'battery';

export function accessoryCategories(accessoryId: string, rules: AccessoryRuleRow[]): Set<'system' | 'inverter' | 'battery'> {
  const cats = new Set<'system' | 'inverter' | 'battery'>();
  const matched = rules.filter((r) => r.accessory_id === accessoryId);
  if (matched.length === 0) { cats.add('system'); return cats; }
  for (const rule of matched) {
    const hasInverter = accessoryRuleInverterModels(rule).length > 0;
    const hasBattery = !!rule.battery_model;
    if (hasInverter) cats.add('inverter');
    if (hasBattery) cats.add('battery');
    if (!hasInverter && !hasBattery) cats.add('system');
  }
  return cats;
}

export function AccessoriesEditor(props: {
  rows: AccessoryRow[];
  form: Partial<AccessoryRow>;
  setForm: (value: Partial<AccessoryRow>) => void;
  onSave: (afterPersist?: () => void) => void;
  onRemove: (id: string) => void;
  removingIds: Set<string>;
  uploadAsset: (
    table: 'inverters' | 'batteries' | 'accessories' | 'ci_bess_products',
    model: string | undefined,
    kind: 'image' | 'documents',
    file: File
  ) => Promise<string>;
  rules: AccessoryRuleRow[];
  saving: boolean;
  onViewRules: (accessoryId: string, accessoryModel: string) => void;
}) {
  const { form, setForm } = props;
  const { formOpen, activeFormTab, setActiveFormTab, openNew, openEdit, close } = useCatalogEditorForm<AccessoryRow>(
    emptyAccessory,
    setForm
  );
  const [selectedCategory, setSelectedCategory] = useState<AccessoryCategory>('all');
  const [query, setQuery] = useState('');

  const accessoryRuleCount = useMemo(
    () => (form.id ? props.rules.filter((row) => row.accessory_id === form.id).length : 0),
    [props.rules, form.id]
  );

  const categoryOptions = useMemo(() => {
    const counts = { system: 0, inverter: 0, battery: 0 };
    for (const row of props.rows) {
      const cats = accessoryCategories(row.id, props.rules);
      if (cats.has('system')) counts.system++;
      if (cats.has('inverter')) counts.inverter++;
      if (cats.has('battery')) counts.battery++;
    }
    return [
      { value: 'all', label: 'Todos', count: props.rows.length },
      ...(counts.system > 0 ? [{ value: 'system', label: 'Sistema', count: counts.system }] : []),
      ...(counts.inverter > 0 ? [{ value: 'inverter', label: 'Por inversor', count: counts.inverter }] : []),
      ...(counts.battery > 0 ? [{ value: 'battery', label: 'Por bateria', count: counts.battery }] : []),
    ] as { value: string; label: string; count: number }[];
  }, [props.rows, props.rules]);

  const visibleRows = useMemo(() => {
    const byCategory =
      selectedCategory === 'all'
        ? props.rows
        : props.rows.filter((row) => accessoryCategories(row.id, props.rules).has(selectedCategory as 'system' | 'inverter' | 'battery'));
    const q = query.trim().toLowerCase();
    if (!q) return byCategory;
    return byCategory.filter((row) => row.model.toLowerCase().includes(q));
  }, [props.rows, props.rules, selectedCategory, query]);

  return (
    <CatalogLayout
      title="Acessórios"
      count={visibleRows.length}
      formOpen={formOpen}
      formTitle={form.id ? 'Editar acessório' : 'Novo acessório'}
      newLabel="Novo acessório"
      onNew={openNew}
      onClose={close}
      search={
        <label className="relative block sm:w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Buscar acessório por modelo"
            className="pl-8 md:pl-8"
            placeholder="Buscar por modelo..."
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
              onChange={(value) => setSelectedCategory(value as AccessoryCategory)}
            />
          </div>
        ) : undefined
      }
      form={
        <>
          <ModelNicknameFields
            form={form}
            setForm={setForm}
            nicknameTip="Nome amigável opcional, mostrado ao usuário no lugar do modelo técnico."
            nicknamePlaceholder="Ex.: Kit de Fixação"
          />
          <InlineOptionTabs options={productEditorTabOptions} value={activeFormTab} onChange={setActiveFormTab} />
          {activeFormTab === 'general' ? (
            <>
              <Field label="Descrição">
                <textarea
                  className={textareaClasses()}
                  value={form.description ?? ''}
                  onChange={(event) => setForm({ ...form, description: event.target.value })}
                />
              </Field>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.active ?? true}
                  onChange={(event) => setForm({ ...form, active: event.target.checked })}
                />
                Ativo
              </label>
              <NumberWithUnitField
                label="Garantia"
                tip="Duração da garantia de fábrica do acessório."
                icon={<ShieldCheck className="h-4 w-4" />}
                unit="anos"
                value={form.warranty_years ?? 2}
                onChange={(event) => setForm({ ...form, warranty_years: Math.max(1, toNumber(event.target.value, 2)) })}
              />
              {form.id && (
                <Button type="button" variant="outline" size="sm" onClick={() => props.onViewRules(form.id!, form.model ?? '')}>
                  <ListChecks className="h-4 w-4" />
                  Ver regras de aplicação{accessoryRuleCount > 0 ? ` (${accessoryRuleCount})` : ''}
                </Button>
              )}
            </>
          ) : (
            <ProductMediaFields
              table="accessories"
              model={form.model}
              imageUrl={form.image_url}
              documents={form.documents}
              setImageUrl={(image_url) => setForm({ ...form, image_url })}
              setDocuments={(documents) => setForm({ ...form, documents })}
              uploadAsset={props.uploadAsset}
            />
          )}
          <Actions onSave={() => props.onSave(close)} saving={props.saving} />
        </>
      }
      items={visibleRows.map((row) => ({
        id: row.id,
        title: row.model,
        badges: [row.active ? 'ativo' : 'inativo'],
        description: row.description ?? undefined,
        details: [['Garantia', `${row.warranty_years ?? 2} anos`]],
        media: <MediaSummary imageUrl={row.image_url} documents={row.documents} />,
        removing: props.removingIds.has(row.id),
        onEdit: () => openEdit(row),
        onRemove: () => props.onRemove(row.id),
        removeDescription: `O acessório ${row.model} será removido do cadastro e das regras que o referenciam.`,
      }))}
    />
  );
}
