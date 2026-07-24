'use client';

import { useState } from 'react';
import { Boxes, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { DESIRED_FEATURE_DEFINITIONS } from '@/lib/desired-features';
import { cn } from '@/lib/utils';
import {
  accessoryRuleDesiredFeatures,
  accessoryRuleInverterModels,
  batteryAssociationMax,
  clampNumber,
  expansionModelSet,
  formatInverterGridType,
  formatTriggerMetric,
  inverterSupportedBatteryTopologies,
  normalizeEssBatteryConfigs,
  normalizeInverterGridTypes,
  selectClasses,
  textareaClasses,
  toNumber,
} from '../helpers';
import { Actions, CatalogLayout, Field, InfoLabel, NumberWithUnitField, SegmentedTabs } from '../shared-ui';
import {
  emptyEssRule,
  emptyRule,
  type AccessoryRow,
  type AccessoryRuleRow,
  type BatteryRow,
  type BatteryTopology,
  type EssBatteryConfig,
  type EssCompatibilityRuleRow,
  type Inclusion,
  type InverterRow,
  type TriggerMetric,
} from '../types';

/** Which product screen a "Ver regras" link jumped from — used only to pick
 * the right sub-tab and pre-fill the search/new-rule form on first mount;
 * see the lazy useState initializers below. */
export type RulesJumpTarget =
  | { scope: 'accessory'; accessoryId: string; accessoryModel: string }
  | { scope: 'ess'; inverterModel: string }
  | null;

type RuleScope = 'accessory' | 'ess';

export function RulesEditor(props: {
  accessories: AccessoryRow[];
  inverters: InverterRow[];
  batteries: BatteryRow[];
  rules: AccessoryRuleRow[];
  ruleForm: Partial<AccessoryRuleRow>;
  setRuleForm: (value: Partial<AccessoryRuleRow>) => void;
  onSaveRule: (afterPersist?: () => void) => void;
  onRemoveRule: (id: string) => void;
  essRows: EssCompatibilityRuleRow[];
  essForm: Partial<EssCompatibilityRuleRow>;
  setEssForm: (value: Partial<EssCompatibilityRuleRow>) => void;
  onSaveEss: (afterPersist?: () => void) => void;
  onRemoveEss: (id: string) => void;
  removingIds: Set<string>;
  saving: boolean;
  jumpTarget: RulesJumpTarget;
}) {
  const { ruleForm, setRuleForm } = props;
  const { essForm, setEssForm } = props;
  // Lazy initializers only run once, at mount — RulesEditor is unmounted
  // whenever the admin leaves this tab (see AdminPanel), so a fresh jump
  // (e.g. clicking "Ver regras" on a different accessory) always remounts
  // with the right starting scope/search, no effect needed to sync it.
  const [scope, setScope] = useState<RuleScope>(props.jumpTarget?.scope ?? 'accessory');
  const [accessoryQuery, setAccessoryQuery] = useState(
    props.jumpTarget?.scope === 'accessory' ? props.jumpTarget.accessoryModel : ''
  );
  const [essQuery, setEssQuery] = useState(props.jumpTarget?.scope === 'ess' ? props.jumpTarget.inverterModel : '');
  const [ruleFormOpen, setRuleFormOpen] = useState(false);
  const [essFormOpen, setEssFormOpen] = useState(false);

  const visibleRules = props.rules.filter((row) => {
    const q = accessoryQuery.trim().toLowerCase();
    if (!q) return true;
    return (row.accessories?.model ?? '').toLowerCase().includes(q) || row.name.toLowerCase().includes(q);
  });

  const visibleEssRows = props.essRows.filter((row) => {
    const q = essQuery.trim().toLowerCase();
    if (!q) return true;
    return row.inverter_model.toLowerCase().includes(q) || (row.name ?? '').toLowerCase().includes(q);
  });

  function openNewRule() {
    setRuleForm({
      ...emptyRule,
      accessory_id: props.jumpTarget?.scope === 'accessory' ? props.jumpTarget.accessoryId : '',
    });
    setRuleFormOpen(true);
  }

  function openEditRule(row: AccessoryRuleRow) {
    setRuleForm(row);
    setRuleFormOpen(true);
  }

  function openNewEss() {
    setEssForm({
      ...emptyEssRule,
      inverter_model: props.jumpTarget?.scope === 'ess' ? props.jumpTarget.inverterModel : '',
    });
    setEssFormOpen(true);
  }

  function openEditEss(row: EssCompatibilityRuleRow) {
    setEssForm(row);
    setEssFormOpen(true);
  }

  const ruleModalTitle = ruleForm.id ? 'Editar regra' : 'Nova regra';
  const essModalTitle = essForm.id ? 'Editar compatibilidade ESS' : 'Nova compatibilidade ESS';

  const selectedInverter = props.inverters.find((inverter) => inverter.model === essForm.inverter_model);
  const currentGridTypes = normalizeInverterGridTypes(selectedInverter?.grid_types);
  const currentBatteryTopologies = inverterSupportedBatteryTopologies(selectedInverter);

  return (
    <div className="space-y-4">
      <SegmentedTabs
        label="Tipo de regra"
        value={scope}
        options={[
          { value: 'accessory', label: 'Regras de acessórios', count: props.rules.length },
          { value: 'ess', label: 'Compatibilidade ESS', count: props.essRows.length },
        ]}
        onChange={(value) => setScope(value as RuleScope)}
      />

      {scope === 'accessory' ? (
        <CatalogLayout
          title="Regras de acessórios"
          count={visibleRules.length}
          formOpen={ruleFormOpen}
          formTitle={ruleModalTitle}
          newLabel="Nova regra"
          onNew={openNewRule}
          onClose={() => setRuleFormOpen(false)}
          search={
            <label className="relative block sm:w-64">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                aria-label="Buscar regra por acessório ou nome"
                className="pl-8 md:pl-8"
                placeholder="Buscar por acessório ou nome..."
                value={accessoryQuery}
                onChange={(event) => setAccessoryQuery(event.target.value)}
              />
            </label>
          }
          form={
            <>
              <Field label="Acessório">
                <select
                  className={selectClasses()}
                  value={ruleForm.accessory_id ?? ''}
                  onChange={(event) => setRuleForm({ ...ruleForm, accessory_id: event.target.value })}
                >
                  <option value="" disabled>
                    Selecione um acessório
                  </option>
                  {props.accessories.map((accessory) => (
                    <option key={accessory.id} value={accessory.id}>
                      {accessory.model}
                    </option>
                  ))}
                </select>
              </Field>
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
            </>
          }
          items={visibleRules.map((row) => ({
            id: row.id,
            title: row.name,
            badges: [row.inclusion === 'required' ? 'obrigatório' : 'opcional', row.active ? 'ativa' : 'inativa'],
            details: [
              ['Acessório', row.accessories?.model ?? '—'],
              [
                'Condição',
                row.trigger_metric === 'per_solution' ? 'Por solução' : `${formatTriggerMetric(row.trigger_metric)} >= ${row.min_quantity}`,
              ],
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
      ) : (
        <CatalogLayout
          title="Compatibilidade ESS"
          count={visibleEssRows.length}
          formOpen={essFormOpen}
          formTitle={essModalTitle}
          newLabel="Nova compatibilidade"
          onNew={openNewEss}
          onClose={() => setEssFormOpen(false)}
          search={
            <label className="relative block sm:w-64">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                aria-label="Buscar compatibilidade por inversor ou nome"
                className="pl-8 md:pl-8"
                placeholder="Buscar por inversor ou nome..."
                value={essQuery}
                onChange={(event) => setEssQuery(event.target.value)}
              />
            </label>
          }
          form={
            <>
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
                  <Field label="Modelo">
                    <select
                      className={selectClasses()}
                      value={essForm.inverter_model ?? ''}
                      onChange={(event) => setEssForm({ ...essForm, inverter_model: event.target.value })}
                    >
                      <option value="" disabled>
                        Selecione um inversor
                      </option>
                      {props.inverters.map((inverter) => (
                        <option key={inverter.id} value={inverter.model}>
                          {inverter.model}
                        </option>
                      ))}
                    </select>
                  </Field>
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
                {selectedInverter && (
                  <p className="text-xs text-muted-foreground">
                    Redes: {currentGridTypes.map(formatInverterGridType).join(', ') || '—'}
                  </p>
                )}
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
            </>
          }
          items={visibleEssRows.map((row) => {
            const batteryConfigs = normalizeEssBatteryConfigs(row, props.batteries);
            const batteryTags = batteryConfigs.map(
              (config) => `${config.battery_model} (${config.min_battery_qty}–${config.max_battery_qty})`
            );
            return {
              id: row.id,
              title: row.name?.trim() || row.inverter_model,
              badges: [
                row.active ? 'ativa' : 'inativa',
                ...Array.from(new Set(batteryConfigs.map((config) => config.battery_topology))),
              ],
              details: [
                ['Inversor', row.inverter_model],
                ['Baterias', batteryTags.length > 0 ? batteryTags : ['—'], true],
                ['Máx. paralelo', String(row.max_parallel_inverters ?? 1)],
              ],
              description: row.comment ?? undefined,
              removing: props.removingIds.has(row.id),
              onEdit: () => openEditEss(row),
              onRemove: () => props.onRemoveEss(row.id),
              removeDescription: 'Essa compatibilidade ESS será removida e as combinações geradas por ela não serão mais atualizadas.',
            };
          })}
        />
      )}
    </div>
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
  const slaveModels = expansionModelSet(batteries);
  const availableBatteries = batteries.filter(
    (battery) => supportedTopologies.includes(battery.topology) && !slaveModels.has(battery.model)
  );

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
