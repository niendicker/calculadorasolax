'use client';

import { useMemo, useState } from 'react';
import { Activity, Cable, Plus, Search, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  batteryAssociationMax,
  clampNumber,
  formatInverterGridType,
  inverterSupportedBatteryTopologies,
  normalizeEssBatteryConfigs,
  normalizeInverterFlags,
  normalizeInverterGridTypes,
  phasesFromInverterGridTypes,
  selectClasses,
  textareaClasses,
  toNullableNumber,
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
  ToggleChipsInput,
} from '../shared-ui';
import {
  emptyEssRule,
  emptyInverter,
  inverterFlagOptions,
  inverterGridTypeOptions,
  productEditorTabOptions,
  type BatteryRow,
  type BatteryTopology,
  type EssBatteryConfig,
  type EssCompatibilityRuleRow,
  type InverterRow,
  type ProductEditorTab,
} from '../types';

type InverterFormTab = ProductEditorTab | 'ess';

const inverterEditorTabOptions: { value: InverterFormTab; label: string }[] = [
  ...productEditorTabOptions,
  { value: 'ess', label: 'Compatibilidade ESS' },
];

export function InvertersEditor(props: {
  rows: InverterRow[];
  form: Partial<InverterRow>;
  setForm: (value: Partial<InverterRow>) => void;
  onSave: (afterPersist?: () => void) => void;
  onRemove: (id: string) => void;
  removingIds: Set<string>;
  uploadAsset: (
    table: 'inverters' | 'batteries' | 'accessories',
    model: string | undefined,
    kind: 'image' | 'documents',
    file: File
  ) => Promise<string>;
  saving: boolean;
  essRows: EssCompatibilityRuleRow[];
  essForm: Partial<EssCompatibilityRuleRow>;
  setEssForm: (value: Partial<EssCompatibilityRuleRow>) => void;
  batteries: BatteryRow[];
  onSaveEss: (afterPersist?: () => void) => void;
  onRemoveEss: (id: string) => void;
}) {
  const { form, setForm } = props;
  const { essForm, setEssForm } = props;
  const [formOpen, setFormOpen] = useState(false);
  const [activeFormTab, setActiveFormTab] = useState<InverterFormTab>('general');
  const [essFormOpen, setEssFormOpen] = useState(false);
  const [selectedPhase, setSelectedPhase] = useState<'all' | '1' | '2' | '3'>('all');
  const [query, setQuery] = useState('');

  const inverterEssRows = useMemo(
    () => (form.model ? props.essRows.filter((row) => row.inverter_model === form.model) : []),
    [props.essRows, form.model]
  );
  const currentGridTypes = normalizeInverterGridTypes(form.grid_types);
  const currentBatteryTopologies = inverterSupportedBatteryTopologies(form as InverterRow | undefined);
  const essModalTitle = `${essForm.id ? 'Editar compatibilidade ESS' : 'Nova compatibilidade ESS'}${
    form.model?.trim() ? ` - ${form.model.trim()}` : ''
  }`;

  function openNewEss() {
    setEssForm({ ...emptyEssRule, inverter_model: form.model ?? '' });
    setEssFormOpen(true);
  }

  function openEditEss(row: EssCompatibilityRuleRow) {
    setEssForm(row);
    setEssFormOpen(true);
  }

  const phaseOptions = useMemo(() => {
    const counts = { '1': 0, '2': 0, '3': 0 };
    for (const row of props.rows) {
      const key = String(row.phases) as '1' | '2' | '3';
      if (key in counts) counts[key]++;
    }
    const labels: Record<string, string> = { '1': 'Monofásico', '2': 'Bifásico', '3': 'Trifásico' };
    return [
      { value: 'all', label: 'Todos', count: props.rows.length },
      ...(['1', '2', '3'] as const)
        .filter((p) => counts[p] > 0)
        .map((p) => ({ value: p, label: labels[p], count: counts[p] })),
    ];
  }, [props.rows]);

  const visibleRows = useMemo(() => {
    const byPhase =
      selectedPhase === 'all' ? props.rows : props.rows.filter((row) => String(row.phases) === selectedPhase);
    const q = query.trim().toLowerCase();
    if (!q) return byPhase;
    return byPhase.filter((row) => row.model.toLowerCase().includes(q));
  }, [props.rows, selectedPhase, query]);

  function openNew() {
    setForm(emptyInverter);
    setActiveFormTab('general');
    setEssFormOpen(false);
    setFormOpen(true);
  }

  function openEdit(row: InverterRow) {
    setForm(row);
    setActiveFormTab('general');
    setEssFormOpen(false);
    setFormOpen(true);
  }

  return (
    <CatalogLayout
      title="Inversores"
      count={visibleRows.length}
      formOpen={formOpen}
      formTitle={form.id ? 'Editar inversor' : 'Novo inversor'}
      newLabel="Novo inversor"
      expandForm={activeFormTab === 'ess'}
      onNew={openNew}
      onClose={() => {
        setFormOpen(false);
        setEssFormOpen(false);
      }}
      search={
        <label className="relative block sm:w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Buscar inversor por modelo"
            className="pl-8 md:pl-8"
            placeholder="Buscar por modelo..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      }
      filter={
        phaseOptions.length > 2 ? (
          <div className="rounded-lg border bg-card p-3">
            <SegmentedTabs
              label="Padrão de rede"
              value={selectedPhase}
              options={phaseOptions}
              onChange={(value) => setSelectedPhase(value as typeof selectedPhase)}
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
                tip="Nome amigável opcional, mostrado ao usuário no lugar do modelo técnico nos cards de inversor."
              />
            }
          >
            <Input
              value={form.nickname ?? ''}
              onChange={(event) => setForm({ ...form, nickname: event.target.value })}
              placeholder="Ex.: Inversor Compacto"
            />
          </Field>
          <InlineOptionTabs options={inverterEditorTabOptions} value={activeFormTab} onChange={setActiveFormTab} />
          {activeFormTab === 'general' ? (
            <>
              <div className="space-y-3 rounded-lg border bg-background p-3">
                <p className="text-sm font-semibold">CA</p>
                <div className="grid grid-cols-2 gap-3">
                  <NumberWithUnitField
                    label="Potência padrão"
                    tip="Potência aparente nominal do inversor."
                    icon={<Zap className="h-4 w-4" />}
                    unit="kVA"
                    value={form.standard_power_kva ?? form.power_kw ?? 0}
                    onChange={(event) => setForm({ ...form, standard_power_kva: toNumber(event.target.value), power_kw: toNumber(event.target.value) })}
                  />
                  <NumberWithUnitField
                    label="Potência pico"
                    tip="Potência aparente máxima de pico do inversor."
                    icon={<Zap className="h-4 w-4" />}
                    unit="kVA"
                    value={form.peak_power_kva ?? 0}
                    onChange={(event) => setForm({ ...form, peak_power_kva: toNumber(event.target.value) })}
                  />
                  <NumberWithUnitField
                    label="Potência máxima por fase"
                    tip="Limite de potência por fase para validação de balanceamento de cargas. Se vazio, o app usa Potência padrão ÷ número de fases da rede."
                    icon={<Zap className="h-4 w-4" />}
                    unit="VA"
                    placeholder="—"
                    value={form.max_power_per_phase_w ?? ''}
                    onChange={(event) => setForm({ ...form, max_power_per_phase_w: toNullableNumber(event.target.value) })}
                    onClear={() => setForm({ ...form, max_power_per_phase_w: null })}
                  />
                </div>
                <Field asDiv label="Tipo de rede">
                  <ToggleChipsInput
                    options={inverterGridTypeOptions}
                    value={normalizeInverterGridTypes(form.grid_types)}
                    onChange={(grid_types) => setForm({ ...form, grid_types, phases: phasesFromInverterGridTypes(grid_types, form.phases) })}
                  />
                </Field>
                <Field asDiv label="Sobredimensionamento FV">
                  <InlineOptionTabs
                    options={[
                      { value: 50 as const, label: '50%' },
                      { value: 100 as const, label: '100%' },
                    ]}
                    value={form.pv_oversizing_percent === 50 ? 50 : 100}
                    onChange={(pv_oversizing_percent) => setForm({ ...form, pv_oversizing_percent })}
                  />
                </Field>
              </div>
              <div className="space-y-3 rounded-lg border bg-background p-3">
                <p className="text-sm font-semibold">Bateria</p>
                <div className="grid grid-cols-2 gap-3">
                  <Field asDiv label="Topologia">
                    <InlineOptionTabs
                      options={[
                        { value: 'HV' as const, label: 'HV' },
                        { value: 'LV' as const, label: 'LV' },
                      ]}
                      value={form.topology === 'LV' ? 'LV' : 'HV'}
                      onChange={(topology) => setForm({ ...form, topology })}
                    />
                  </Field>
                  <Field asDiv label="Portas">
                    <InlineOptionTabs
                      options={[
                        { value: 1, label: '1' },
                        { value: 2, label: '2' },
                      ]}
                      value={form.battery_ports ?? 1}
                      onChange={(battery_ports) => setForm({ ...form, battery_ports })}
                    />
                  </Field>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <NumberWithUnitField
                    label="Tensão mín."
                    tip="Menor tensão de bateria aceita pelo inversor."
                    icon={<Cable className="h-4 w-4" />}
                    unit="V"
                    placeholder="—"
                    value={form.battery_voltage_min_v ?? undefined}
                    onChange={(event) => setForm({ ...form, battery_voltage_min_v: toNullableNumber(event.target.value) })}
                    onClear={() => setForm({ ...form, battery_voltage_min_v: null })}
                  />
                  <NumberWithUnitField
                    label="Tensão máx."
                    tip="Maior tensão de bateria aceita pelo inversor."
                    icon={<Cable className="h-4 w-4" />}
                    unit="V"
                    placeholder="—"
                    value={form.battery_voltage_max_v ?? undefined}
                    onChange={(event) => setForm({ ...form, battery_voltage_max_v: toNullableNumber(event.target.value) })}
                    onClear={() => setForm({ ...form, battery_voltage_max_v: null })}
                  />
                  <NumberWithUnitField
                    label="Corrente máx."
                    tip="Corrente máxima de bateria por porta, suportada pelo inversor."
                    icon={<Activity className="h-4 w-4" />}
                    unit="A"
                    placeholder="—"
                    value={form.battery_current_max_a ?? undefined}
                    onChange={(event) => setForm({ ...form, battery_current_max_a: toNullableNumber(event.target.value) })}
                    onClear={() => setForm({ ...form, battery_current_max_a: null })}
                  />
                </div>
              </div>
              <Field asDiv label="Funcionalidades">
                <ToggleChipsInput
                  options={inverterFlagOptions}
                  value={normalizeInverterFlags(form.flags)}
                  onChange={(flags) => setForm({ ...form, flags })}
                />
              </Field>
            </>
          ) : activeFormTab === 'ess' ? (
            <div className="space-y-4">
              {!form.model?.trim() ? (
                <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
                  Preencha e salve o modelo do inversor antes de cadastrar compatibilidades ESS.
                </p>
              ) : (
                <>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">Compatibilidade com baterias (ESS)</p>
                      <p className="text-xs text-muted-foreground">
                        {inverterEssRows.length} regra{inverterEssRows.length === 1 ? '' : 's'} cadastrada
                        {inverterEssRows.length === 1 ? '' : 's'} para este inversor.
                      </p>
                    </div>
                    <Button type="button" size="sm" onClick={openNewEss}>
                      <Plus className="h-4 w-4" />
                      Nova compatibilidade
                    </Button>
                  </div>

                  {inverterEssRows.length === 0 ? (
                    <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
                      Nenhuma compatibilidade ESS cadastrada ainda para este inversor.
                    </p>
                  ) : (
                    <RecordCardGrid
                      className="mt-3 md:grid-cols-1 2xl:grid-cols-1"
                      items={inverterEssRows.map((row) => {
                        const batteryConfigs = normalizeEssBatteryConfigs(row, props.batteries);
                        const batteryTags = batteryConfigs.map(
                          (config) => `${config.battery_model} (${config.min_battery_qty}–${config.max_battery_qty})`
                        );
                        return {
                          id: row.id,
                          title:
                            row.name?.trim() ||
                            (batteryConfigs.length > 0
                              ? `${batteryConfigs.length} bateria${batteryConfigs.length === 1 ? '' : 's'} compatível${batteryConfigs.length === 1 ? '' : 'is'}`
                              : 'Sem baterias selecionadas'),
                          badges: [
                            row.active ? 'ativa' : 'inativa',
                            ...Array.from(new Set(batteryConfigs.map((config) => config.battery_topology))),
                          ],
                          details: [
                            ['Baterias', batteryTags.length > 0 ? batteryTags : ['—'], true],
                            ['Máx. paralelo', String(row.max_parallel_inverters ?? 1)],
                          ],
                          description: row.comment ?? undefined,
                          removing: props.removingIds.has(row.id),
                          onEdit: () => openEditEss(row),
                          onRemove: () => props.onRemoveEss(row.id),
                          removeDescription:
                            'Essa compatibilidade ESS será removida e as combinações geradas por ela não serão mais atualizadas.',
                        };
                      })}
                    />
                  )}
                </>
              )}

              <EditorModal
                open={essFormOpen}
                title={essModalTitle}
                onClose={() => setEssFormOpen(false)}
              >
                <Field label="Nome da regra">
                  <Input
                    value={essForm.name ?? ''}
                    onChange={(event) => setEssForm({ ...essForm, name: event.target.value })}
                    placeholder="Ex.: Compatibilidade padrão HV"
                  />
                </Field>
                <div className="space-y-3 rounded-lg border bg-background p-3">
                  <p className="text-sm font-semibold">Inversor</p>
                  <div className="grid gap-3 sm:grid-cols-[1fr_160px]">
                    <div className="rounded-lg border bg-muted/40 px-3 py-2 text-sm">
                      <span className="font-medium text-foreground">{form.model}</span>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Redes: {currentGridTypes.map(formatInverterGridType).join(', ') || '—'}
                      </p>
                    </div>
                    <Field label="Máximo paralelo">
                      <select
                        className={selectClasses()}
                        value={essForm.max_parallel_inverters ?? 1}
                        onChange={(event) => setEssForm({ ...essForm, max_parallel_inverters: toNumber(event.target.value, 1) })}
                      >
                        {Array.from({ length: 10 }, (_, index) => index + 1).map((qty) => (
                          <option key={qty} value={qty}>
                            {qty}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>
                </div>

                <div className="space-y-3 rounded-lg border bg-background p-3">
                  <p className="text-sm font-semibold">Bateria</p>
                  <p className="text-xs text-muted-foreground">
                    Topologias compatíveis: {currentBatteryTopologies.join(', ') || '—'}.
                  </p>
                  <EssBatteryConfigsInput
                    batteries={props.batteries}
                    supportedTopologies={currentBatteryTopologies}
                    value={essForm}
                    onChange={(battery_configs) =>
                      setEssForm({
                        ...essForm,
                        battery_configs,
                        battery_model: battery_configs[0]?.battery_model ?? '',
                        battery_topology: battery_configs[0]?.battery_topology ?? null,
                        min_battery_qty: battery_configs[0]?.min_battery_qty ?? 1,
                        max_battery_qty: battery_configs[0]?.max_battery_qty ?? 2,
                      })
                    }
                  />
                </div>

                <Field label="Comentário">
                  <textarea
                    className={textareaClasses()}
                    value={essForm.comment ?? ''}
                    onChange={(event) => setEssForm({ ...essForm, comment: event.target.value })}
                  />
                </Field>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={essForm.active ?? true}
                    onChange={(event) => setEssForm({ ...essForm, active: event.target.checked })}
                  />
                  Ativa
                </label>
                <Actions onSave={() => props.onSaveEss(() => setEssFormOpen(false))} saving={props.saving} />
              </EditorModal>
            </div>
          ) : (
            <ProductMediaFields
              table="inverters"
              model={form.model}
              imageUrl={form.image_url}
              documents={form.documents}
              setImageUrl={(image_url) => setForm({ ...form, image_url })}
              setDocuments={(documents) => setForm({ ...form, documents })}
              uploadAsset={props.uploadAsset}
            />
          )}
          {activeFormTab !== 'ess' && (
            <Actions onSave={() => props.onSave(() => setFormOpen(false))} saving={props.saving} />
          )}
        </>
      }
      items={visibleRows.map((row) => ({
        id: row.id,
        title: row.model,
        badges: [row.topology, `${row.phases} fase${row.phases === 1 ? '' : 's'}`],
        details: [
          ['Potência', `${row.standard_power_kva ?? row.power_kw} / ${row.peak_power_kva ?? '—'} kVA`],
          ['Portas bat.', `${row.battery_ports ?? 1}× · ${row.battery_current_max_a ?? '—'} A`],
          ['Redes', normalizeInverterGridTypes(row.grid_types).map(formatInverterGridType).join(', ') || '—'],
          ['Tensão bat.', `${row.battery_voltage_min_v ?? '—'} – ${row.battery_voltage_max_v ?? '—'} V`],
          ['Sobredim. FV', `${row.pv_oversizing_percent ?? 100}%`],
        ],
        media: <MediaSummary imageUrl={row.image_url} documents={row.documents} />,
        removing: props.removingIds.has(row.id),
        onEdit: () => openEdit(row),
        onRemove: () => props.onRemove(row.id),
        removeDescription: `O inversor ${row.model} e todos os seus dados serão removidos do cadastro.`,
      }))}
    />
  );
}

function EssBatteryConfigsInput({
  batteries,
  supportedTopologies,
  value,
  onChange,
}: {
  batteries: BatteryRow[];
  supportedTopologies: BatteryTopology[];
  value: Partial<EssCompatibilityRuleRow>;
  onChange: (configs: EssBatteryConfig[]) => void;
}) {
  const configs = normalizeEssBatteryConfigs(value, batteries);
  const configByModel = new Map(configs.map((config) => [config.battery_model, config]));
  const availableBatteries = batteries.filter((battery) => supportedTopologies.includes(battery.topology));

  function toggleBattery(battery: BatteryRow) {
    const existing = configByModel.get(battery.model);
    if (existing) {
      onChange(configs.filter((config) => config.battery_model !== battery.model));
      return;
    }
    const associationMax = batteryAssociationMax(battery);
    onChange([
      ...configs,
      {
        battery_model: battery.model,
        battery_topology: battery.topology,
        min_battery_qty: 1,
        max_battery_qty: associationMax,
      },
    ]);
  }

  function updateConfig(model: string, patch: Partial<EssBatteryConfig>) {
    onChange(
      configs.map((config) => {
        if (config.battery_model !== model) return config;
        const battery = batteries.find((item) => item.model === model);
        const associationMax = batteryAssociationMax(battery);
        const minQty = clampNumber(patch.min_battery_qty ?? config.min_battery_qty, 1, Math.min(7, associationMax), 1);
        const maxQty = Math.max(minQty, clampNumber(patch.max_battery_qty ?? config.max_battery_qty, 1, associationMax, associationMax));
        return { ...config, ...patch, min_battery_qty: minQty, max_battery_qty: maxQty };
      })
    );
  }

  if (supportedTopologies.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
        Selecione um inversor para listar baterias compatíveis.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {availableBatteries.map((battery) => {
          const active = configByModel.has(battery.model);
          return (
            <button
              key={battery.id}
              type="button"
              aria-pressed={active}
              className={cn(
                'inline-flex max-w-full items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                active
                  ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                  : 'border-input bg-background text-muted-foreground hover:border-primary/50 hover:bg-muted/60 hover:text-foreground'
              )}
              onClick={() => toggleBattery(battery)}
            >
              <span className="truncate">{battery.model}</span>
              <span className={active ? 'text-primary-foreground/80' : 'text-muted-foreground'}>{battery.topology}</span>
            </button>
          );
        })}
      </div>
      {availableBatteries.length === 0 && (
        <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
          Nenhuma bateria compatível com a topologia do inversor.
        </p>
      )}
      {configs.length > 0 && (
        <div className="space-y-2">
          {configs.map((config) => {
            const battery = batteries.find((item) => item.model === config.battery_model);
            const associationMax = batteryAssociationMax(battery);
            const minLimit = Math.min(7, associationMax);
            return (
              <div
                key={config.battery_model}
                className="grid gap-2 rounded-lg border bg-card p-2 sm:grid-cols-[minmax(0,1fr)_170px]"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{config.battery_model}</p>
                  <p className="text-xs text-muted-foreground">
                    {config.battery_topology} · associação máx. {associationMax}/porta
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <label className="min-w-0 rounded-md border border-blue-200 bg-blue-50 px-2 py-1 dark:border-blue-800 dark:bg-blue-950/40">
                    <span className="block text-[10px] font-semibold uppercase text-blue-600 dark:text-blue-400">Min/porta</span>
                    <select
                      className="h-7 w-full bg-transparent text-sm font-semibold text-blue-900 outline-none dark:text-blue-100"
                      value={config.min_battery_qty}
                      onChange={(event) => updateConfig(config.battery_model, { min_battery_qty: toNumber(event.target.value, 1) })}
                    >
                      {Array.from({ length: minLimit }, (_, index) => index + 1).map((qty) => (
                        <option key={qty} value={qty}>
                          {qty}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="min-w-0 rounded-md border border-rose-200 bg-rose-50 px-2 py-1 dark:border-rose-800 dark:bg-rose-950/40">
                    <span className="block text-[10px] font-semibold uppercase text-rose-600 dark:text-rose-400">Max/porta</span>
                    <select
                      className="h-7 w-full bg-transparent text-sm font-semibold text-rose-900 outline-none dark:text-rose-100"
                      value={config.max_battery_qty}
                      onChange={(event) => updateConfig(config.battery_model, { max_battery_qty: toNumber(event.target.value, associationMax) })}
                    >
                      {Array.from({ length: associationMax }, (_, index) => index + 1).map((qty) => (
                        <option key={qty} value={qty}>
                          {qty}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
