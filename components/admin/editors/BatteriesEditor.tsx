'use client';

import { useMemo, useState } from 'react';
import { Battery, Search, Zap } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { normalizeBatteryFlags, selectClasses, toNullableNumber, toNumber } from '../helpers';
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
import { batteryFlagOptions, emptyBattery, productEditorTabOptions, type BatteryRow, type ProductEditorTab } from '../types';

export function BatteriesEditor(props: {
  rows: BatteryRow[];
  form: Partial<BatteryRow>;
  setForm: (value: Partial<BatteryRow>) => void;
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
}) {
  const { form, setForm } = props;
  const [formOpen, setFormOpen] = useState(false);
  const [activeFormTab, setActiveFormTab] = useState<ProductEditorTab>('general');
  const [selectedTopology, setSelectedTopology] = useState<'all' | 'HV' | 'LV'>('all');
  const [query, setQuery] = useState('');

  const topologyOptions = useMemo(() => {
    const counts = { HV: 0, LV: 0 };
    for (const row of props.rows) {
      if (row.topology in counts) counts[row.topology as 'HV' | 'LV']++;
    }
    return [
      { value: 'all', label: 'Todas', count: props.rows.length },
      { value: 'HV', label: 'HV', count: counts.HV },
      { value: 'LV', label: 'LV', count: counts.LV },
    ];
  }, [props.rows]);

  const visibleRows = useMemo(() => {
    const byTopology =
      selectedTopology === 'all' ? props.rows : props.rows.filter((row) => row.topology === selectedTopology);
    const q = query.trim().toLowerCase();
    if (!q) return byTopology;
    return byTopology.filter((row) => row.model.toLowerCase().includes(q));
  }, [props.rows, selectedTopology, query]);

  function openNew() {
    setForm(emptyBattery);
    setActiveFormTab('general');
    setFormOpen(true);
  }

  function openEdit(row: BatteryRow) {
    setForm(row);
    setActiveFormTab('general');
    setFormOpen(true);
  }

  return (
    <CatalogLayout
      title="Baterias"
      count={visibleRows.length}
      formOpen={formOpen}
      formTitle={form.id ? 'Editar bateria' : 'Nova bateria'}
      newLabel="Nova bateria"
      onNew={openNew}
      onClose={() => setFormOpen(false)}
      search={
        <label className="relative block sm:w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Buscar bateria por modelo"
            className="pl-8 md:pl-8"
            placeholder="Buscar por modelo..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      }
      filter={
        <div className="rounded-lg border bg-card p-3">
          <SegmentedTabs
            label="Tecnologia"
            value={selectedTopology}
            options={topologyOptions}
            onChange={(value) => setSelectedTopology(value as typeof selectedTopology)}
          />
        </div>
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
                tip="Nome amigável opcional, mostrado ao usuário no lugar do modelo técnico nos cards de bateria."
              />
            }
          >
            <Input
              value={form.nickname ?? ''}
              onChange={(event) => setForm({ ...form, nickname: event.target.value })}
              placeholder="Ex.: Bateria Compacta"
            />
          </Field>
          <InlineOptionTabs options={productEditorTabOptions} value={activeFormTab} onChange={setActiveFormTab} />
          {activeFormTab === 'general' ? (
            <>
              <div className="space-y-3 rounded-lg border bg-background p-3">
                <p className="text-sm font-semibold">Configuração</p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <NumberWithUnitField
                    label="Capacidade"
                    tip="Energia nominal total do modelo de bateria."
                    icon={<Battery className="h-4 w-4" />}
                    unit="kWh"
                    value={form.capacity_kwh ?? 0}
                    onChange={(event) => setForm({ ...form, capacity_kwh: toNumber(event.target.value) })}
                  />
                  <Field label={<InfoLabel label="Potência padrão" tip="Calculada automaticamente: Tensão nominal × Corrente recomendada." />}>
                    <div className="flex h-8 items-center gap-1.5 rounded-lg border border-dashed bg-muted/40 px-2.5 text-sm text-muted-foreground">
                      <Zap className="h-3.5 w-3.5 shrink-0" />
                      {form.nominal_voltage_v != null && form.recommended_current_a != null
                        ? `${((form.nominal_voltage_v * form.recommended_current_a) / 1000).toFixed(2)} kW`
                        : '—'}
                    </div>
                  </Field>
                  <Field label={<InfoLabel label="Potência pico" tip="Calculada automaticamente: Tensão nominal × Corrente máxima." />}>
                    <div className="flex h-8 items-center gap-1.5 rounded-lg border border-dashed bg-muted/40 px-2.5 text-sm text-muted-foreground">
                      <Zap className="h-3.5 w-3.5 shrink-0" />
                      {form.nominal_voltage_v != null && form.max_current_a != null
                        ? `${((form.nominal_voltage_v * form.max_current_a) / 1000).toFixed(2)} kW`
                        : '—'}
                    </div>
                  </Field>
                  <Field asDiv label={<InfoLabel label="SOC mínimo" tip="Percentual reservado da bateria. A energia útil é calculada descontando esse valor da capacidade." />}>
                    <InlineOptionTabs
                      options={[
                        { value: 5, label: '5%' },
                        { value: 10, label: '10%' },
                      ]}
                      value={form.min_soc_percent === 5 ? 5 : 10}
                      onChange={(min_soc_percent) => setForm({ ...form, min_soc_percent })}
                    />
                  </Field>
                </div>
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
                  <Field label={<InfoLabel label="Associação máxima" tip="Quantidade máxima deste modelo em qualquer banco ou porta de bateria de um inversor." />}>
                    <select
                      className={selectClasses()}
                      value={form.max_association_qty ?? 15}
                      onChange={(event) => setForm({ ...form, max_association_qty: toNumber(event.target.value, 15) })}
                    >
                      {Array.from({ length: 15 }, (_, index) => index + 1).map((qty) => (
                        <option key={qty} value={qty}>
                          {qty}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
              </div>
              <div className="space-y-3 rounded-lg border bg-background p-3">
                <p className="text-sm font-semibold">Elétricas</p>
                <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
                  <NumberWithUnitField
                    label="Tensão nominal"
                    tip="Tensão nominal do modelo de bateria."
                    unit="V"
                    placeholder="—"
                    value={form.nominal_voltage_v ?? undefined}
                    onChange={(event) => setForm({ ...form, nominal_voltage_v: toNullableNumber(event.target.value) })}
                    onClear={() => setForm({ ...form, nominal_voltage_v: null })}
                  />
                  <NumberWithUnitField
                    label="Tensão mín."
                    tip="Menor tensão operacional permitida para o banco de baterias."
                    unit="V"
                    placeholder="—"
                    value={form.voltage_min_v ?? undefined}
                    onChange={(event) => setForm({ ...form, voltage_min_v: toNullableNumber(event.target.value) })}
                    onClear={() => setForm({ ...form, voltage_min_v: null })}
                  />
                  <NumberWithUnitField
                    label="Tensão máx."
                    tip="Maior tensão operacional permitida para o banco de baterias."
                    unit="V"
                    placeholder="—"
                    value={form.voltage_max_v ?? undefined}
                    onChange={(event) => setForm({ ...form, voltage_max_v: toNullableNumber(event.target.value) })}
                    onClear={() => setForm({ ...form, voltage_max_v: null })}
                  />
                  <NumberWithUnitField
                    label="Corrente rec."
                    tip="Corrente recomendada para operação contínua."
                    unit="A"
                    placeholder="—"
                    value={form.recommended_current_a ?? undefined}
                    onChange={(event) => setForm({ ...form, recommended_current_a: toNullableNumber(event.target.value) })}
                    onClear={() => setForm({ ...form, recommended_current_a: null })}
                  />
                  <NumberWithUnitField
                    label="Corrente máx."
                    tip="Corrente máxima suportada pela bateria."
                    unit="A"
                    placeholder="—"
                    value={form.max_current_a ?? undefined}
                    onChange={(event) => setForm({ ...form, max_current_a: toNullableNumber(event.target.value) })}
                    onClear={() => setForm({ ...form, max_current_a: null })}
                  />
                </div>
              </div>
              <Field asDiv label={<InfoLabel label="Flags" tip="Características estruturadas do produto, como grau de proteção IP. Novas flags podem ser adicionadas no código." />}>
                <ToggleChipsInput
                  options={batteryFlagOptions}
                  value={normalizeBatteryFlags(form.flags)}
                  onChange={(flags) => setForm({ ...form, flags })}
                />
              </Field>
            </>
          ) : (
            <ProductMediaFields
              table="batteries"
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
        badges: [row.topology],
        details: [
          ['Capacidade / Útil', `${row.capacity_kwh} / ${(Number(row.capacity_kwh || 0) * (1 - Number(row.min_soc_percent ?? 10) / 100)).toFixed(2)} kWh`],
          ['Potência', `${row.standard_power_kw ?? '—'} / ${row.peak_power_kw ?? '—'} kW`],
          ['Tensão', `${row.nominal_voltage_v ?? '—'} V (${row.voltage_min_v ?? '—'} – ${row.voltage_max_v ?? '—'} V)`],
          ['Corrente', `${row.recommended_current_a ?? '—'} / ${row.max_current_a ?? '—'} A`],
        ],
        media: <MediaSummary imageUrl={row.image_url} documents={row.documents} />,
        removing: props.removingIds.has(row.id),
        onEdit: () => openEdit(row),
        onRemove: () => props.onRemove(row.id),
        removeDescription: `A bateria ${row.model} e todos os seus dados serão removidos do cadastro.`,
      }))}
    />
  );
}
