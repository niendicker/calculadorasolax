'use client';

import { useMemo, useState } from 'react';
import { Battery, Gauge, Search, ShieldCheck, Zap } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { textareaClasses, toNumber } from '../helpers';
import { useCatalogEditorForm } from '../hooks/useCatalogEditorForm';
import {
  Actions,
  CatalogLayout,
  Field,
  InlineOptionTabs,
  MediaSummary,
  NumberWithUnitField,
  ProductMediaFields,
  SegmentedTabs,
} from '../shared-ui';
import { emptyCiBessProduct, productEditorTabOptions, type CiBessProductRow } from '../types';

export function CiBessProductsEditor(props: {
  rows: CiBessProductRow[];
  form: Partial<CiBessProductRow>;
  setForm: (value: Partial<CiBessProductRow>) => void;
  onSave: (afterPersist?: () => void) => void;
  onDeactivate: (id: string) => void;
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
  const { formOpen, activeFormTab, setActiveFormTab, openNew, openEdit, close } =
    useCatalogEditorForm<CiBessProductRow>(emptyCiBessProduct, setForm);
  const [selectedStatus, setSelectedStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const [query, setQuery] = useState('');

  const statusOptions = useMemo(() => {
    const active = props.rows.filter((row) => row.active).length;
    return [
      { value: 'all', label: 'Todos', count: props.rows.length },
      { value: 'active', label: 'Ativos', count: active },
      { value: 'inactive', label: 'Inativos', count: props.rows.length - active },
    ];
  }, [props.rows]);

  const visibleRows = useMemo(() => {
    const byStatus =
      selectedStatus === 'all' ? props.rows : props.rows.filter((row) => row.active === (selectedStatus === 'active'));
    const q = query.trim().toLowerCase();
    if (!q) return byStatus;
    return byStatus.filter(
      (row) => row.model.toLowerCase().includes(q) || row.manufacturer.toLowerCase().includes(q)
    );
  }, [props.rows, selectedStatus, query]);

  return (
    <CatalogLayout
      title="Produtos C&I (BESS)"
      count={visibleRows.length}
      formOpen={formOpen}
      formTitle={form.id ? 'Editar produto C&I' : 'Novo produto C&I'}
      newLabel="Novo produto"
      onNew={openNew}
      onClose={close}
      search={
        <label className="relative block sm:w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Buscar produto C&I por modelo ou fabricante"
            className="pl-8 md:pl-8"
            placeholder="Buscar por modelo ou fabricante..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      }
      filter={
        <div className="rounded-lg border bg-card p-3">
          <SegmentedTabs
            label="Status"
            value={selectedStatus}
            options={statusOptions}
            onChange={(value) => setSelectedStatus(value as typeof selectedStatus)}
          />
        </div>
      }
      form={
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Modelo">
              <Input value={form.model ?? ''} onChange={(event) => setForm({ ...form, model: event.target.value })} />
            </Field>
            <Field label="Fabricante">
              <Input
                value={form.manufacturer ?? ''}
                onChange={(event) => setForm({ ...form, manufacturer: event.target.value })}
              />
            </Field>
          </div>
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
              <div className="space-y-3 rounded-lg border bg-background p-3">
                <p className="text-sm font-semibold">Especificação por módulo</p>
                <p className="text-xs text-muted-foreground">
                  Potência e capacidade de um único módulo — o motor multiplica pela quantidade escolhida no
                  projeto.
                </p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <NumberWithUnitField
                    label="Potência"
                    tip="Potência nominal de um módulo do produto."
                    icon={<Zap className="h-4 w-4" />}
                    unit="kW"
                    value={form.module_power_kw ?? 0}
                    onChange={(event) => setForm({ ...form, module_power_kw: toNumber(event.target.value) })}
                  />
                  <NumberWithUnitField
                    label="Capacidade"
                    tip="Energia nominal de um módulo do produto."
                    icon={<Battery className="h-4 w-4" />}
                    unit="kWh"
                    value={form.module_capacity_kwh ?? 0}
                    onChange={(event) => setForm({ ...form, module_capacity_kwh: toNumber(event.target.value) })}
                  />
                  <NumberWithUnitField
                    label="Eficiência"
                    tip="Eficiência de ciclo (round-trip). O motor deriva eficiência de carga/descarga pela raiz quadrada desse valor."
                    icon={<Gauge className="h-4 w-4" />}
                    unit="%"
                    value={form.efficiency_percent ?? 95}
                    onChange={(event) => setForm({ ...form, efficiency_percent: toNumber(event.target.value, 95) })}
                  />
                  <NumberWithUnitField
                    label="Garantia"
                    tip="Duração da garantia de fábrica, em anos."
                    icon={<ShieldCheck className="h-4 w-4" />}
                    unit="anos"
                    value={form.warranty_years ?? 10}
                    onChange={(event) => setForm({ ...form, warranty_years: Math.max(1, toNumber(event.target.value, 10)) })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <NumberWithUnitField
                    label="SOC mínimo"
                    tip="Percentual reservado do módulo. A energia útil é calculada descontando esse valor da capacidade."
                    unit="%"
                    value={form.soc_min_percent ?? 10}
                    onChange={(event) => setForm({ ...form, soc_min_percent: toNumber(event.target.value, 10) })}
                  />
                  <NumberWithUnitField
                    label="SOC máximo"
                    tip="Maior nível de carga permitido para o módulo."
                    unit="%"
                    value={form.soc_max_percent ?? 100}
                    onChange={(event) => setForm({ ...form, soc_max_percent: toNumber(event.target.value, 100) })}
                  />
                </div>
              </div>
            </>
          ) : (
            <ProductMediaFields
              table="ci_bess_products"
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
        description: row.manufacturer,
        badges: [row.active ? 'ativo' : 'inativo'],
        details: [
          ['Potência / Capacidade', `${row.module_power_kw} kW / ${row.module_capacity_kwh} kWh`],
          ['Eficiência', `${row.efficiency_percent}%`],
          ['SOC útil', `${row.soc_min_percent}% – ${row.soc_max_percent}%`],
          ['Garantia', `${row.warranty_years} anos`],
        ],
        media: <MediaSummary imageUrl={row.image_url} documents={row.documents} />,
        removing: props.removingIds.has(row.id),
        onEdit: () => openEdit(row),
        onDeactivate: row.active ? () => props.onDeactivate(row.id) : undefined,
        deactivateDescription: `O produto ${row.model} fica inativo e para de aparecer para os usuários — nenhum projeto que já o referencia é afetado.`,
      }))}
    />
  );
}
