'use client';

import { useMemo, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Button } from '@/components/ui/button';
import { ConfirmDeleteButton } from '@/components/ui/confirm-delete-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, ChevronDown, Clock, Plus } from 'lucide-react';
import { ACCOUNT_LIMITS, isLimitError, limitReachedMessage } from '@/lib/limits';
import { gridTypePhaseCount, gridTypePhaseToPhaseVoltages, gridTypeVoltages, loadPhases, totalPowerByPhase, useWizardStore } from '@/lib/store/wizard-store';
import type { CatalogItem, LoadPresetLoad, LoadPhase, LoadVoltage, SingleLoad } from '@/lib/types';
import { cn } from '@/lib/utils';
import { InfoLabel } from '@/components/ui/tooltip';
import { SearchInput } from '@/components/app/shared-ui';
import { AddLoadTile } from './load-selector/AddLoadTile';
import { LoadCard } from './load-selector/LoadCard';
import { MAX_OPERATION_HOURS, MINE_FILTER, loadMatchesPhase, newLoad } from './load-selector/load-selector-utils';
import { PeakModeButton } from './load-selector/PeakModeButton';
import { PhaseDot } from './load-selector/phase-indicators';
import { PresetCard } from './load-selector/PresetCard';
import { UserLoadCatalogItemMenu } from './load-selector/UserLoadCatalogItemMenu';

export function LoadSelector({ defaultToMine = false }: { defaultToMine?: boolean } = {}) {
  const t = useTranslations('loads');
  const locale = useLocale();

  const {
    residentialOptions,
    loadCatalog,
    loadPresets,
    userLoadPresets,
    userLoadCatalog,
    addLoad,
    removeLoad,
    updateLoad,
    setPeakCalcMode,
    setOperationHours,
    saveManualLoadToCatalog,
    updateUserLoadCatalogItem,
    removeUserLoadCatalogItem,
    saveLoadsAsPreset,
    removeUserLoadPreset,
  } = useWizardStore();

  const gridType = residentialOptions.gridType;
  const maxPowerPerPhaseW = residentialOptions.maxPowerPerPhaseW;
  const phaseTotals = totalPowerByPhase(residentialOptions.loads);

  const [sectionOpen, setSectionOpen] = useState(true);
  const [activeSubTab, setActiveSubTab] = useState<'presets' | 'catalog'>('presets');
  const [presetsSubTab, setPresetsSubTab] = useState<'system' | 'mine'>('system');
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(() =>
    defaultToMine && userLoadCatalog.length > 0 ? MINE_FILTER : null
  );
  const [catalogSaveWarning, setCatalogSaveWarning] = useState<string | null>(null);
  const [loadLimitMessage, setLoadLimitMessage] = useState<string | null>(null);
  const [savePresetOpen, setSavePresetOpen] = useState(false);
  const [selectedLoadIdsForPreset, setSelectedLoadIdsForPreset] = useState<Set<string>>(new Set());
  const [presetName, setPresetName] = useState('');
  const [dragOverPhase, setDragOverPhase] = useState<LoadPhase | null>(null);
  const [phaseFilter, setPhaseFilter] = useState<LoadPhase | 'all'>('all');

  const handleSubTabClick = (tab: 'presets' | 'catalog') => {
    if (activeSubTab === tab) {
      setSectionOpen((current) => !current);
      return;
    }
    setActiveSubTab(tab);
    setSectionOpen(true);
  };

  const visiblePhases = gridType ? loadPhases.slice(0, gridTypePhaseCount[gridType]) : [];
  const effectivePhaseFilter: LoadPhase | 'all' =
    phaseFilter !== 'all' && visiblePhases.includes(phaseFilter) ? phaseFilter : 'all';
  const visibleLoads =
    effectivePhaseFilter === 'all'
      ? residentialOptions.loads
      : residentialOptions.loads.filter((load) => loadMatchesPhase(load, effectivePhaseFilter));
  const [presetDescription, setPresetDescription] = useState('');
  const [savingPreset, setSavingPreset] = useState(false);
  const [presetSaveError, setPresetSaveError] = useState<string | null>(null);

  const nameKey = locale === 'zh' ? 'nameZh' : locale === 'en' ? 'nameEn' : 'namePt';

  const categories = useMemo(
    () => Array.from(new Set(loadCatalog.map((item) => item.category))).sort(),
    [loadCatalog]
  );

  const filtered = loadCatalog.filter((item) => {
    if (selectedCategory === MINE_FILTER) return false;
    const matchesSearch = item[nameKey as keyof CatalogItem]
      ?.toString()
      .toLowerCase()
      .includes(search.toLowerCase());
    const matchesCategory = !selectedCategory || item.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const filteredUserItems = userLoadCatalog.filter((item) => {
    if (selectedCategory && selectedCategory !== MINE_FILTER) return false;
    return item.name.toLowerCase().includes(search.toLowerCase());
  });

  function handleAddBlank() {
    // When adding from a phase-filtered tab (L1/L2/L3), connect the new
    // blank load to that phase — otherwise it'd default to L1 and vanish
    // from the current filter the moment it's created.
    const phase = effectivePhaseFilter !== 'all' ? effectivePhaseFilter : undefined;
    const added = addLoad(
      newLoad({ name: '', powerW: 0, qty: 1, ipInRatio: 1, ...(phase ? { phase } : {}) })
    );
    setLoadLimitMessage(added ? null : limitReachedMessage('cargas neste projeto', ACCOUNT_LIMITS.loadsPerProject));
  }

  function handleDuplicateLoad(load: SingleLoad) {
    const added = addLoad({ ...load, id: crypto.randomUUID() });
    setLoadLimitMessage(added ? null : limitReachedMessage('cargas neste projeto', ACCOUNT_LIMITS.loadsPerProject));
  }

  function handleAddFromCatalog(item: CatalogItem) {
    const added = addLoad(
      newLoad({
        name: item[nameKey as keyof CatalogItem] as string,
        powerW: item.powerW,
        qty: 1,
        ipInRatio: item.ipInRatio ?? 1,
      })
    );
    setLoadLimitMessage(added ? null : limitReachedMessage('cargas neste projeto', ACCOUNT_LIMITS.loadsPerProject));
  }

  function handleAddFromUserCatalog(item: (typeof userLoadCatalog)[number]) {
    const added = addLoad(
      newLoad({
        name: item.name,
        powerW: item.powerW,
        qty: 1,
        ipInRatio: item.ipInRatio,
      })
    );
    setLoadLimitMessage(added ? null : limitReachedMessage('cargas neste projeto', ACCOUNT_LIMITS.loadsPerProject));
  }

  function handleAddPreset(preset: { loads: LoadPresetLoad[] }) {
    const remaining = ACCOUNT_LIMITS.loadsPerProject - residentialOptions.loads.length;
    if (preset.loads.length > remaining) {
      setLoadLimitMessage(
        remaining > 0
          ? `Esta predefinição tem ${preset.loads.length} cargas, mas só cabem mais ${remaining} neste projeto (limite de ${ACCOUNT_LIMITS.loadsPerProject}).`
          : limitReachedMessage('cargas neste projeto', ACCOUNT_LIMITS.loadsPerProject)
      );
      return;
    }
    setLoadLimitMessage(null);
    preset.loads.forEach((load) => addLoad(newLoad(load)));
  }

  async function handleSaveCurrentAsPreset() {
    const selectedLoads = residentialOptions.loads.filter((load) => selectedLoadIdsForPreset.has(load.id));
    if (!presetName.trim() || selectedLoads.length === 0) return;
    setSavingPreset(true);
    setPresetSaveError(null);
    try {
      await saveLoadsAsPreset({
        name: presetName.trim(),
        description: presetDescription.trim(),
        loads: selectedLoads.map((load) => ({
          name: load.name,
          powerW: load.powerW,
          qty: load.qty,
          ipInRatio: load.ipInRatio,
        })),
      });
      setSavePresetOpen(false);
      setPresetName('');
      setPresetDescription('');
      setSelectedLoadIdsForPreset(new Set());
    } catch (error) {
      setPresetSaveError(isLimitError(error) ? error.message : 'Não foi possível salvar a predefinição. Tente novamente.');
    } finally {
      setSavingPreset(false);
    }
  }

  function toggleLoadForPreset(loadId: string) {
    setSelectedLoadIdsForPreset((current) => {
      const next = new Set(current);
      if (next.has(loadId)) next.delete(loadId);
      else next.add(loadId);
      return next;
    });
  }

  const presetsSummary = `${loadPresets.length} do sistema · ${userLoadPresets.length} seu(s)`;
  const catalogSummary = `${loadCatalog.length + userLoadCatalog.length} itens`;
  const sectionSummary = `${presetsSummary} · ${catalogSummary}`;

  return (
    <div className="space-y-4">
      {loadLimitMessage && (
        <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {loadLimitMessage}
        </p>
      )}

      <div className="rounded-lg border bg-background p-3">
        <Label htmlFor="operationHours" className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Clock className="h-3.5 w-3.5 shrink-0" />
          <InfoLabel
            label="Tempo de operação"
            tip="Tempo compartilhado por todas as cargas durante o backup. Cada carga usa o próprio percentual de uso para escalar sua energia dentro desse tempo."
          />
        </Label>
        <div className="mt-2 flex items-center gap-2">
          <Input
            id="operationHours"
            type="number"
            min={0}
            max={MAX_OPERATION_HOURS}
            step={0.5}
            placeholder="Ex.: 4"
            className="max-w-28"
            value={residentialOptions.operationHours || ''}
            onChange={(event) => {
              const value = Number(event.target.value) || 0;
              setOperationHours(Math.min(MAX_OPERATION_HOURS, Math.max(0, value)));
            }}
          />
          <span className="text-sm text-muted-foreground">horas (máx. {MAX_OPERATION_HOURS} h)</span>
        </div>
        {!residentialOptions.operationHours && (
          <p className="mt-2 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Informe o tempo de operação para calcular a energia das cargas.
          </p>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSectionOpen((current) => !current)}
            aria-expanded={sectionOpen}
            aria-label={sectionOpen ? 'Recolher cargas' : 'Expandir cargas'}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 md:h-8 md:w-8"
          >
            <ChevronDown className={cn('h-4 w-4 transition-transform', !sectionOpen && '-rotate-90')} />
          </button>
          <div className="flex flex-1 gap-1 rounded-md bg-muted/60 p-0.5" role="tablist" aria-label="Cargas">
            <button
              type="button"
              role="tab"
              aria-selected={activeSubTab === 'presets'}
              onClick={() => handleSubTabClick('presets')}
              className={cn(
                'flex h-10 flex-1 items-center justify-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 md:h-8',
                activeSubTab === 'presets'
                  ? 'bg-background text-foreground shadow-sm ring-1 ring-border/70'
                  : 'text-muted-foreground hover:bg-background/60 hover:text-foreground'
              )}
            >
              Predefinições
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeSubTab === 'catalog'}
              onClick={() => handleSubTabClick('catalog')}
              className={cn(
                'flex h-10 flex-1 items-center justify-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 md:h-8',
                activeSubTab === 'catalog'
                  ? 'bg-background text-foreground shadow-sm ring-1 ring-border/70'
                  : 'text-muted-foreground hover:bg-background/60 hover:text-foreground'
              )}
            >
              {t('catalog')}
            </button>
          </div>
        </div>
        {!sectionOpen && <p className="pl-10 text-xs text-muted-foreground md:pl-9">{sectionSummary}</p>}
        {sectionOpen && (
        <div className="space-y-3">
          {activeSubTab === 'presets' && (
          <div className="space-y-3">
            {!savePresetOpen && (
            <div className="flex gap-4 border-b" role="tablist" aria-label="Predefinições">
              <button
                type="button"
                role="tab"
                aria-selected={presetsSubTab === 'system'}
                onClick={() => setPresetsSubTab('system')}
                className={cn(
                  '-mb-px border-b-2 px-0.5 pb-1.5 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                  presetsSubTab === 'system'
                    ? 'border-primary text-foreground'
                    : 'border-transparent text-muted-foreground hover:border-muted-foreground/30 hover:text-foreground'
                )}
              >
                Predefinições do sistema
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={presetsSubTab === 'mine'}
                onClick={() => setPresetsSubTab('mine')}
                className={cn(
                  '-mb-px border-b-2 px-0.5 pb-1.5 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                  presetsSubTab === 'mine'
                    ? 'border-primary text-foreground'
                    : 'border-transparent text-muted-foreground hover:border-muted-foreground/30 hover:text-foreground'
                )}
              >
                Minhas predefinições ({userLoadPresets.length}/{ACCOUNT_LIMITS.userPresets})
              </button>
            </div>
            )}

            {!savePresetOpen && presetsSubTab === 'system' && (
              <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                {loadPresets.map((preset) => (
                  <PresetCard
                    key={preset.id}
                    preset={preset}
                    onAdd={() => handleAddPreset(preset)}
                    operationHours={residentialOptions.operationHours}
                  />
                ))}
              </div>
            )}

            {(savePresetOpen || presetsSubTab === 'mine') && (
            <div className="space-y-2">
              <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                {savePresetOpen ? (
                  <div className="space-y-3 rounded-lg border bg-card p-3 lg:col-span-2">
                    <p className="text-xs text-muted-foreground">
                      Clique nas cargas cadastradas abaixo para incluí-las ou tirá-las da predefinição.
                    </p>
                    <Input
                      aria-label="Nome da predefinição"
                      placeholder="Nome da predefinição"
                      value={presetName}
                      onChange={(event) => setPresetName(event.target.value)}
                    />
                    <Input
                      aria-label="Descrição da predefinição"
                      placeholder="Descrição (opcional)"
                      value={presetDescription}
                      onChange={(event) => setPresetDescription(event.target.value)}
                    />

                    {presetSaveError && <p className="text-xs text-destructive">{presetSaveError}</p>}
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        disabled={!presetName.trim() || selectedLoadIdsForPreset.size === 0 || savingPreset}
                        onClick={handleSaveCurrentAsPreset}
                      >
                        {savingPreset ? 'Salvando...' : 'Salvar'}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSavePresetOpen(false);
                          setPresetSaveError(null);
                          setSelectedLoadIdsForPreset(new Set());
                        }}
                      >
                        Cancelar
                      </Button>
                    </div>
                  </div>
                ) : (
                  userLoadPresets.length < ACCOUNT_LIMITS.userPresets && (
                    <button
                      type="button"
                      disabled={residentialOptions.loads.length === 0}
                      onClick={() => {
                        const selectableLoadIds = residentialOptions.loads
                          .filter((load) => load.name.trim() && load.powerW > 0)
                          .map((load) => load.id);
                        setSelectedLoadIdsForPreset(new Set(selectableLoadIds));
                        setSavePresetOpen(true);
                      }}
                      className="flex min-h-[88px] flex-col items-center justify-center gap-1 self-start rounded-lg border border-dashed p-3 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Plus className="h-5 w-5" />
                      Adicionar predefinição
                    </button>
                  )
                )}

                {!savePresetOpen && userLoadPresets.map((preset) => (
                  <div key={preset.id} className="relative">
                    <PresetCard
                      preset={preset}
                      onAdd={() => handleAddPreset(preset)}
                      withDeleteSpacing
                      operationHours={residentialOptions.operationHours}
                    />
                    <div className="absolute right-2 top-2">
                      <ConfirmDeleteButton
                        ariaLabel={`Remover predefinição ${preset.name}`}
                        title="Remover predefinição?"
                        description={`A predefinição "${preset.name}" será removida definitivamente.`}
                        confirmLabel="Remover"
                        onConfirm={() => removeUserLoadPreset(preset.id)}
                      />
                    </div>
                  </div>
                ))}
              </div>

              {userLoadPresets.length === 0 && !savePresetOpen && (
                <p className="text-xs text-muted-foreground">
                  Nenhuma predefinição pessoal ainda. Monte as cargas do projeto e salve como predefinição para reutilizar depois.
                </p>
              )}
            </div>
            )}
          </div>
          )}

          {activeSubTab === 'catalog' && (
          <div className="space-y-2">
            <SearchInput value={search} onChange={setSearch} placeholder={t('search_placeholder')} />

            {categories.length > 0 && (
              <div className="flex flex-wrap gap-x-4 gap-y-1 border-b">
                {userLoadCatalog.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedCategory((current) => (current === MINE_FILTER ? null : MINE_FILTER))}
                    className={cn(
                      '-mb-px border-b-2 px-0.5 pb-1.5 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                      selectedCategory === MINE_FILTER
                        ? 'border-primary text-foreground'
                        : 'border-transparent text-muted-foreground hover:border-muted-foreground/30 hover:text-foreground'
                    )}
                  >
                    Minhas
                  </button>
                )}
                {categories.map((category) => (
                  <button
                    key={category}
                    type="button"
                    onClick={() => setSelectedCategory((current) => (current === category ? null : category))}
                    className={cn(
                      '-mb-px border-b-2 px-0.5 pb-1.5 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                      selectedCategory === category
                        ? 'border-primary text-foreground'
                        : 'border-transparent text-muted-foreground hover:border-muted-foreground/30 hover:text-foreground'
                    )}
                  >
                    {category}
                  </button>
                ))}
              </div>
            )}

            {catalogSaveWarning && (
              <p className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                {catalogSaveWarning}
              </p>
            )}

            <div className="grid max-h-72 grid-cols-1 gap-1.5 overflow-y-auto sm:grid-cols-2">
              {filteredUserItems.map((item) => (
                <div
                  key={`user-${item.id}`}
                  className="flex items-center gap-1 rounded-md border bg-card py-1 pl-2 pr-1 transition-colors hover:border-primary/50 hover:bg-primary/10"
                >
                  <button
                    type="button"
                    onClick={() => handleAddFromUserCatalog(item)}
                    className="flex min-w-0 flex-1 items-center justify-between gap-2 py-0.5 text-left text-sm focus-visible:outline-none"
                  >
                    <span className="flex min-w-0 items-center gap-1.5">
                      <Badge variant="secondary" className="shrink-0 px-1.5 py-0 text-[0.65rem]">
                        Meu
                      </Badge>
                      <span className="truncate">{item.name}</span>
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {item.powerW}VA{item.ipInRatio !== 1 ? ` · IP/IN ${item.ipInRatio}` : ''}
                    </span>
                  </button>
                  <UserLoadCatalogItemMenu
                    item={item}
                    onUpdate={updateUserLoadCatalogItem}
                    onRemove={removeUserLoadCatalogItem}
                  />
                </div>
              ))}
              {filtered.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleAddFromCatalog(item)}
                  className="flex items-center justify-between gap-2 rounded-md border bg-card py-1.5 px-2 text-left text-sm transition-colors hover:border-primary/50 hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <span className="truncate">{item[nameKey as keyof CatalogItem] as string}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {item.powerW}VA{item.ipInRatio !== 1 ? ` · IP/IN ${item.ipInRatio}` : ''}
                  </span>
                </button>
              ))}
              {filteredUserItems.length === 0 && filtered.length === 0 && (
                <p className="col-span-full rounded-lg border border-dashed p-3 text-center text-xs text-muted-foreground">
                  Nenhuma carga encontrada.
                </p>
              )}
            </div>
          </div>
          )}
        </div>
        )}
      </div>

      <div className="space-y-3">
          {residentialOptions.loads.length > 0 && (
          <div>
            <p className="text-xs font-medium">
              <InfoLabel
                label="Modo de cálculo da máxima (IP/IN)"
                tip="Define como as cargas com maior corrente de partida somam na potência aparente máxima do sistema, usado para escolher o inversor."
              />
            </p>
            <div className="mt-2 grid grid-cols-1 gap-1 rounded-lg bg-muted p-1 sm:grid-cols-3">
              {(
                [
                  {
                    value: 'sum' as const,
                    label: 'Soma de todas',
                    tip: 'Máxima = soma de (potência × IP/IN) de todas as cargas, como se todas partissem ao mesmo tempo. Mais conservador.',
                  },
                  {
                    value: 'largest-surge' as const,
                    label: 'Só a maior carga',
                    tip: 'Máxima = soma nominal de todas as cargas + o maior excedente de partida entre elas, assumindo que só uma carga parte por vez.',
                  },
                  {
                    value: 'select' as const,
                    label: 'Selecionar cargas',
                    tip: 'Máxima = soma de (potência × IP/IN) apenas das cargas marcadas abaixo. Use para simular só um subconjunto das cargas partindo ao mesmo tempo.',
                  },
                ]
              ).map((option) => (
                <PeakModeButton
                  key={option.value}
                  label={option.label}
                  tip={option.tip}
                  active={(residentialOptions.peakCalcMode ?? 'sum') === option.value}
                  onClick={() => setPeakCalcMode(option.value)}
                />
              ))}
            </div>
            {(residentialOptions.peakCalcMode ?? 'sum') === 'select' && (
              <p className="mt-2 text-[0.7rem] text-muted-foreground">
                Marque, em cada carga, se ela deve contar na potência máxima (ícone de raio no cabeçalho da carga).
              </p>
            )}
          </div>
          )}
          {residentialOptions.loads.length > 0 && gridType && gridTypePhaseCount[gridType] > 1 && (
            <div>
              <p className="text-xs font-medium">
                <InfoLabel
                  label="Potência por fase"
                  tip="Soma da potência nominal das cargas em cada fase. Cargas trifásicas dividem a potência igualmente entre as três fases. Arraste uma carga monofásica para uma fase para conectá-la a ela em ligação fase-neutro. Selecione uma fase para filtrar as cargas exibidas abaixo."
                />
              </p>
              <div
                className="mt-2 grid gap-2"
                style={{ gridTemplateColumns: `repeat(${visiblePhases.length + 1}, minmax(0, 1fr))` }}
              >
                <button
                  type="button"
                  aria-pressed={effectivePhaseFilter === 'all'}
                  onClick={() => setPhaseFilter('all')}
                  className={cn(
                    'rounded-lg border p-2 text-center transition-colors',
                    effectivePhaseFilter === 'all' ? 'border-primary bg-primary/10' : 'bg-muted/40 hover:bg-muted/70'
                  )}
                >
                  <p className="text-[0.7rem] font-medium uppercase text-muted-foreground">Todas</p>
                  <p className="text-sm font-semibold">{residentialOptions.loads.length}</p>
                </button>
                {visiblePhases.map((phase) => {
                  const phaseW = phaseTotals[phase];
                  const overLimit = Boolean(maxPowerPerPhaseW) && phaseW > (maxPowerPerPhaseW as number);
                  const active = effectivePhaseFilter === phase;
                  return (
                    <button
                      key={phase}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setPhaseFilter((current) => (current === phase ? 'all' : phase))}
                      onDragOver={(event) => {
                        event.preventDefault();
                        setDragOverPhase(phase);
                      }}
                      onDragLeave={() => setDragOverPhase((current) => (current === phase ? null : current))}
                      onDrop={(event) => {
                        event.preventDefault();
                        setDragOverPhase(null);
                        const loadId = event.dataTransfer.getData('text/plain');
                        const dragged = residentialOptions.loads.find((item) => item.id === loadId);
                        if (!dragged) return;
                        // Dropping onto a single phase always makes the load phase-neutral on
                        // that phase, so it must use the standard's phase-neutral voltage
                        // instead of whatever phase-to-phase voltage it may have had.
                        const neutralVoltage = gridType
                          ? (gridTypeVoltages[gridType].find(
                              (v) => !gridTypePhaseToPhaseVoltages[gridType].includes(v)
                            ) as LoadVoltage | undefined)
                          : undefined;
                        updateLoad(loadId, {
                          phase,
                          phase2: null,
                          ...(neutralVoltage !== undefined ? { voltageV: neutralVoltage } : {}),
                        });
                      }}
                      className={cn(
                        'rounded-lg border p-2 text-center transition-colors',
                        overLimit ? 'border-destructive/40 bg-destructive/5' : 'bg-muted/40 hover:bg-muted/70',
                        active && 'border-primary bg-primary/10',
                        dragOverPhase === phase && 'border-primary bg-primary/10 ring-2 ring-primary/40'
                      )}
                    >
                      <p className="flex items-center justify-center gap-1 text-[0.7rem] font-medium uppercase text-muted-foreground">
                        <PhaseDot phase={phase} />
                        Fase {phase}
                      </p>
                      <p className={cn('text-sm font-semibold', overLimit && 'text-destructive')}>
                        {phaseW.toFixed(0)} VA
                      </p>
                    </button>
                  );
                })}
              </div>
              {maxPowerPerPhaseW && Object.values(phaseTotals).some((value) => value > maxPowerPerPhaseW) && (
                <p className="mt-2 text-xs text-destructive">
                  Uma ou mais fases ultrapassam o máximo configurado ({maxPowerPerPhaseW.toFixed(0)} VA). Redistribua as cargas entre as fases.
                </p>
              )}
            </div>
          )}
          {effectivePhaseFilter !== 'all' && visibleLoads.length === 0 && (
            <p className="rounded-lg border border-dashed p-3 text-center text-xs text-muted-foreground">
              Nenhuma carga conectada à fase {effectivePhaseFilter}.
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <AddLoadTile
              onAdd={handleAddBlank}
              disabled={residentialOptions.loads.length >= ACCOUNT_LIMITS.loadsPerProject}
            />
            {visibleLoads.map((load) => (
              <LoadCard
                key={load.id}
                load={load}
                gridType={residentialOptions.gridType}
                loadCatalog={loadCatalog}
                userLoadCatalog={userLoadCatalog}
                nameKey={nameKey}
                peakCalcMode={residentialOptions.peakCalcMode ?? 'sum'}
                operationHours={residentialOptions.operationHours}
                onUpdate={updateLoad}
                onRemove={(id) => {
                  removeLoad(id);
                  setLoadLimitMessage(null);
                }}
                onDuplicate={handleDuplicateLoad}
                duplicateDisabled={residentialOptions.loads.length >= ACCOUNT_LIMITS.loadsPerProject}
                saveManualLoadToCatalog={saveManualLoadToCatalog}
                onCatalogSaveWarning={setCatalogSaveWarning}
                presetSelectionMode={savePresetOpen}
                presetSelected={selectedLoadIdsForPreset.has(load.id)}
                onTogglePresetSelected={() => toggleLoadForPreset(load.id)}
              />
            ))}
          </div>
        </div>
    </div>
  );
}
