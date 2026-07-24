'use client';

import { useEffect, useMemo, useState } from 'react';
import { Battery, Boxes, Cable, EyeOff, Loader2, Pencil, Plus, Save, Search, X, Zap } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDeleteButton } from '@/components/ui/confirm-delete-button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import {
  batteryQuantityBreakdown,
  buildRuleGeneratedSolutions,
  expansionModelSet,
  selectClasses,
  solutionTotalBatteryPorts,
  toNumber,
} from '../helpers';
import {
  Actions,
  DetailItem,
  EditorModal,
  Field,
  NumberWithUnitField,
  ProductQtyDetail,
  RemovingOverlay,
  SectionHeader,
  SegmentedTabs,
} from '../shared-ui';
import type {
  AccessoryRuleRow,
  BatteryRow,
  BatteryTopology,
  EssCompatibilityRuleRow,
  GeneratedSolutionPayload,
  GridTopology,
  InverterRow,
  SolutionRow,
} from '../types';

export function SolutionsEditor(props: {
  solutions: SolutionRow[];
  query: string;
  setQuery: (value: string) => void;
  form: Partial<SolutionRow>;
  setForm: (value: Partial<SolutionRow>) => void;
  accessories: { model: string | null; quantity: number }[];
  setAccessories: (value: { model: string | null; quantity: number }[]) => void;
  comments: string[];
  setComments: (value: string[]) => void;
  inverters: InverterRow[];
  batteries: BatteryRow[];
  accessoryRules: AccessoryRuleRow[];
  essRules: EssCompatibilityRuleRow[];
  onEdit: (row: SolutionRow) => void;
  onNew: () => void;
  onSave: (afterPersist?: () => void) => void;
  onApplyGenerated: (generatedSolutions: GeneratedSolutionPayload[], afterApply?: () => void, cleanupStale?: boolean) => void;
  onRemove: (id: string) => void;
  onDelete: (id: string) => void;
  onDeleteMany: (ids: string[]) => void;
  removingIds: Set<string>;
  saving: boolean;
}) {
  const { form, setForm } = props;
  const [formOpen, setFormOpen] = useState(false);
  const [mainTab, setMainTab] = useState<'approved' | 'generated'>('approved');
  const [selectedInverter, setSelectedInverter] = useState<string>('all');
  const [selectedBattery, setSelectedBattery] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const [applyingCode, setApplyingCode] = useState<string | null>(null);
  const [filterInverterModels, setFilterInverterModels] = useState<string[]>([]);
  const [filterBatteryModels, setFilterBatteryModels] = useState<string[]>([]);
  const [generatedQuery, setGeneratedQuery] = useState('');
  const [pendingGenerated, setPendingGenerated] = useState<GeneratedSolutionPayload[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const stored = localStorage.getItem('solax-admin-pending-generated');
      return stored ? (JSON.parse(stored) as GeneratedSolutionPayload[]) : [];
    } catch { return []; }
  });

  useEffect(() => {
    try { localStorage.setItem('solax-admin-pending-generated', JSON.stringify(pendingGenerated)); } catch {}
  }, [pendingGenerated]);

  const existingGeneratedCodes = useMemo(
    () =>
      new Set(
        props.solutions
          .filter((s) => s.source_file === 'generated-rules')
          .map((s) => s.solution_code)
      ),
    [props.solutions]
  );

  const pendingNewCount = pendingGenerated.filter((s) => !existingGeneratedCodes.has(s.solution_code)).length;
  const pendingUpdateCount = pendingGenerated.length - pendingNewCount;

  const filteredPending = useMemo(() => {
    const q = generatedQuery.trim().toLowerCase();
    if (!q) return pendingGenerated;
    return pendingGenerated.filter((s) =>
      s.solution_code.toLowerCase().includes(q) ||
      s.inverter_model.toLowerCase().includes(q) ||
      s.battery_model.toLowerCase().includes(q)
    );
  }, [pendingGenerated, generatedQuery]);

  const groupedGenerated = useMemo(() => {
    const byGrid = new Map<string, Map<string, GeneratedSolutionPayload[]>>();
    for (const s of filteredPending) {
      if (!byGrid.has(s.grid_topology)) byGrid.set(s.grid_topology, new Map());
      const byBatt = byGrid.get(s.grid_topology)!;
      if (!byBatt.has(s.battery_model)) byBatt.set(s.battery_model, []);
      byBatt.get(s.battery_model)!.push(s);
    }
    return byGrid;
  }, [filteredPending]);

  const gridTopologyLabel: Record<string, string> = {
    '1p_220V': 'Monofásico 220V',
    '2p_220V': 'Bifásico 220V',
    '3p_220V': 'Trifásico 220V',
    '3p_380V': 'Trifásico 380V',
  };

  const registeredInverterModels = useMemo(
    () => new Set(props.inverters.map((inverter) => inverter.model)),
    [props.inverters]
  );
  const registeredBatteryModels = useMemo(
    () => new Set(props.batteries.map((battery) => battery.model)),
    [props.batteries]
  );
  // Expansion/Slave models only exist as units 2..N of a Master's bank — they
  // can't be picked as the base model for a generated or manual combination.
  const selectableBatteries = useMemo(() => {
    const slaveModels = expansionModelSet(props.batteries);
    return props.batteries.filter((battery) => !slaveModels.has(battery.model));
  }, [props.batteries]);
  const catalogSolutions = useMemo(
    () =>
      props.solutions.filter(
        (solution) =>
          registeredInverterModels.has(solution.inverter_model) &&
          registeredBatteryModels.has(solution.battery_model)
      ),
    [props.solutions, registeredInverterModels, registeredBatteryModels]
  );

  const inverterGroups = useMemo(() => {
    const counts = new Map<string, number>();
    for (const solution of catalogSolutions) {
      counts.set(solution.inverter_model, (counts.get(solution.inverter_model) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([label, count]) => ({ value: label, label, count }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [catalogSolutions]);

  // Falls back to 'all' when the currently selected filter no longer matches a
  // registered product (e.g. the inverter/battery was renamed or removed elsewhere).
  const effectiveSelectedInverter =
    selectedInverter !== 'all' && !registeredInverterModels.has(selectedInverter) ? 'all' : selectedInverter;
  const effectiveSelectedBattery =
    (selectedBattery !== 'all' && !registeredBatteryModels.has(selectedBattery)) ||
    effectiveSelectedInverter !== selectedInverter
      ? 'all'
      : selectedBattery;

  const solutionsByInverter =
    effectiveSelectedInverter === 'all'
      ? catalogSolutions
      : catalogSolutions.filter((solution) => solution.inverter_model === effectiveSelectedInverter);

  const batteryGroups = useMemo(() => {
    const counts = new Map<string, number>();
    for (const solution of solutionsByInverter) {
      counts.set(solution.battery_model, (counts.get(solution.battery_model) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([label, count]) => ({ value: label, label, count }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [solutionsByInverter]);

  const solutionsByBattery =
    effectiveSelectedBattery === 'all'
      ? solutionsByInverter
      : solutionsByInverter.filter((solution) => solution.battery_model === effectiveSelectedBattery);

  const statusGroups = useMemo(() => {
    let active = 0, inactive = 0;
    for (const s of solutionsByBattery) {
      if (s.active) active++; else inactive++;
    }
    return { active, inactive };
  }, [solutionsByBattery]);

  const visibleSolutions =
    selectedStatus === 'all'
      ? solutionsByBattery
      : solutionsByBattery.filter((s) => (selectedStatus === 'active') === s.active);

  function openNew() {
    props.onNew();
    setFormOpen(true);
  }

  function openEdit(solution: SolutionRow) {
    props.onEdit(solution);
    setFormOpen(true);
  }

  const [generateWarning, setGenerateWarning] = useState<string | null>(null);

  function generateAndStore() {
    const invFilter = filterInverterModels.length > 0 ? new Set(filterInverterModels) : null;
    const batFilter = filterBatteryModels.length > 0 ? new Set(filterBatteryModels) : null;
    const newSolutions = buildRuleGeneratedSolutions({
      inverters: props.inverters,
      batteries: props.batteries,
      accessoryRules: props.accessoryRules,
      essRules: props.essRules,
      filterInverterModels: invFilter,
      filterBatteryModels: batFilter,
    });

    if (newSolutions.length === 0) {
      const hasFilter = invFilter || batFilter;
      setGenerateWarning(
        hasFilter
          ? 'Nenhuma combinação gerada para os modelos selecionados. Verifique se existem regras ESS ativas cobrindo esse inversor e bateria.'
          : 'Nenhuma combinação gerada. Verifique se existem regras ESS ativas com inversor, bateria e redes compatíveis.'
      );
      setMainTab('generated');
      return;
    }

    setGenerateWarning(null);
    setPendingGenerated((prev) => {
      // Keep pending solutions that fall outside the current filter scope —
      // they belong to other products and shouldn't be replaced.
      const toKeep = prev.filter((s) => {
        const coveredByFilter =
          (!invFilter || invFilter.has(s.inverter_model)) &&
          (!batFilter || batFilter.has(s.battery_model));
        return !coveredByFilter;
      });
      return [...toKeep, ...newSolutions];
    });
    setMainTab('generated');
  }

  function removePending(solutionCode: string) {
    setPendingGenerated((prev) => prev.filter((s) => s.solution_code !== solutionCode));
  }

  return (
    <div className="space-y-4">
      <section className="space-y-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <SectionHeader
            title="Combinações"
            count={mainTab === 'approved' ? visibleSolutions.length : filteredPending.length}
          />
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            {mainTab === 'approved' && (
              <>
                <label className="relative block sm:w-80">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    aria-label="Buscar combinações aprovadas"
                    className="pl-8 md:pl-8"
                    placeholder="Buscar código, inversor ou bateria"
                    value={props.query}
                    onChange={(event) => props.setQuery(event.target.value)}
                  />
                </label>
                <Button onClick={openNew}>
                  <Plus className="h-4 w-4" />
                  Nova combinação
                </Button>
                {visibleSolutions.length > 0 && (
                  <ConfirmDeleteButton
                    ariaLabel="Limpar todas as combinações filtradas"
                    title="Excluir combinações filtradas?"
                    description={`${visibleSolutions.length} combinação${visibleSolutions.length > 1 ? 'ões' : ''} correspondente${visibleSolutions.length > 1 ? 's' : ''} ao filtro atual será${visibleSolutions.length > 1 ? 'ão' : ''} removida${visibleSolutions.length > 1 ? 's' : ''} permanentemente.`}
                    confirmLabel="Excluir todas"
                    label="Limpar todas"
                    disabled={props.saving}
                    onConfirm={() => props.onDeleteMany(visibleSolutions.map((s) => s.id))}
                  />
                )}
              </>
            )}
            {mainTab === 'generated' && (
              <>
                <label className="relative block sm:w-80">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    aria-label="Buscar combinações geradas"
                    className="pl-8 md:pl-8"
                    placeholder="Buscar código, inversor ou bateria"
                    value={generatedQuery}
                    onChange={(event) => setGeneratedQuery(event.target.value)}
                  />
                </label>
                <Button onClick={generateAndStore} disabled={props.saving}>
                  <Zap className="h-4 w-4" />
                  {pendingGenerated.length > 0 ? 'Gerar novamente' : 'Gerar combinações'}
                </Button>
              </>
            )}
          </div>
        </div>

        <div className="flex gap-1 w-fit rounded-lg border bg-card p-1">
          <button
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${mainTab === 'approved' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            onClick={() => setMainTab('approved')}
          >
            Aprovadas ({catalogSolutions.length})
          </button>
          <button
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${mainTab === 'generated' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            onClick={() => setMainTab('generated')}
          >
            Geradas{pendingGenerated.length > 0 ? ` (${pendingGenerated.length})` : ''}
          </button>
        </div>

        {mainTab === 'approved' && (
          <>
            <div className="space-y-3 rounded-lg border bg-card p-3">
              <SegmentedTabs
                label="Inversor"
                value={effectiveSelectedInverter}
                options={[{ value: 'all', label: 'Todos', count: catalogSolutions.length }, ...inverterGroups]}
                onChange={(value) => {
                  setSelectedInverter(value);
                  setSelectedBattery('all');
                  setSelectedStatus('all');
                }}
              />
              <SegmentedTabs
                label="Bateria"
                value={effectiveSelectedBattery}
                options={[{ value: 'all', label: 'Todas', count: solutionsByInverter.length }, ...batteryGroups]}
                onChange={(value) => {
                  setSelectedBattery(value);
                  setSelectedStatus('all');
                }}
              />
              {(statusGroups.active > 0 && statusGroups.inactive > 0) && (
                <SegmentedTabs
                  label="Status"
                  value={selectedStatus}
                  options={[
                    { value: 'all', label: 'Todas', count: solutionsByBattery.length },
                    { value: 'active', label: 'Ativas', count: statusGroups.active },
                    { value: 'inactive', label: 'Inativas', count: statusGroups.inactive },
                  ]}
                  onChange={(v) => setSelectedStatus(v as 'all' | 'active' | 'inactive')}
                />
              )}
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              {visibleSolutions.map((solution) => {
                const removing = props.removingIds.has(solution.id);
                const comments = (solution.comments ?? []).filter((comment) => comment.trim());
                return (
                  <Card key={solution.id} size="sm" className={removing ? 'relative opacity-70' : 'relative'}>
                    {removing && <RemovingOverlay label="Removendo..." />}
                    <CardHeader>
                      <div className="flex min-w-0 items-start justify-between gap-3">
                        <div className="min-w-0">
                          <CardTitle className="truncate">{solution.solution_code}</CardTitle>
                          <p className="truncate text-xs text-muted-foreground">{solution.source_file}</p>
                        </div>
                        <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${solution.active ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400' : 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-400'}`}>
                          {solution.active ? 'ativa' : 'inativa'}
                        </span>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="space-y-2 text-sm">
                        <div className="grid grid-cols-2 gap-3">
                          <ProductQtyDetail
                            label="Inversor"
                            model={solution.inverter_model}
                            quantity={solution.inverter_quantity}
                          />
                          <ProductQtyDetail
                            label="Bateria"
                            model={solution.battery_model}
                            quantity={solution.battery_quantity}
                            breakdown={batteryQuantityBreakdown(solution.battery_model, solution.battery_quantity, props.batteries)}
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <DetailItem label="Potência nominal" value={`${(solution.rated_power_w / 1000).toFixed(1)} kVA`} />
                          <DetailItem label="Potência pico" value={`${(solution.peak_power_w / 1000).toFixed(1)} kVA`} />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <DetailItem label="Potência bateria" value={`${(solution.battery_power_w / 1000).toFixed(1)} kW`} />
                          <DetailItem label="Energia bateria" value={`${(solution.available_energy_wh / 1000).toFixed(1)} kWh`} />
                        </div>
                      </div>
                      {comments.length > 0 && (
                        <div className="rounded-lg border bg-muted/30 px-3 py-2">
                          <p className="text-xs font-medium text-muted-foreground">Comentários</p>
                          <ul className="mt-1 space-y-1 text-xs text-foreground">
                            {comments.map((comment) => (
                              <li key={comment} className="line-clamp-2">
                                {comment}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      <div className="flex flex-wrap gap-2">
                        <Button variant="outline" size="sm" onClick={() => openEdit(solution)}>
                          <Pencil className="h-4 w-4" />
                          Editar
                        </Button>
                        <ConfirmDeleteButton
                          ariaLabel={`Inativar combinação ${solution.solution_code}`}
                          title="Inativar combinação?"
                          description="A combinação ficará inativa e deixará de ser usada nas recomendações."
                          confirmLabel="Inativar"
                          icon={<EyeOff className="h-4 w-4" />}
                          disabled={removing}
                          onConfirm={() => props.onRemove(solution.id)}
                        />
                        <ConfirmDeleteButton
                          ariaLabel={`Excluir combinação ${solution.solution_code}`}
                          title="Excluir combinação?"
                          description="A combinação será removida permanentemente do cadastro."
                          confirmLabel="Excluir"
                          disabled={removing}
                          onConfirm={() => props.onDelete(solution.id)}
                        />
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
              {visibleSolutions.length === 0 && (
                <div className="rounded-lg border border-dashed bg-background p-6 text-sm text-muted-foreground md:col-span-2 2xl:col-span-3">
                  Nenhuma combinação encontrada para o agrupamento selecionado.
                </div>
              )}
            </div>
          </>
        )}

        {mainTab === 'generated' && (
          <div className="space-y-4">
            {/* Generation filter panel */}
            <div className="rounded-lg border bg-card p-4 space-y-3">
              <div className="space-y-3">
                <div className="space-y-3 min-w-0">
                  <div className="space-y-1.5">
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Inversores</span>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        onClick={() => setFilterInverterModels([])}
                        className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${filterInverterModels.length === 0 ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background text-muted-foreground hover:text-foreground'}`}
                      >
                        Todos
                      </button>
                      {props.inverters.map((inv) => (
                        <button
                          key={inv.model}
                          onClick={() => setFilterInverterModels((prev) =>
                            prev.includes(inv.model) ? prev.filter((m) => m !== inv.model) : [...prev, inv.model]
                          )}
                          className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${filterInverterModels.includes(inv.model) ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background text-muted-foreground hover:text-foreground'}`}
                        >
                          {inv.model}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Baterias</span>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        onClick={() => setFilterBatteryModels([])}
                        className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${filterBatteryModels.length === 0 ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background text-muted-foreground hover:text-foreground'}`}
                      >
                        Todas
                      </button>
                      {selectableBatteries.map((bat) => (
                        <button
                          key={bat.model}
                          onClick={() => setFilterBatteryModels((prev) =>
                            prev.includes(bat.model) ? prev.filter((m) => m !== bat.model) : [...prev, bat.model]
                          )}
                          className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${filterBatteryModels.includes(bat.model) ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background text-muted-foreground hover:text-foreground'}`}
                        >
                          {bat.model}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              {generateWarning && (
                <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                  {generateWarning}
                </p>
              )}
            </div>

            {pendingGenerated.length === 0 ? (
              <div className="rounded-lg border border-dashed bg-background p-6 text-center">
                <p className="text-sm text-muted-foreground">Nenhuma combinação pendente.</p>
                <p className="mt-1 text-xs text-muted-foreground">Configure os filtros acima e clique em &quot;Gerar combinações&quot;.</p>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex gap-4 text-sm text-muted-foreground">
                    <span><span className="font-medium text-foreground">{filteredPending.length}</span>{generatedQuery ? ` de ${pendingGenerated.length}` : ''} pendentes</span>
                    {pendingNewCount > 0 && <span><span className="font-medium text-foreground">{pendingNewCount}</span> novas</span>}
                    {pendingUpdateCount > 0 && <span><span className="font-medium text-foreground">{pendingUpdateCount}</span> atualizações</span>}
                  </div>
                  <Button
                    onClick={() => props.onApplyGenerated(pendingGenerated, () => setPendingGenerated([]), true)}
                    disabled={props.saving}
                  >
                    <Save className="h-4 w-4" />
                    Aprovar todas ({pendingGenerated.length})
                  </Button>
                </div>

                {Array.from(groupedGenerated.entries())
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([grid, byBattery]) => (
                    <div key={grid} className="space-y-2">
                      <div className="flex items-center gap-2 pt-1">
                        <h3 className="text-sm font-semibold">{gridTopologyLabel[grid] ?? grid}</h3>
                        <span className="text-xs text-muted-foreground">
                          · {Array.from(byBattery.values()).reduce((n, arr) => n + arr.length, 0)} combinações
                        </span>
                      </div>

                      {Array.from(byBattery.entries())
                        .sort(([a], [b]) => a.localeCompare(b))
                        .map(([battery, solutions]) => (
                          <div key={battery} className="rounded-lg border">
                            <div className="flex items-center justify-between border-b bg-muted/40 px-4 py-2">
                              <span className="text-sm font-medium">{battery}</span>
                              <span className="text-xs text-muted-foreground">
                                {solutions.length} combinação{solutions.length !== 1 ? 'ões' : ''}
                              </span>
                            </div>
                            <div className="divide-y">
                              {solutions.map((solution) => {
                                const isNew = !existingGeneratedCodes.has(solution.solution_code);
                                const isApplying = applyingCode === solution.solution_code;
                                return (
                                  <div key={solution.solution_code} className="flex items-start gap-3 p-3 sm:items-center">
                                    <div className="min-w-0 flex-1 space-y-1">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <span className="text-sm font-medium">{solution.solution_code}</span>
                                        <Badge variant={isNew ? 'default' : 'outline'}>
                                          {isNew ? 'Nova' : 'Atualização'}
                                        </Badge>
                                      </div>
                                      <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                                        <span>Inv ×{solution.inverter_quantity}</span>
                                        <span>
                                          Portas ×{solution.battery_ports_used}/inversor ({solutionTotalBatteryPorts(solution)} no total)
                                        </span>
                                        <span>Bat ×{solution.battery_quantity} · {solution.battery_topology}</span>
                                        <span>{(solution.rated_power_w / 1000).toFixed(1)} kVA / {(solution.peak_power_w / 1000).toFixed(1)} kVA pico</span>
                                        <span>{(solution.available_energy_wh / 1000).toFixed(1)} kWh</span>
                                        {solution.accessories.length > 0 && (
                                          <span>{solution.accessories.map((a) => `${a.model} ×${a.quantity}`).join(', ')}</span>
                                        )}
                                      </div>
                                    </div>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      disabled={props.saving}
                                      onClick={() => {
                                        setApplyingCode(solution.solution_code);
                                        props.onApplyGenerated([solution], () => {
                                          setApplyingCode(null);
                                          removePending(solution.solution_code);
                                          setMainTab('generated');
                                        });
                                      }}
                                    >
                                      {isApplying
                                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                        : <Save className="h-3.5 w-3.5" />}
                                      Aprovar
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon-sm"
                                      aria-label={`Descartar combinação ${solution.solution_code}`}
                                      disabled={props.saving}
                                      onClick={() => removePending(solution.solution_code)}
                                    >
                                      <X className="h-3.5 w-3.5" />
                                    </Button>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                    </div>
                  ))}
              </>
            )}
          </div>
        )}
      </section>

      <EditorModal
        open={formOpen}
        title={form.id ? 'Editar combinação' : 'Nova combinação'}
        onClose={() => setFormOpen(false)}
        size="lg"
      >
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
            <NumberWithUnitField
              label="Qtd. inversores"
              tip="Quantidade de inversores usados nesta combinação aprovada."
              icon={<Boxes className="h-4 w-4" />}
              unit="un."
              value={form.inverter_quantity ?? 1}
              onChange={(event) => setForm({ ...form, inverter_quantity: toNumber(event.target.value, 1) })}
            />
            <NumberWithUnitField
              label="Portas por inversor"
              tip="Número de portas de bateria em uso em CADA inversor — não o total da combinação. O total (usado para escalar acessórios e a quebra Master/Slave) é Qtd. inversores × este valor."
              icon={<Cable className="h-4 w-4" />}
              unit="un."
              value={form.battery_ports_used ?? 1}
              onChange={(event) => setForm({ ...form, battery_ports_used: toNumber(event.target.value, 1) })}
            />
            <NumberWithUnitField
              label="Potência nominal"
              tip="Potência nominal total disponível na combinação."
              icon={<Zap className="h-4 w-4" />}
              unit="VA"
              value={form.rated_power_w ?? 0}
              onChange={(event) => setForm({ ...form, rated_power_w: toNumber(event.target.value) })}
            />
            <NumberWithUnitField
              label="Potência pico"
              tip="Potência máxima de pico disponível na combinação."
              icon={<Zap className="h-4 w-4" />}
              unit="VA"
              value={form.peak_power_w ?? 0}
              onChange={(event) => setForm({ ...form, peak_power_w: toNumber(event.target.value) })}
            />
            <NumberWithUnitField
              label="Tensão"
              tip="Tensão nominal de saída da combinação."
              icon={<Cable className="h-4 w-4" />}
              unit="V"
              value={form.nominal_voltage_v ?? 220}
              onChange={(event) => setForm({ ...form, nominal_voltage_v: toNumber(event.target.value, 220) })}
            />
            <Field label="Rede">
              <select
                className={selectClasses()}
                value={form.grid_topology ?? '1p_220V'}
                onChange={(event) => setForm({ ...form, grid_topology: event.target.value as GridTopology })}
              >
                <option value="1p_220V">1p 220V</option>
                <option value="2p_220V">2p 220V</option>
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
            <NumberWithUnitField
              label="Qtd. baterias"
              tip="Quantidade total de baterias nesta combinação."
              icon={<Battery className="h-4 w-4" />}
              unit="un."
              value={form.battery_quantity ?? 1}
              onChange={(event) => setForm({ ...form, battery_quantity: toNumber(event.target.value, 1) })}
            />
            <NumberWithUnitField
              label="Potência bateria"
              tip="Potência total disponível pelo banco de baterias."
              icon={<Zap className="h-4 w-4" />}
              unit="W"
              value={form.battery_power_w ?? 0}
              onChange={(event) => setForm({ ...form, battery_power_w: toNumber(event.target.value) })}
            />
            <NumberWithUnitField
              label="Energia disponível"
              tip="Energia útil disponível no banco de baterias."
              icon={<Battery className="h-4 w-4" />}
              unit="Wh"
              value={form.available_energy_wh ?? 0}
              onChange={(event) => setForm({ ...form, available_energy_wh: toNumber(event.target.value) })}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">Acessórios</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => props.setAccessories([...props.accessories, { model: '', quantity: 1 }])}
              >
                <Plus className="h-3.5 w-3.5" />
                Adicionar
              </Button>
            </div>
            {props.accessories.length === 0 ? (
              <p className="rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground">Nenhum acessório</p>
            ) : (
              <div className="space-y-2">
                {props.accessories.map((acc, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <input
                      list="admin-accessories"
                      placeholder="Modelo do acessório"
                      value={acc.model ?? ''}
                      onChange={(event) => {
                        const next = [...props.accessories];
                        next[index] = { ...acc, model: event.target.value };
                        props.setAccessories(next);
                      }}
                      className="h-8 min-w-0 flex-1 rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                    />
                    <input
                      type="number"
                      min={1}
                      value={acc.quantity}
                      onChange={(event) => {
                        const next = [...props.accessories];
                        next[index] = { ...acc, quantity: Math.max(1, Number(event.target.value)) };
                        props.setAccessories(next);
                      }}
                      className="h-8 w-16 shrink-0 rounded-lg border border-input bg-background px-2 text-center text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Remover acessório"
                      onClick={() => props.setAccessories(props.accessories.filter((_, i) => i !== index))}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">Comentários</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => props.setComments([...props.comments, ''])}
              >
                <Plus className="h-3.5 w-3.5" />
                Adicionar
              </Button>
            </div>
            {props.comments.length === 0 ? (
              <p className="rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground">Nenhum comentário</p>
            ) : (
              <div className="space-y-2">
                {props.comments.map((comment, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <input
                      placeholder="Texto do comentário"
                      value={comment}
                      onChange={(event) => {
                        const next = [...props.comments];
                        next[index] = event.target.value;
                        props.setComments(next);
                      }}
                      className="h-8 min-w-0 flex-1 rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Remover comentário"
                      onClick={() => props.setComments(props.comments.filter((_, i) => i !== index))}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.active ?? true}
              onChange={(event) => setForm({ ...form, active: event.target.checked })}
            />
            Ativa para recomendação
          </label>
          <Actions onSave={() => props.onSave(() => setFormOpen(false))} saving={props.saving} />
      </EditorModal>

      <datalist id="admin-inverters">
        {props.inverters.map((inverter) => (
          <option key={inverter.id} value={inverter.model} />
        ))}
      </datalist>
      <datalist id="admin-batteries">
        {selectableBatteries.map((battery) => (
          <option key={battery.id} value={battery.model} />
        ))}
      </datalist>
      <datalist id="admin-accessories">
        {Array.from(new Set(props.accessoryRules.map((r) => r.accessories?.model).filter(Boolean))).map((model) => (
          <option key={model} value={model ?? ''} />
        ))}
      </datalist>
    </div>
  );
}
