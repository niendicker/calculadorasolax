'use client';

import { useMemo, useState } from 'react';
import { Activity, Battery, Search, ShieldCheck, Zap } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { normalizeBatteryFlags, toNullableNumber, toNumber } from '../helpers';
import { useCatalogEditorForm } from '../hooks/useCatalogEditorForm';
import {
  Actions,
  CatalogLayout,
  Field,
  InfoLabel,
  InlineOptionTabs,
  MediaSummary,
  ModelNicknameFields,
  NumberWithUnitField,
  ProductMediaFields,
  SegmentedTabs,
  ToggleChipsInput,
} from '../shared-ui';
import { batteryFlagOptions, emptyBattery, productEditorTabOptions, type BatteryRow } from '../types';

export function BatteriesEditor(props: {
  rows: BatteryRow[];
  form: Partial<BatteryRow>;
  setForm: (value: Partial<BatteryRow>) => void;
  onSave: (afterPersist?: () => void) => void;
  onRemove: (id: string) => void;
  removingIds: Set<string>;
  uploadAsset: (
    table: 'inverters' | 'batteries' | 'accessories' | 'ci_bess_products',
    model: string | undefined,
    kind: 'image' | 'documents',
    file: File
  ) => Promise<string>;
  saving: boolean;
}) {
  const { form, setForm } = props;
  const { formOpen, activeFormTab, setActiveFormTab, openNew, openEdit, close } = useCatalogEditorForm<BatteryRow>(
    emptyBattery,
    setForm
  );
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

  return (
    <>
    <CatalogLayout
      title="Baterias"
      count={visibleRows.length}
      formOpen={formOpen}
      formTitle={form.id ? 'Editar bateria' : 'Nova bateria'}
      newLabel="Nova bateria"
      onNew={openNew}
      onClose={close}
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
          <ModelNicknameFields
            form={form}
            setForm={setForm}
            nicknameTip="Nome amigável opcional, mostrado ao usuário no lugar do modelo técnico nos cards de bateria."
            nicknamePlaceholder="Ex.: Bateria Compacta"
          />
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
                        : '-'}
                    </div>
                  </Field>
                  <Field label={<InfoLabel label="Potência pico" tip="Calculada automaticamente: Tensão nominal × Corrente máxima." />}>
                    <div className="flex h-8 items-center gap-1.5 rounded-lg border border-dashed bg-muted/40 px-2.5 text-sm text-muted-foreground">
                      <Zap className="h-3.5 w-3.5 shrink-0" />
                      {form.nominal_voltage_v != null && form.max_current_a != null
                        ? `${((form.nominal_voltage_v * form.max_current_a) / 1000).toFixed(2)} kW`
                        : '-'}
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
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
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
                    <Select
                      value={form.max_association_qty ?? 15}
                      onChange={(event) => setForm({ ...form, max_association_qty: toNumber(event.target.value, 15) })}
                    >
                      {Array.from({ length: 15 }, (_, index) => index + 1).map((qty) => (
                        <option key={qty} value={qty}>
                          {qty}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field
                    label={
                      <InfoLabel
                        label="Modelo de expansão"
                        tip="Preencha quando este for o modelo Master de uma linha combinada: as unidades 2+ do banco serão exibidas com este modelo (ex.: Slave) em vez de repetir o Master. Deixe vazio quando todas as unidades usam o mesmo modelo."
                      />
                    }
                  >
                    <Input
                      list="admin-battery-expansion-models"
                      value={form.expansion_model ?? ''}
                      onChange={(event) => setForm({ ...form, expansion_model: event.target.value })}
                      placeholder="Ex.: T58 Slave"
                    />
                  </Field>
                </div>
              </div>
              <div className="space-y-3 rounded-lg border bg-background p-3">
                <div>
                  <p className="text-sm font-semibold">Desempenho energético</p>
                  <p className="mt-1 text-xs text-muted-foreground">Dados usados na projeção de economia e envelhecimento.</p>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <NumberWithUnitField
                    label="RTE da bateria"
                    tip="Eficiência energética DC→DC do ciclo completo de carga e descarga, conforme dados do fabricante."
                    unit="%"
                    value={form.round_trip_efficiency_percent ?? 95}
                    onChange={(event) => setForm({ ...form, round_trip_efficiency_percent: toNumber(event.target.value, 95) })}
                  />
                  <NumberWithUnitField
                    label="SOH inicial"
                    tip="Estado de saúde considerado no início da projeção. Para produtos novos, normalmente 100%."
                    unit="%"
                    value={form.initial_soh_percent ?? 100}
                    onChange={(event) => setForm({ ...form, initial_soh_percent: toNumber(event.target.value, 100) })}
                  />
                  <NumberWithUnitField
                    label="Redução do SOH"
                    tip="Perda média de capacidade por ano aplicada ao fluxo de caixa da bateria."
                    unit="%/ano"
                    value={form.annual_soh_loss_percent ?? 2}
                    onChange={(event) => setForm({ ...form, annual_soh_loss_percent: toNumber(event.target.value, 2) })}
                  />
                  <NumberWithUnitField
                    label="SOH na garantia"
                    tip="Percentual mínimo garantido ao fim da garantia. Campo informativo opcional."
                    unit="%"
                    placeholder="-"
                    value={form.warranty_end_soh_percent ?? undefined}
                    onChange={(event) => setForm({ ...form, warranty_end_soh_percent: toNullableNumber(event.target.value) })}
                    onClear={() => setForm({ ...form, warranty_end_soh_percent: null })}
                  />
                  <NumberWithUnitField
                    label="Garantia"
                    tip="Duração da garantia de fábrica, em anos."
                    icon={<ShieldCheck className="h-4 w-4" />}
                    unit="anos"
                    value={form.warranty_years ?? 10}
                    onChange={(event) => setForm({ ...form, warranty_years: Math.max(1, toNumber(event.target.value, 10)) })}
                  />
                  <NumberWithUnitField
                    label="Garantia por ciclos"
                    tip="Limite de ciclos de carga/descarga cobertos pela garantia. O que ocorrer primeiro entre anos e ciclos encerra a garantia."
                    icon={<Activity className="h-4 w-4" />}
                    unit="ciclos"
                    value={form.warranty_cycles ?? 6000}
                    onChange={(event) => setForm({ ...form, warranty_cycles: Math.max(1, toNumber(event.target.value, 6000)) })}
                  />
                </div>
              </div>
              <div className="space-y-3 rounded-lg border bg-background p-3">
                <p className="text-sm font-semibold">Elétricas</p>
                <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
                  <NumberWithUnitField
                    label="Tensão nominal"
                    tip="Tensão nominal do modelo de bateria."
                    unit="V"
                    placeholder="-"
                    value={form.nominal_voltage_v ?? undefined}
                    onChange={(event) => setForm({ ...form, nominal_voltage_v: toNullableNumber(event.target.value) })}
                    onClear={() => setForm({ ...form, nominal_voltage_v: null })}
                  />
                  <NumberWithUnitField
                    label="Tensão mín."
                    tip="Menor tensão operacional permitida para o banco de baterias."
                    unit="V"
                    placeholder="-"
                    value={form.voltage_min_v ?? undefined}
                    onChange={(event) => setForm({ ...form, voltage_min_v: toNullableNumber(event.target.value) })}
                    onClear={() => setForm({ ...form, voltage_min_v: null })}
                  />
                  <NumberWithUnitField
                    label="Tensão máx."
                    tip="Maior tensão operacional permitida para o banco de baterias."
                    unit="V"
                    placeholder="-"
                    value={form.voltage_max_v ?? undefined}
                    onChange={(event) => setForm({ ...form, voltage_max_v: toNullableNumber(event.target.value) })}
                    onClear={() => setForm({ ...form, voltage_max_v: null })}
                  />
                  <NumberWithUnitField
                    label="Corrente rec."
                    tip="Corrente recomendada para operação contínua."
                    unit="A"
                    placeholder="-"
                    value={form.recommended_current_a ?? undefined}
                    onChange={(event) => setForm({ ...form, recommended_current_a: toNullableNumber(event.target.value) })}
                    onClear={() => setForm({ ...form, recommended_current_a: null })}
                  />
                  <NumberWithUnitField
                    label="Corrente máx."
                    tip="Corrente máxima suportada pela bateria."
                    unit="A"
                    placeholder="-"
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
          <Actions onSave={() => props.onSave(close)} saving={props.saving} />
        </>
      }
      items={visibleRows.map((row) => ({
        id: row.id,
        title: row.model,
        badges: [row.topology],
        details: [
          ['Capacidade / Útil', `${row.capacity_kwh} / ${(Number(row.capacity_kwh || 0) * (1 - Number(row.min_soc_percent ?? 10) / 100)).toFixed(2)} kWh`],
          ['Potência', `${row.standard_power_kw ?? '-'} / ${row.peak_power_kw ?? '-'} kW`],
          ['RTE / SOH', `${row.round_trip_efficiency_percent ?? 95}% · −${row.annual_soh_loss_percent ?? 2}%/ano`],
          ['Tensão', `${row.nominal_voltage_v ?? '-'} V (${row.voltage_min_v ?? '-'} – ${row.voltage_max_v ?? '-'} V)`],
          ['Corrente', `${row.recommended_current_a ?? '-'} / ${row.max_current_a ?? '-'} A`],
          ['Garantia', `${row.warranty_years ?? 10} anos ou ${row.warranty_cycles ?? 6000} ciclos`],
        ],
        media: <MediaSummary imageUrl={row.image_url} documents={row.documents} />,
        removing: props.removingIds.has(row.id),
        onEdit: () => openEdit(row),
        onRemove: () => props.onRemove(row.id),
        removeDescription: `A bateria ${row.model} e todos os seus dados serão removidos do cadastro.`,
      }))}
    />
    <datalist id="admin-battery-expansion-models">
      {props.rows.filter((row) => row.model !== form.model).map((row) => (
        <option key={row.id} value={row.model} />
      ))}
    </datalist>
    </>
  );
}
