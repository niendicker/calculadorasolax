'use client';

import { useMemo, useState } from 'react';
import { Boxes, Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { DESIRED_FEATURE_DEFINITIONS } from '@/lib/desired-features';
import { cn } from '@/lib/utils';
import {
  accessoryRuleDesiredFeatures,
  accessoryRuleInverterModels,
  formatTriggerMetric,
  selectClasses,
  textareaClasses,
  toNumber,
} from '../helpers';
import {
  Actions,
  CatalogLayout,
  EditorModal,
  Field,
  InfoLabel,
  InlineOptionTabs,
  MediaSummary,
  NumberWithUnitField,
  ProductMediaFields,
  RecordCardGrid,
  SegmentedTabs,
} from '../shared-ui';
import {
  emptyAccessory,
  emptyRule,
  productEditorTabOptions,
  type AccessoryRow,
  type AccessoryRuleRow,
  type BatteryRow,
  type Inclusion,
  type InverterRow,
  type ProductEditorTab,
  type TriggerMetric,
} from '../types';

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

type AccessoryFormTab = ProductEditorTab | 'rules';

const accessoryEditorTabOptions: { value: AccessoryFormTab; label: string }[] = [
  ...productEditorTabOptions,
  { value: 'rules', label: 'Regras de aplicação' },
];

export function AccessoriesEditor(props: {
  rows: AccessoryRow[];
  form: Partial<AccessoryRow>;
  setForm: (value: Partial<AccessoryRow>) => void;
  onSave: (afterPersist?: () => void) => void;
  onRemove: (id: string) => void;
  removingIds: Set<string>;
  uploadAsset: (
    table: 'inverters' | 'batteries' | 'accessories',
    model: string | undefined,
    kind: 'image' | 'documents',
    file: File
  ) => Promise<string>;
  rules: AccessoryRuleRow[];
  saving: boolean;
  ruleForm: Partial<AccessoryRuleRow>;
  setRuleForm: (value: Partial<AccessoryRuleRow>) => void;
  onSaveRule: (afterPersist?: () => void) => void;
  onRemoveRule: (id: string) => void;
  inverters: InverterRow[];
  batteries: BatteryRow[];
}) {
  const { form, setForm } = props;
  const { ruleForm, setRuleForm } = props;
  const [formOpen, setFormOpen] = useState(false);
  const [activeFormTab, setActiveFormTab] = useState<AccessoryFormTab>('general');
  const [ruleFormOpen, setRuleFormOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<AccessoryCategory>('all');
  const [query, setQuery] = useState('');

  const accessoryRules = useMemo(
    () => (form.id ? props.rules.filter((row) => row.accessory_id === form.id) : []),
    [props.rules, form.id]
  );
  const ruleModalTitle = `${ruleForm.id ? 'Editar regra' : 'Nova regra'}${
    form.model?.trim() ? ` - ${form.model.trim()}` : ''
  }`;

  function openNewRule() {
    setRuleForm({ ...emptyRule, accessory_id: form.id ?? '' });
    setRuleFormOpen(true);
  }

  function openEditRule(row: AccessoryRuleRow) {
    setRuleForm(row);
    setRuleFormOpen(true);
  }

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

  function openNew() {
    setForm(emptyAccessory);
    setActiveFormTab('general');
    setRuleFormOpen(false);
    setFormOpen(true);
  }

  function openEdit(row: AccessoryRow) {
    setForm(row);
    setActiveFormTab('general');
    setRuleFormOpen(false);
    setFormOpen(true);
  }

  return (
    <CatalogLayout
      title="Acessórios"
      count={visibleRows.length}
      formOpen={formOpen}
      formTitle={form.id ? 'Editar acessório' : 'Novo acessório'}
      newLabel="Novo acessório"
      expandForm={activeFormTab === 'rules'}
      onNew={openNew}
      onClose={() => {
        setFormOpen(false);
        setRuleFormOpen(false);
      }}
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
          <Field label="Modelo">
            <Input value={form.model ?? ''} onChange={(event) => setForm({ ...form, model: event.target.value })} />
          </Field>
          <Field
            label={
              <InfoLabel
                label="Apelido"
                tip="Nome amigável opcional, mostrado ao usuário no lugar do modelo técnico."
              />
            }
          >
            <Input
              value={form.nickname ?? ''}
              onChange={(event) => setForm({ ...form, nickname: event.target.value })}
              placeholder="Ex.: Kit de Fixação"
            />
          </Field>
          <InlineOptionTabs options={accessoryEditorTabOptions} value={activeFormTab} onChange={setActiveFormTab} />
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
            </>
          ) : activeFormTab === 'rules' ? (
            <div className="space-y-4">
              {!form.id ? (
                <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
                  Salve o acessório antes de cadastrar regras de aplicação.
                </p>
              ) : (
                <>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">Regras de aplicação</p>
                      <p className="text-xs text-muted-foreground">
                        {accessoryRules.length} regra{accessoryRules.length === 1 ? '' : 's'} cadastrada
                        {accessoryRules.length === 1 ? '' : 's'} para este acessório.
                      </p>
                    </div>
                    <Button type="button" size="sm" onClick={openNewRule}>
                      <Plus className="h-4 w-4" />
                      Nova regra
                    </Button>
                  </div>

                  {accessoryRules.length === 0 ? (
                    <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
                      Nenhuma regra de aplicação cadastrada ainda para este acessório.
                    </p>
                  ) : (
                    <RecordCardGrid
                      className="mt-3 md:grid-cols-1 2xl:grid-cols-1"
                      items={accessoryRules.map((row) => ({
                        id: row.id,
                        title: row.name,
                        badges: [row.inclusion === 'required' ? 'obrigatório' : 'opcional', row.active ? 'ativa' : 'inativa'],
                        details: [
                          ['Condição', row.trigger_metric === 'per_solution' ? 'Por solução' : `${formatTriggerMetric(row.trigger_metric)} >= ${row.min_quantity}`],
                          ['Quantidade', String(row.quantity_per_match), true],
                          ['Inversores', accessoryRuleInverterModels(row).length > 0 ? accessoryRuleInverterModels(row) : ['Qualquer'], true],
                        ],
                        description: row.comment ?? undefined,
                        removing: props.removingIds.has(row.id),
                        onEdit: () => openEditRule(row),
                        onRemove: () => props.onRemoveRule(row.id),
                        removeDescription: `A regra "${row.name}" será removida e não será mais aplicada às combinações.`,
                      }))}
                    />
                  )}
                </>
              )}

              <EditorModal
                open={ruleFormOpen}
                title={ruleModalTitle}
                onClose={() => setRuleFormOpen(false)}
              >
                <Field label="Nome da regra">
                  <Input value={ruleForm.name ?? ''} onChange={(event) => setRuleForm({ ...ruleForm, name: event.target.value })} />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Inclusão">
                    <select
                      className={selectClasses()}
                      value={ruleForm.inclusion ?? 'required'}
                      onChange={(event) => setRuleForm({ ...ruleForm, inclusion: event.target.value as Inclusion })}
                    >
                      <option value="required">Obrigatório</option>
                      <option value="optional">Opcional</option>
                    </select>
                  </Field>
                  <NumberWithUnitField
                    label="Quantidade do acessório"
                    tip="Quantidade adicionada quando a regra for aplicada."
                    icon={<Boxes className="h-4 w-4" />}
                    unit="un."
                    value={ruleForm.quantity_per_match ?? 1}
                    onChange={(event) => setRuleForm({ ...ruleForm, quantity_per_match: toNumber(event.target.value, 1) })}
                  />
                  <Field label="Limiar baseado em">
                    <select
                      className={selectClasses()}
                      value={ruleForm.trigger_metric ?? 'battery_quantity'}
                      onChange={(event) => {
                        const trigger_metric = event.target.value as TriggerMetric;
                        setRuleForm({
                          ...ruleForm,
                          trigger_metric,
                          min_quantity: trigger_metric === 'per_solution' ? 1 : ruleForm.min_quantity,
                        });
                      }}
                    >
                      <option value="per_solution">Por solução</option>
                      <option value="inverter_quantity">Qtd. inversores</option>
                      <option value="battery_quantity">Qtd. baterias</option>
                      <option value="battery_ports_used">Portas de bateria</option>
                    </select>
                  </Field>
                  <NumberWithUnitField
                    label="Quantidade mínima"
                    tip="Valor mínimo do critério escolhido para ativar a regra."
                    icon={<Search className="h-4 w-4" />}
                    unit="un."
                    value={ruleForm.min_quantity ?? 1}
                    disabled={ruleForm.trigger_metric === 'per_solution'}
                    onChange={(event) => setRuleForm({ ...ruleForm, min_quantity: toNumber(event.target.value, 1) })}
                  />
                </div>

                <Separator />
                <p className="text-sm text-muted-foreground">Filtros vazios valem para qualquer combinação.</p>
                <Field asDiv label="Inversor">
                  <InverterModelsInput
                    inverters={props.inverters}
                    value={ruleForm}
                    onChange={(inverter_models) =>
                      setRuleForm({
                        ...ruleForm,
                        inverter_models,
                        inverter_model: inverter_models[0] ?? null,
                      })
                    }
                  />
                </Field>
                <Field label="Bateria">
                  <select
                    className={selectClasses()}
                    value={ruleForm.battery_model ?? ''}
                    onChange={(event) => setRuleForm({ ...ruleForm, battery_model: event.target.value || null })}
                  >
                    <option value="">Qualquer</option>
                    {props.batteries.map((battery) => (
                      <option key={battery.id} value={battery.model}>
                        {battery.model}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field
                  asDiv
                  label={
                    <InfoLabel
                      label="Funcionalidade desejada"
                      tip="Se marcar uma ou mais, a regra só se aplica quando o cliente habilitar pelo menos uma delas na aba Funcionalidades. Avaliado apenas no cálculo em tempo real — não entra na geração em massa de soluções."
                    />
                  }
                >
                  <DesiredFeaturesInput
                    value={ruleForm}
                    onChange={(desired_features) => setRuleForm({ ...ruleForm, desired_features })}
                  />
                </Field>

                <Field label="Comentário automático">
                  <textarea
                    className={textareaClasses()}
                    value={ruleForm.comment ?? ''}
                    onChange={(event) => setRuleForm({ ...ruleForm, comment: event.target.value })}
                  />
                </Field>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={ruleForm.active ?? true}
                    onChange={(event) => setRuleForm({ ...ruleForm, active: event.target.checked })}
                  />
                  Ativa
                </label>
                <Actions onSave={() => props.onSaveRule(() => setRuleFormOpen(false))} saving={props.saving} />
              </EditorModal>
            </div>
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
          {activeFormTab !== 'rules' && (
            <Actions onSave={() => props.onSave(() => setFormOpen(false))} saving={props.saving} />
          )}
        </>
      }
      items={visibleRows.map((row) => ({
        id: row.id,
        title: row.model,
        badges: [row.active ? 'ativo' : 'inativo'],
        description: row.description ?? undefined,
        details: [],
        media: <MediaSummary imageUrl={row.image_url} documents={row.documents} />,
        removing: props.removingIds.has(row.id),
        onEdit: () => openEdit(row),
        onRemove: () => props.onRemove(row.id),
        removeDescription: `O acessório ${row.model} será removido do cadastro e das regras que o referenciam.`,
      }))}
    />
  );
}

function InverterModelsInput({
  inverters,
  value,
  onChange,
}: {
  inverters: InverterRow[];
  value: Partial<AccessoryRuleRow>;
  onChange: (models: string[]) => void;
}) {
  const selected = accessoryRuleInverterModels(value);

  function toggle(model: string) {
    if (selected.includes(model)) {
      onChange(selected.filter((item) => item !== model));
      return;
    }
    onChange([...selected, model]);
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {inverters.map((inverter) => {
          const active = selected.includes(inverter.model);
          return (
            <button
              key={inverter.id}
              type="button"
              aria-pressed={active}
              className={cn(
                'inline-flex max-w-full items-center rounded-full border px-3 py-1.5 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                active
                  ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                  : 'border-input bg-background text-muted-foreground hover:border-primary/50 hover:bg-muted/60 hover:text-foreground'
              )}
              onClick={() => toggle(inverter.model)}
            >
              <span className="truncate">{inverter.model}</span>
            </button>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        {selected.length === 0 ? 'Qualquer inversor.' : `${selected.length} inversor(es) selecionado(s).`}
      </p>
    </div>
  );
}

function DesiredFeaturesInput({
  value,
  onChange,
}: {
  value: Partial<AccessoryRuleRow>;
  onChange: (features: string[]) => void;
}) {
  const selected = accessoryRuleDesiredFeatures(value);

  function toggle(featureId: string) {
    if (selected.includes(featureId)) {
      onChange(selected.filter((item) => item !== featureId));
      return;
    }
    onChange([...selected, featureId]);
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {DESIRED_FEATURE_DEFINITIONS.map((feature) => {
          const active = selected.includes(feature.id);
          return (
            <button
              key={feature.id}
              type="button"
              aria-pressed={active}
              className={cn(
                'inline-flex max-w-full items-center rounded-full border px-3 py-1.5 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                active
                  ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                  : 'border-input bg-background text-muted-foreground hover:border-primary/50 hover:bg-muted/60 hover:text-foreground'
              )}
              onClick={() => toggle(feature.id)}
            >
              <span className="truncate">{feature.label}</span>
            </button>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        {selected.length === 0 ? 'Qualquer funcionalidade.' : `${selected.length} funcionalidade(s) selecionada(s).`}
      </p>
    </div>
  );
}
