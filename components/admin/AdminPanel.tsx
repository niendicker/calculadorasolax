'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Boxes,
  Battery,
  Cable,
  CircleHelp,
  Database,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  Zap,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { createClient } from '@/lib/supabase/client';

type TabKey = 'solutions' | 'inverters' | 'batteries' | 'accessories' | 'rules';

type GridTopology = '1p_220V' | '3p_220V' | '3p_380V';
type BatteryTopology = 'HV' | 'LV';
type Inclusion = 'required' | 'optional';
type TriggerMetric = 'inverter_quantity' | 'battery_quantity' | 'battery_ports_used';

interface InverterRow {
  id: string;
  model: string;
  power_kw: number;
  phases: number;
  topology: 'HV' | 'LV' | 'BOTH';
  grid_types: string[];
  max_battery_qty: number;
}

interface BatteryRow {
  id: string;
  model: string;
  capacity_kwh: number;
  topology: BatteryTopology;
}

interface AccessoryRow {
  id: string;
  model: string;
  description: string | null;
  active: boolean;
}

interface AccessoryRuleRow {
  id: string;
  accessory_id: string;
  name: string;
  inclusion: Inclusion;
  trigger_metric: TriggerMetric;
  min_quantity: number;
  inverter_model: string | null;
  battery_model: string | null;
  grid_topology: GridTopology | null;
  battery_topology: BatteryTopology | null;
  quantity_per_match: number;
  comment: string | null;
  active: boolean;
  accessories?: { model: string } | null;
}

interface SolutionRow {
  id: string;
  source_file: string;
  solution_code: string;
  schema_version: string;
  inverter_model: string;
  inverter_quantity: number;
  battery_ports_used: number;
  nominal_voltage_v: number;
  rated_power_w: number;
  peak_power_w: number;
  grid_topology: GridTopology;
  battery_model: string;
  battery_topology: BatteryTopology;
  battery_quantity: number;
  battery_power_w: number;
  available_energy_wh: number;
  accessories: { model: string | null; quantity: number }[];
  comments: string[];
  raw_solution: unknown;
  active: boolean;
}

const tabs: { key: TabKey; label: string; icon: typeof Database }[] = [
  { key: 'solutions', label: 'Combinações', icon: Boxes },
  { key: 'inverters', label: 'Inversores', icon: Zap },
  { key: 'batteries', label: 'Baterias', icon: Battery },
  { key: 'accessories', label: 'Acessórios', icon: Cable },
  { key: 'rules', label: 'Regras', icon: CircleHelp },
];

const emptyInverter: Partial<InverterRow> = {
  model: '',
  power_kw: 0,
  phases: 1,
  topology: 'HV',
  grid_types: [],
  max_battery_qty: 1,
};

const emptyBattery: Partial<BatteryRow> = {
  model: '',
  capacity_kwh: 0,
  topology: 'HV',
};

const emptyAccessory: Partial<AccessoryRow> = {
  model: '',
  description: '',
  active: true,
};

const emptyRule: Partial<AccessoryRuleRow> = {
  accessory_id: '',
  name: '',
  inclusion: 'required',
  trigger_metric: 'battery_quantity',
  min_quantity: 1,
  inverter_model: null,
  battery_model: null,
  grid_topology: null,
  battery_topology: null,
  quantity_per_match: 1,
  comment: '',
  active: true,
};

const emptySolution: Partial<SolutionRow> = {
  source_file: 'admin',
  solution_code: '',
  schema_version: '1.0',
  inverter_model: '',
  inverter_quantity: 1,
  battery_ports_used: 1,
  nominal_voltage_v: 220,
  rated_power_w: 0,
  peak_power_w: 0,
  grid_topology: '1p_220V',
  battery_model: '',
  battery_topology: 'HV',
  battery_quantity: 1,
  battery_power_w: 0,
  available_energy_wh: 0,
  accessories: [],
  comments: [],
  raw_solution: {},
  active: true,
};

function toNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseJson<T>(value: string, fallback: T): T {
  if (!value.trim()) return fallback;
  return JSON.parse(value) as T;
}

function selectClasses(className = '') {
  return `h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 ${className}`;
}

function textareaClasses(className = '') {
  return `min-h-20 w-full rounded-lg border border-input bg-background px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 ${className}`;
}

export function AdminPanel() {
  const supabase = useMemo(() => createClient(), []);
  const [activeTab, setActiveTab] = useState<TabKey>('solutions');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [inverters, setInverters] = useState<InverterRow[]>([]);
  const [batteries, setBatteries] = useState<BatteryRow[]>([]);
  const [accessories, setAccessories] = useState<AccessoryRow[]>([]);
  const [rules, setRules] = useState<AccessoryRuleRow[]>([]);
  const [solutions, setSolutions] = useState<SolutionRow[]>([]);

  const [inverterForm, setInverterForm] = useState<Partial<InverterRow>>(emptyInverter);
  const [batteryForm, setBatteryForm] = useState<Partial<BatteryRow>>(emptyBattery);
  const [accessoryForm, setAccessoryForm] = useState<Partial<AccessoryRow>>(emptyAccessory);
  const [ruleForm, setRuleForm] = useState<Partial<AccessoryRuleRow>>(emptyRule);
  const [solutionForm, setSolutionForm] = useState<Partial<SolutionRow>>(emptySolution);
  const [solutionAccessoriesText, setSolutionAccessoriesText] = useState('[]');
  const [solutionCommentsText, setSolutionCommentsText] = useState('[]');
  const [solutionQuery, setSolutionQuery] = useState('');

  async function loadData() {
    setLoading(true);
    setError(null);

    const [
      inverterResult,
      batteryResult,
      accessoryResult,
      ruleResult,
      solutionResult,
    ] = await Promise.all([
      supabase.from('inverters').select('*').order('model'),
      supabase.from('batteries').select('*').order('model'),
      supabase.from('accessories').select('*').order('model'),
      supabase
        .from('accessory_rules')
        .select('*, accessories (model)')
        .order('created_at', { ascending: false }),
      supabase
        .from('approved_solutions')
        .select('*')
        .order('rated_power_w', { ascending: true })
        .limit(300),
    ]);

    const firstError =
      inverterResult.error ??
      batteryResult.error ??
      accessoryResult.error ??
      ruleResult.error ??
      solutionResult.error;

    if (firstError) {
      setError(firstError.message);
    } else {
      setInverters((inverterResult.data ?? []) as InverterRow[]);
      setBatteries((batteryResult.data ?? []) as BatteryRow[]);
      setAccessories((accessoryResult.data ?? []) as AccessoryRow[]);
      setRules((ruleResult.data ?? []) as AccessoryRuleRow[]);
      setSolutions((solutionResult.data ?? []) as SolutionRow[]);
    }

    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, []);

  const filteredSolutions = solutions.filter((solution) => {
    const text = `${solution.solution_code} ${solution.inverter_model} ${solution.battery_model}`.toLowerCase();
    return text.includes(solutionQuery.toLowerCase());
  });

  function setSuccess(message: string) {
    setStatus(message);
    setError(null);
  }

  function setFailure(message: string) {
    setError(message);
    setStatus(null);
  }

  function editSolution(solution: SolutionRow) {
    setSolutionForm(solution);
    setSolutionAccessoriesText(JSON.stringify(solution.accessories ?? [], null, 2));
    setSolutionCommentsText(JSON.stringify(solution.comments ?? [], null, 2));
  }

  function resetSolution() {
    setSolutionForm(emptySolution);
    setSolutionAccessoriesText('[]');
    setSolutionCommentsText('[]');
  }

  async function saveInverter() {
    setSaving(true);
    const payload = {
      model: inverterForm.model?.trim(),
      power_kw: toNumber(inverterForm.power_kw),
      phases: toNumber(inverterForm.phases, 1),
      topology: inverterForm.topology,
      grid_types: String(inverterForm.grid_types ?? '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
      max_battery_qty: toNumber(inverterForm.max_battery_qty, 1),
    };

    const request = inverterForm.id
      ? supabase.from('inverters').update(payload).eq('id', inverterForm.id)
      : supabase.from('inverters').insert(payload);
    const { error: saveError } = await request;

    setSaving(false);
    if (saveError) return setFailure(saveError.message);
    setInverterForm(emptyInverter);
    setSuccess('Inversor salvo.');
    await loadData();
  }

  async function saveBattery() {
    setSaving(true);
    const payload = {
      model: batteryForm.model?.trim(),
      capacity_kwh: toNumber(batteryForm.capacity_kwh),
      topology: batteryForm.topology,
    };

    const request = batteryForm.id
      ? supabase.from('batteries').update(payload).eq('id', batteryForm.id)
      : supabase.from('batteries').insert(payload);
    const { error: saveError } = await request;

    setSaving(false);
    if (saveError) return setFailure(saveError.message);
    setBatteryForm(emptyBattery);
    setSuccess('Bateria salva.');
    await loadData();
  }

  async function saveAccessory() {
    setSaving(true);
    const payload = {
      model: accessoryForm.model?.trim(),
      description: accessoryForm.description?.trim() || null,
      active: accessoryForm.active ?? true,
    };

    const request = accessoryForm.id
      ? supabase.from('accessories').update(payload).eq('id', accessoryForm.id)
      : supabase.from('accessories').insert(payload);
    const { error: saveError } = await request;

    setSaving(false);
    if (saveError) return setFailure(saveError.message);
    setAccessoryForm(emptyAccessory);
    setSuccess('Acessório salvo.');
    await loadData();
  }

  async function saveRule() {
    setSaving(true);
    const payload = {
      accessory_id: ruleForm.accessory_id,
      name: ruleForm.name?.trim(),
      inclusion: ruleForm.inclusion,
      trigger_metric: ruleForm.trigger_metric,
      min_quantity: toNumber(ruleForm.min_quantity, 1),
      inverter_model: ruleForm.inverter_model || null,
      battery_model: ruleForm.battery_model || null,
      grid_topology: ruleForm.grid_topology || null,
      battery_topology: ruleForm.battery_topology || null,
      quantity_per_match: toNumber(ruleForm.quantity_per_match, 1),
      comment: ruleForm.comment?.trim() || null,
      active: ruleForm.active ?? true,
    };

    const request = ruleForm.id
      ? supabase.from('accessory_rules').update(payload).eq('id', ruleForm.id)
      : supabase.from('accessory_rules').insert(payload);
    const { error: saveError } = await request;

    setSaving(false);
    if (saveError) return setFailure(saveError.message);
    setRuleForm(emptyRule);
    setSuccess('Regra salva.');
    await loadData();
  }

  async function saveSolution() {
    setSaving(true);

    try {
      const accessoriesJson = parseJson<{ model: string | null; quantity: number }[]>(
        solutionAccessoriesText,
        []
      );
      const commentsJson = parseJson<string[]>(solutionCommentsText, []);
      const rawSolution = {
        id: solutionForm.solution_code,
        inverter: {
          model: solutionForm.inverter_model,
          quantity: toNumber(solutionForm.inverter_quantity, 1),
          batteryPortsUsed: toNumber(solutionForm.battery_ports_used, 1),
          nominalVoltageV: toNumber(solutionForm.nominal_voltage_v, 220),
          ratedPowerW: toNumber(solutionForm.rated_power_w),
          peakPowerW: toNumber(solutionForm.peak_power_w),
          topology: solutionForm.grid_topology,
        },
        battery: {
          model: solutionForm.battery_model,
          quantity: toNumber(solutionForm.battery_quantity, 1),
          powerW: toNumber(solutionForm.battery_power_w),
          availableEnergyWh: toNumber(solutionForm.available_energy_wh),
        },
        accessories: accessoriesJson,
        comments: commentsJson,
      };

      const payload = {
        source_file: solutionForm.source_file?.trim() || 'admin',
        solution_code: solutionForm.solution_code?.trim(),
        schema_version: solutionForm.schema_version || '1.0',
        inverter_model: solutionForm.inverter_model?.trim(),
        inverter_quantity: toNumber(solutionForm.inverter_quantity, 1),
        battery_ports_used: toNumber(solutionForm.battery_ports_used, 1),
        nominal_voltage_v: toNumber(solutionForm.nominal_voltage_v, 220),
        rated_power_w: toNumber(solutionForm.rated_power_w),
        peak_power_w: toNumber(solutionForm.peak_power_w),
        grid_topology: solutionForm.grid_topology,
        battery_model: solutionForm.battery_model?.trim(),
        battery_topology: solutionForm.battery_topology,
        battery_quantity: toNumber(solutionForm.battery_quantity, 1),
        battery_power_w: toNumber(solutionForm.battery_power_w),
        available_energy_wh: toNumber(solutionForm.available_energy_wh),
        accessories: accessoriesJson,
        comments: commentsJson,
        raw_solution: rawSolution,
        active: solutionForm.active ?? true,
      };

      const request = solutionForm.id
        ? supabase.from('approved_solutions').update(payload).eq('id', solutionForm.id)
        : supabase.from('approved_solutions').insert(payload);
      const { error: saveError } = await request;

      if (saveError) return setFailure(saveError.message);
      resetSolution();
      setSuccess('Combinação salva.');
      await loadData();
    } catch (jsonError) {
      setFailure(jsonError instanceof Error ? jsonError.message : 'JSON inválido.');
    } finally {
      setSaving(false);
    }
  }

  async function removeRow(table: string, id: string, soft = false) {
    setSaving(true);
    const request = soft
      ? supabase.from(table).update({ active: false }).eq('id', id)
      : supabase.from(table).delete().eq('id', id);
    const { error: removeError } = await request;
    setSaving(false);

    if (removeError) return setFailure(removeError.message);
    setSuccess('Registro removido.');
    await loadData();
  }

  return (
    <main className="min-h-screen bg-muted/30">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-5">
        <header className="flex flex-col gap-3 border-b bg-background px-1 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Administração de soluções</h1>
            <p className="text-sm text-muted-foreground">
              Cadastre produtos, combinações aprovadas e regras automáticas de acessórios.
            </p>
          </div>
          <Button variant="outline" onClick={loadData} disabled={loading}>
            <RefreshCw className="h-4 w-4" />
            Atualizar
          </Button>
        </header>

        <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
          <nav className="flex gap-2 overflow-x-auto lg:flex-col">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <Button
                  key={tab.key}
                  variant={activeTab === tab.key ? 'default' : 'ghost'}
                  className="justify-start"
                  onClick={() => setActiveTab(tab.key)}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </Button>
              );
            })}
          </nav>

          <section className="min-w-0 space-y-4">
            {(status || error) && (
              <div
                className={`rounded-lg border px-3 py-2 text-sm ${
                  error ? 'border-destructive/40 text-destructive' : 'border-emerald-300 text-emerald-700'
                }`}
              >
                {error ?? status}
              </div>
            )}

            {loading ? (
              <div className="rounded-lg border bg-background p-6 text-sm text-muted-foreground">
                Carregando dados...
              </div>
            ) : (
              <>
                {activeTab === 'solutions' && (
                  <SolutionsEditor
                    solutions={filteredSolutions}
                    query={solutionQuery}
                    setQuery={setSolutionQuery}
                    form={solutionForm}
                    setForm={setSolutionForm}
                    accessoriesText={solutionAccessoriesText}
                    setAccessoriesText={setSolutionAccessoriesText}
                    commentsText={solutionCommentsText}
                    setCommentsText={setSolutionCommentsText}
                    inverters={inverters}
                    batteries={batteries}
                    onEdit={editSolution}
                    onNew={resetSolution}
                    onSave={saveSolution}
                    onRemove={(id) => removeRow('approved_solutions', id, true)}
                    saving={saving}
                  />
                )}

                {activeTab === 'inverters' && (
                  <InvertersEditor
                    rows={inverters}
                    form={inverterForm}
                    setForm={setInverterForm}
                    onSave={saveInverter}
                    onRemove={(id) => removeRow('inverters', id)}
                    saving={saving}
                  />
                )}

                {activeTab === 'batteries' && (
                  <BatteriesEditor
                    rows={batteries}
                    form={batteryForm}
                    setForm={setBatteryForm}
                    onSave={saveBattery}
                    onRemove={(id) => removeRow('batteries', id)}
                    saving={saving}
                  />
                )}

                {activeTab === 'accessories' && (
                  <AccessoriesEditor
                    rows={accessories}
                    form={accessoryForm}
                    setForm={setAccessoryForm}
                    onSave={saveAccessory}
                    onRemove={(id) => removeRow('accessories', id)}
                    saving={saving}
                  />
                )}

                {activeTab === 'rules' && (
                  <RulesEditor
                    rows={rules}
                    form={ruleForm}
                    setForm={setRuleForm}
                    accessories={accessories}
                    inverters={inverters}
                    batteries={batteries}
                    onSave={saveRule}
                    onRemove={(id) => removeRow('accessory_rules', id)}
                    saving={saving}
                  />
                )}
              </>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function NumberInput(props: React.ComponentProps<typeof Input>) {
  return <Input type="number" inputMode="decimal" {...props} />;
}

function Actions({
  onSave,
  onNew,
  saving,
}: {
  onSave: () => void;
  onNew?: () => void;
  saving: boolean;
}) {
  return (
    <div className="flex gap-2">
      <Button onClick={onSave} disabled={saving}>
        <Save className="h-4 w-4" />
        Salvar
      </Button>
      {onNew && (
        <Button variant="outline" onClick={onNew} disabled={saving}>
          <Plus className="h-4 w-4" />
          Novo
        </Button>
      )}
    </div>
  );
}

function SolutionsEditor(props: {
  solutions: SolutionRow[];
  query: string;
  setQuery: (value: string) => void;
  form: Partial<SolutionRow>;
  setForm: (value: Partial<SolutionRow>) => void;
  accessoriesText: string;
  setAccessoriesText: (value: string) => void;
  commentsText: string;
  setCommentsText: (value: string) => void;
  inverters: InverterRow[];
  batteries: BatteryRow[];
  onEdit: (row: SolutionRow) => void;
  onNew: () => void;
  onSave: () => void;
  onRemove: (id: string) => void;
  saving: boolean;
}) {
  const { form, setForm } = props;

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
      <Card>
        <CardHeader>
          <CardTitle>Combinações aprovadas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            placeholder="Buscar por código, inversor ou bateria"
            value={props.query}
            onChange={(event) => props.setQuery(event.target.value)}
          />
          <div className="max-h-[640px] overflow-auto rounded-lg border">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="sticky top-0 bg-muted text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">Código</th>
                  <th className="px-3 py-2 font-medium">Inversor</th>
                  <th className="px-3 py-2 font-medium">Bateria</th>
                  <th className="px-3 py-2 font-medium">Rede</th>
                  <th className="px-3 py-2 font-medium">Potência</th>
                  <th className="px-3 py-2 font-medium">Estado</th>
                  <th className="px-3 py-2 text-right font-medium">Ações</th>
                </tr>
              </thead>
              <tbody>
                {props.solutions.map((solution) => (
                  <tr key={solution.id} className="border-t">
                    <td className="px-3 py-2 font-medium">{solution.solution_code}</td>
                    <td className="px-3 py-2">
                      {solution.inverter_model} x{solution.inverter_quantity}
                    </td>
                    <td className="px-3 py-2">
                      {solution.battery_model} x{solution.battery_quantity}
                    </td>
                    <td className="px-3 py-2">{solution.grid_topology}</td>
                    <td className="px-3 py-2">{solution.rated_power_w} W</td>
                    <td className="px-3 py-2">
                      <Badge variant={solution.active ? 'secondary' : 'outline'}>
                        {solution.active ? 'ativa' : 'inativa'}
                      </Badge>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-1">
                        <Button variant="outline" size="sm" onClick={() => props.onEdit(solution)}>
                          Editar
                        </Button>
                        <Button variant="destructive" size="icon-sm" onClick={() => props.onRemove(solution.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{form.id ? 'Editar combinação' : 'Nova combinação'}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Código">
              <Input
                value={form.solution_code ?? ''}
                onChange={(event) => setForm({ ...form, solution_code: event.target.value })}
              />
            </Field>
            <Field label="Origem">
              <Input
                value={form.source_file ?? ''}
                onChange={(event) => setForm({ ...form, source_file: event.target.value })}
              />
            </Field>
          </div>

          <Separator />

          <Field label="Modelo do inversor">
            <input
              className={selectClasses()}
              list="admin-inverters"
              value={form.inverter_model ?? ''}
              onChange={(event) => setForm({ ...form, inverter_model: event.target.value })}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Qtd. inversores">
              <NumberInput
                value={form.inverter_quantity ?? 1}
                onChange={(event) => setForm({ ...form, inverter_quantity: toNumber(event.target.value, 1) })}
              />
            </Field>
            <Field label="Portas bateria">
              <NumberInput
                value={form.battery_ports_used ?? 1}
                onChange={(event) => setForm({ ...form, battery_ports_used: toNumber(event.target.value, 1) })}
              />
            </Field>
            <Field label="Potência nominal W">
              <NumberInput
                value={form.rated_power_w ?? 0}
                onChange={(event) => setForm({ ...form, rated_power_w: toNumber(event.target.value) })}
              />
            </Field>
            <Field label="Potência pico W">
              <NumberInput
                value={form.peak_power_w ?? 0}
                onChange={(event) => setForm({ ...form, peak_power_w: toNumber(event.target.value) })}
              />
            </Field>
            <Field label="Tensão V">
              <NumberInput
                value={form.nominal_voltage_v ?? 220}
                onChange={(event) => setForm({ ...form, nominal_voltage_v: toNumber(event.target.value, 220) })}
              />
            </Field>
            <Field label="Rede">
              <select
                className={selectClasses()}
                value={form.grid_topology ?? '1p_220V'}
                onChange={(event) => setForm({ ...form, grid_topology: event.target.value as GridTopology })}
              >
                <option value="1p_220V">1p 220V</option>
                <option value="3p_220V">3p 220V</option>
                <option value="3p_380V">3p 380V</option>
              </select>
            </Field>
          </div>

          <Separator />

          <Field label="Modelo da bateria">
            <input
              className={selectClasses()}
              list="admin-batteries"
              value={form.battery_model ?? ''}
              onChange={(event) => setForm({ ...form, battery_model: event.target.value })}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Topologia bateria">
              <select
                className={selectClasses()}
                value={form.battery_topology ?? 'HV'}
                onChange={(event) => setForm({ ...form, battery_topology: event.target.value as BatteryTopology })}
              >
                <option value="HV">HV</option>
                <option value="LV">LV</option>
              </select>
            </Field>
            <Field label="Qtd. baterias">
              <NumberInput
                value={form.battery_quantity ?? 1}
                onChange={(event) => setForm({ ...form, battery_quantity: toNumber(event.target.value, 1) })}
              />
            </Field>
            <Field label="Potência bateria W">
              <NumberInput
                value={form.battery_power_w ?? 0}
                onChange={(event) => setForm({ ...form, battery_power_w: toNumber(event.target.value) })}
              />
            </Field>
            <Field label="Energia disponível Wh">
              <NumberInput
                value={form.available_energy_wh ?? 0}
                onChange={(event) => setForm({ ...form, available_energy_wh: toNumber(event.target.value) })}
              />
            </Field>
          </div>

          <Field label="Acessórios JSON">
            <textarea
              className={textareaClasses('font-mono')}
              value={props.accessoriesText}
              onChange={(event) => props.setAccessoriesText(event.target.value)}
            />
          </Field>
          <Field label="Comentários JSON">
            <textarea
              className={textareaClasses('font-mono')}
              value={props.commentsText}
              onChange={(event) => props.setCommentsText(event.target.value)}
            />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.active ?? true}
              onChange={(event) => setForm({ ...form, active: event.target.checked })}
            />
            Ativa para recomendação
          </label>
          <Actions onSave={props.onSave} onNew={props.onNew} saving={props.saving} />
        </CardContent>
      </Card>

      <datalist id="admin-inverters">
        {props.inverters.map((inverter) => (
          <option key={inverter.id} value={inverter.model} />
        ))}
      </datalist>
      <datalist id="admin-batteries">
        {props.batteries.map((battery) => (
          <option key={battery.id} value={battery.model} />
        ))}
      </datalist>
    </div>
  );
}

function InvertersEditor(props: {
  rows: InverterRow[];
  form: Partial<InverterRow>;
  setForm: (value: Partial<InverterRow>) => void;
  onSave: () => void;
  onRemove: (id: string) => void;
  saving: boolean;
}) {
  const { form, setForm } = props;

  return (
    <CatalogLayout
      title="Inversores"
      form={
        <>
          <Field label="Modelo">
            <Input value={form.model ?? ''} onChange={(event) => setForm({ ...form, model: event.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Potência kW">
              <NumberInput
                value={form.power_kw ?? 0}
                onChange={(event) => setForm({ ...form, power_kw: toNumber(event.target.value) })}
              />
            </Field>
            <Field label="Fases">
              <select
                className={selectClasses()}
                value={form.phases ?? 1}
                onChange={(event) => setForm({ ...form, phases: toNumber(event.target.value, 1) })}
              >
                <option value={1}>1</option>
                <option value={3}>3</option>
              </select>
            </Field>
            <Field label="Topologia">
              <select
                className={selectClasses()}
                value={form.topology ?? 'HV'}
                onChange={(event) => setForm({ ...form, topology: event.target.value as InverterRow['topology'] })}
              >
                <option value="HV">HV</option>
                <option value="LV">LV</option>
                <option value="BOTH">BOTH</option>
              </select>
            </Field>
            <Field label="Máx. baterias">
              <NumberInput
                value={form.max_battery_qty ?? 1}
                onChange={(event) => setForm({ ...form, max_battery_qty: toNumber(event.target.value, 1) })}
              />
            </Field>
          </div>
          <Field label="Tipos de rede separados por vírgula">
            <Input
              value={Array.isArray(form.grid_types) ? form.grid_types.join(', ') : String(form.grid_types ?? '')}
              onChange={(event) => setForm({ ...form, grid_types: event.target.value.split(',') })}
            />
          </Field>
          <Actions onSave={props.onSave} onNew={() => setForm(emptyInverter)} saving={props.saving} />
        </>
      }
      table={
        <SimpleTable
          columns={['Modelo', 'kW', 'Fases', 'Topologia', 'Redes']}
          rows={props.rows.map((row) => ({
            id: row.id,
            cells: [row.model, row.power_kw, row.phases, row.topology, row.grid_types.join(', ')],
            onEdit: () => setForm(row),
            onRemove: () => props.onRemove(row.id),
          }))}
        />
      }
    />
  );
}

function BatteriesEditor(props: {
  rows: BatteryRow[];
  form: Partial<BatteryRow>;
  setForm: (value: Partial<BatteryRow>) => void;
  onSave: () => void;
  onRemove: (id: string) => void;
  saving: boolean;
}) {
  const { form, setForm } = props;

  return (
    <CatalogLayout
      title="Baterias"
      form={
        <>
          <Field label="Modelo">
            <Input value={form.model ?? ''} onChange={(event) => setForm({ ...form, model: event.target.value })} />
          </Field>
          <Field label="Capacidade kWh">
            <NumberInput
              value={form.capacity_kwh ?? 0}
              onChange={(event) => setForm({ ...form, capacity_kwh: toNumber(event.target.value) })}
            />
          </Field>
          <Field label="Topologia">
            <select
              className={selectClasses()}
              value={form.topology ?? 'HV'}
              onChange={(event) => setForm({ ...form, topology: event.target.value as BatteryTopology })}
            >
              <option value="HV">HV</option>
              <option value="LV">LV</option>
            </select>
          </Field>
          <Actions onSave={props.onSave} onNew={() => setForm(emptyBattery)} saving={props.saving} />
        </>
      }
      table={
        <SimpleTable
          columns={['Modelo', 'Capacidade', 'Topologia']}
          rows={props.rows.map((row) => ({
            id: row.id,
            cells: [row.model, `${row.capacity_kwh} kWh`, row.topology],
            onEdit: () => setForm(row),
            onRemove: () => props.onRemove(row.id),
          }))}
        />
      }
    />
  );
}

function AccessoriesEditor(props: {
  rows: AccessoryRow[];
  form: Partial<AccessoryRow>;
  setForm: (value: Partial<AccessoryRow>) => void;
  onSave: () => void;
  onRemove: (id: string) => void;
  saving: boolean;
}) {
  const { form, setForm } = props;

  return (
    <CatalogLayout
      title="Acessórios"
      form={
        <>
          <Field label="Modelo">
            <Input value={form.model ?? ''} onChange={(event) => setForm({ ...form, model: event.target.value })} />
          </Field>
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
          <Actions onSave={props.onSave} onNew={() => setForm(emptyAccessory)} saving={props.saving} />
        </>
      }
      table={
        <SimpleTable
          columns={['Modelo', 'Descrição', 'Estado']}
          rows={props.rows.map((row) => ({
            id: row.id,
            cells: [row.model, row.description ?? '', row.active ? 'ativo' : 'inativo'],
            onEdit: () => setForm(row),
            onRemove: () => props.onRemove(row.id),
          }))}
        />
      }
    />
  );
}

function RulesEditor(props: {
  rows: AccessoryRuleRow[];
  form: Partial<AccessoryRuleRow>;
  setForm: (value: Partial<AccessoryRuleRow>) => void;
  accessories: AccessoryRow[];
  inverters: InverterRow[];
  batteries: BatteryRow[];
  onSave: () => void;
  onRemove: (id: string) => void;
  saving: boolean;
}) {
  const { form, setForm } = props;

  return (
    <CatalogLayout
      title="Regras automáticas"
      form={
        <>
          <Field label="Nome da regra">
            <Input value={form.name ?? ''} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          </Field>
          <Field label="Acessório">
            <select
              className={selectClasses()}
              value={form.accessory_id ?? ''}
              onChange={(event) => setForm({ ...form, accessory_id: event.target.value })}
            >
              <option value="">Selecione</option>
              {props.accessories.map((accessory) => (
                <option key={accessory.id} value={accessory.id}>
                  {accessory.model}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Inclusão">
              <select
                className={selectClasses()}
                value={form.inclusion ?? 'required'}
                onChange={(event) => setForm({ ...form, inclusion: event.target.value as Inclusion })}
              >
                <option value="required">Obrigatório</option>
                <option value="optional">Opcional</option>
              </select>
            </Field>
            <Field label="Quantidade do acessório">
              <NumberInput
                value={form.quantity_per_match ?? 1}
                onChange={(event) => setForm({ ...form, quantity_per_match: toNumber(event.target.value, 1) })}
              />
            </Field>
            <Field label="Limiar baseado em">
              <select
                className={selectClasses()}
                value={form.trigger_metric ?? 'battery_quantity'}
                onChange={(event) => setForm({ ...form, trigger_metric: event.target.value as TriggerMetric })}
              >
                <option value="inverter_quantity">Qtd. inversores</option>
                <option value="battery_quantity">Qtd. baterias</option>
                <option value="battery_ports_used">Portas de bateria</option>
              </select>
            </Field>
            <Field label="Quantidade mínima">
              <NumberInput
                value={form.min_quantity ?? 1}
                onChange={(event) => setForm({ ...form, min_quantity: toNumber(event.target.value, 1) })}
              />
            </Field>
          </div>

          <Separator />
          <p className="text-sm text-muted-foreground">
            Filtros vazios valem para qualquer combinação.
          </p>
          <Field label="Inversor">
            <select
              className={selectClasses()}
              value={form.inverter_model ?? ''}
              onChange={(event) => setForm({ ...form, inverter_model: event.target.value || null })}
            >
              <option value="">Qualquer</option>
              {props.inverters.map((inverter) => (
                <option key={inverter.id} value={inverter.model}>
                  {inverter.model}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Bateria">
            <select
              className={selectClasses()}
              value={form.battery_model ?? ''}
              onChange={(event) => setForm({ ...form, battery_model: event.target.value || null })}
            >
              <option value="">Qualquer</option>
              {props.batteries.map((battery) => (
                <option key={battery.id} value={battery.model}>
                  {battery.model}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Rede">
              <select
                className={selectClasses()}
                value={form.grid_topology ?? ''}
                onChange={(event) => setForm({ ...form, grid_topology: (event.target.value || null) as GridTopology | null })}
              >
                <option value="">Qualquer</option>
                <option value="1p_220V">1p 220V</option>
                <option value="3p_220V">3p 220V</option>
                <option value="3p_380V">3p 380V</option>
              </select>
            </Field>
            <Field label="Topologia bateria">
              <select
                className={selectClasses()}
                value={form.battery_topology ?? ''}
                onChange={(event) => setForm({ ...form, battery_topology: (event.target.value || null) as BatteryTopology | null })}
              >
                <option value="">Qualquer</option>
                <option value="HV">HV</option>
                <option value="LV">LV</option>
              </select>
            </Field>
          </div>
          <Field label="Comentário automático">
            <textarea
              className={textareaClasses()}
              value={form.comment ?? ''}
              onChange={(event) => setForm({ ...form, comment: event.target.value })}
            />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.active ?? true}
              onChange={(event) => setForm({ ...form, active: event.target.checked })}
            />
            Ativa
          </label>
          <Actions onSave={props.onSave} onNew={() => setForm(emptyRule)} saving={props.saving} />
        </>
      }
      table={
        <SimpleTable
          columns={['Regra', 'Acessório', 'Condição', 'Tipo', 'Estado']}
          rows={props.rows.map((row) => ({
            id: row.id,
            cells: [
              row.name,
              row.accessories?.model ?? '',
              `${row.trigger_metric} >= ${row.min_quantity}`,
              row.inclusion === 'required' ? 'obrigatório' : 'opcional',
              row.active ? 'ativa' : 'inativa',
            ],
            onEdit: () => setForm(row),
            onRemove: () => props.onRemove(row.id),
          }))}
        />
      }
    />
  );
}

function CatalogLayout({
  title,
  form,
  table,
}: {
  title: string;
  form: React.ReactNode;
  table: React.ReactNode;
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">{form}</CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Registros</CardTitle>
        </CardHeader>
        <CardContent>{table}</CardContent>
      </Card>
    </div>
  );
}

function SimpleTable({
  columns,
  rows,
}: {
  columns: string[];
  rows: {
    id: string;
    cells: React.ReactNode[];
    onEdit: () => void;
    onRemove: () => void;
  }[];
}) {
  return (
    <div className="overflow-auto rounded-lg border">
      <table className="w-full min-w-[680px] text-sm">
        <thead className="bg-muted text-left">
          <tr>
            {columns.map((column) => (
              <th key={column} className="px-3 py-2 font-medium">
                {column}
              </th>
            ))}
            <th className="px-3 py-2 text-right font-medium">Ações</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-t">
              {row.cells.map((cell, index) => (
                <td key={index} className="px-3 py-2">
                  {cell}
                </td>
              ))}
              <td className="px-3 py-2">
                <div className="flex justify-end gap-1">
                  <Button variant="outline" size="sm" onClick={row.onEdit}>
                    Editar
                  </Button>
                  <Button variant="destructive" size="icon-sm" onClick={row.onRemove}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
