'use client';

import { useMemo, useState } from 'react';
import { Activity, Cable, ListChecks, Search, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  formatInverterGridType,
  normalizeInverterFlags,
  normalizeInverterGridTypes,
  phasesFromInverterGridTypes,
  toNullableNumber,
  toNumber,
} from '../helpers';
import {
  Actions,
  CatalogLayout,
  Field,
  InfoLabel,
  InlineOptionTabs,
  MediaSummary,
  NumberWithUnitField,
  ProductMediaFields,
  SegmentedTabs,
  ToggleChipsInput,
} from '../shared-ui';
import {
  emptyInverter,
  inverterFlagOptions,
  inverterGridTypeOptions,
  productEditorTabOptions,
  type EssCompatibilityRuleRow,
  type InverterRow,
  type ProductEditorTab,
} from '../types';

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
  onViewEssRules: (inverterModel: string) => void;
}) {
  const { form, setForm } = props;
  const [formOpen, setFormOpen] = useState(false);
  const [activeFormTab, setActiveFormTab] = useState<ProductEditorTab>('general');
  const [selectedPhase, setSelectedPhase] = useState<'all' | '1' | '2' | '3'>('all');
  const [selectedVoltage, setSelectedVoltage] = useState<'all' | '220V' | '380V'>('all');
  const [selectedBatteryTopology, setSelectedBatteryTopology] = useState<'all' | 'HV' | 'LV'>('all');
  const [query, setQuery] = useState('');

  const inverterEssRuleCount = useMemo(
    () => (form.model ? props.essRows.filter((row) => row.inverter_model === form.model).length : 0),
    [props.essRows, form.model]
  );

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

  const rowsByPhase = useMemo(
    () => (selectedPhase === 'all' ? props.rows : props.rows.filter((row) => String(row.phases) === selectedPhase)),
    [props.rows, selectedPhase]
  );

  // Only three-phase inverters carry a 220V/380V distinction — 220V and 380V
  // aren't mutually exclusive on a row, since one model's grid_types can list both.
  const voltageOptions = useMemo(() => {
    if (selectedPhase !== '3') return [];
    let count220 = 0;
    let count380 = 0;
    for (const row of rowsByPhase) {
      const grids = normalizeInverterGridTypes(row.grid_types);
      if (grids.includes('3P_220V')) count220++;
      if (grids.includes('3P_380V')) count380++;
    }
    return [
      { value: 'all', label: 'Todas', count: rowsByPhase.length },
      ...(count220 > 0 ? [{ value: '220V', label: '220V', count: count220 }] : []),
      ...(count380 > 0 ? [{ value: '380V', label: '380V', count: count380 }] : []),
    ];
  }, [rowsByPhase, selectedPhase]);

  const rowsByVoltage = useMemo(() => {
    if (selectedPhase !== '3' || selectedVoltage === 'all') return rowsByPhase;
    const target = selectedVoltage === '220V' ? '3P_220V' : '3P_380V';
    return rowsByPhase.filter((row) => normalizeInverterGridTypes(row.grid_types).includes(target));
  }, [rowsByPhase, selectedPhase, selectedVoltage]);

  // Mono/bifásico inverters carry the HV/LV distinction instead — a row whose
  // topology is 'BOTH' supports either, so it counts toward (and stays
  // visible under) both groups rather than being excluded from either.
  const batteryTopologyOptions = useMemo(() => {
    if (selectedPhase !== '1' && selectedPhase !== '2') return [];
    let countHv = 0;
    let countLv = 0;
    for (const row of rowsByVoltage) {
      if (row.topology === 'HV' || row.topology === 'BOTH') countHv++;
      if (row.topology === 'LV' || row.topology === 'BOTH') countLv++;
    }
    return [
      { value: 'all', label: 'Todas', count: rowsByVoltage.length },
      ...(countHv > 0 ? [{ value: 'HV', label: 'HV', count: countHv }] : []),
      ...(countLv > 0 ? [{ value: 'LV', label: 'LV', count: countLv }] : []),
    ];
  }, [rowsByVoltage, selectedPhase]);

  const rowsByBatteryTopology = useMemo(() => {
    if ((selectedPhase !== '1' && selectedPhase !== '2') || selectedBatteryTopology === 'all') return rowsByVoltage;
    return rowsByVoltage.filter((row) => row.topology === selectedBatteryTopology || row.topology === 'BOTH');
  }, [rowsByVoltage, selectedPhase, selectedBatteryTopology]);

  const visibleRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rowsByBatteryTopology;
    return rowsByBatteryTopology.filter((row) => row.model.toLowerCase().includes(q));
  }, [rowsByBatteryTopology, query]);

  function openNew() {
    setForm(emptyInverter);
    setActiveFormTab('general');
    setFormOpen(true);
  }

  function openEdit(row: InverterRow) {
    setForm(row);
    setActiveFormTab('general');
    setFormOpen(true);
  }

  return (
    <CatalogLayout
      title="Inversores"
      count={visibleRows.length}
      formOpen={formOpen}
      formTitle={form.id ? 'Editar inversor' : 'Novo inversor'}
      newLabel="Novo inversor"
      onNew={openNew}
      onClose={() => setFormOpen(false)}
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
          <div className="space-y-3 rounded-lg border bg-card p-3">
            <SegmentedTabs
              label="Padrão de rede"
              value={selectedPhase}
              options={phaseOptions}
              onChange={(value) => {
                setSelectedPhase(value as typeof selectedPhase);
                setSelectedVoltage('all');
                setSelectedBatteryTopology('all');
              }}
            />
            {voltageOptions.length > 2 && (
              <SegmentedTabs
                label="Tensão"
                value={selectedVoltage}
                options={voltageOptions}
                onChange={(value) => setSelectedVoltage(value as typeof selectedVoltage)}
              />
            )}
            {batteryTopologyOptions.length > 2 && (
              <SegmentedTabs
                label="Tipo de bateria"
                value={selectedBatteryTopology}
                options={batteryTopologyOptions}
                onChange={(value) => setSelectedBatteryTopology(value as typeof selectedBatteryTopology)}
              />
            )}
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
          <InlineOptionTabs options={productEditorTabOptions} value={activeFormTab} onChange={setActiveFormTab} />
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
              {form.model?.trim() && (
                <Button type="button" variant="outline" size="sm" onClick={() => props.onViewEssRules(form.model!)}>
                  <ListChecks className="h-4 w-4" />
                  Ver compatibilidade ESS{inverterEssRuleCount > 0 ? ` (${inverterEssRuleCount})` : ''}
                </Button>
              )}
            </>
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
          <Actions onSave={() => props.onSave(() => setFormOpen(false))} saving={props.saving} />
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
