'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations, useLocale } from 'next-intl';
import { Button } from '@/components/ui/button';
import { ConfirmDeleteButton } from '@/components/ui/confirm-delete-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  BatteryCharging,
  ChevronDown,
  Layers,
  ListChecks,
  MoreVertical,
  Pencil,
  Plug,
  Plus,
  Trash2,
  Search,
  X,
  Zap,
} from 'lucide-react';
import { ACCOUNT_LIMITS, limitReachedMessage } from '@/lib/limits';
import { gridTypePhaseCount, gridTypePhaseToPhaseVoltages, gridTypeVoltages, loadPhases, totalPowerByPhase, useWizardStore } from '@/lib/store/wizard-store';
import type { CatalogItem, LoadPhase, LoadPresetLoad, PeakCalcMode, ResidentialGridType, SingleLoad, UserLoadCatalogItem } from '@/lib/types';
import { cn } from '@/lib/utils';
import { InfoLabel, Tooltip, TOOLTIP_BUBBLE_CLASSES } from '@/components/ui/tooltip';

export function NumberFieldWithClear({
  id,
  value,
  placeholder,
  min,
  max,
  step,
  ariaLabel,
  onChange,
  onBlur,
  onClear,
}: {
  id?: string;
  value: string;
  placeholder: string;
  min?: number;
  max?: number;
  step?: number;
  ariaLabel?: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  onClear: () => void;
}) {
  return (
    <div className="relative mt-1">
      <Input
        id={id}
        aria-label={ariaLabel}
        type="number"
        min={min}
        max={max}
        step={step}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        className="h-10 pr-8 text-base md:h-8 md:pr-6 md:text-xs"
      />
      {value !== '' && (
        <button
          type="button"
          aria-label="Limpar campo"
          tabIndex={-1}
          onMouseDown={(event) => event.preventDefault()}
          onClick={onClear}
          className="absolute right-1 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground md:size-5"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

const MINE_FILTER = '__mine__';

/** A trifásica load draws from all three phases, so it's always "related" to
 * every phase; a mono load is related only to the phase(s) it's wired to. */
function loadMatchesPhase(load: SingleLoad, phase: LoadPhase): boolean {
  if ((load.phaseType ?? 'mono') === 'trifasica') return true;
  return (load.phase ?? 'L1') === phase || load.phase2 === phase;
}

function newLoad(partial: Omit<SingleLoad, 'id' | 'ipInRatio'> & { ipInRatio?: number }): SingleLoad {
  return { ipInRatio: 1, usageFactor: 1, voltageV: 220, phaseType: 'mono', phase: 'L1', ...partial, id: crypto.randomUUID() };
}

function PresetCard({
  preset,
  onAdd,
  withDeleteSpacing,
}: {
  preset: { name: string; description: string; loads: LoadPresetLoad[] };
  onAdd: () => void;
  withDeleteSpacing?: boolean;
}) {
  const peakKva = preset.loads.reduce((acc, load) => acc + load.powerW * (load.ipInRatio ?? 1) * load.qty, 0) / 1000;
  const dailyKwh = preset.loads.reduce((acc, load) => acc + (load.powerW * load.hoursPerDay * load.qty) / 1000, 0);

  return (
    <button
      type="button"
      onClick={onAdd}
      className={cn(
        'w-full space-y-1 rounded-lg border bg-card p-2.5 text-left text-sm transition-colors hover:border-primary/50 hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
        withDeleteSpacing && 'pr-9'
      )}
    >
      <div className="flex items-center gap-1.5 font-medium">
        <Layers className="h-3.5 w-3.5 shrink-0 text-primary" />
        <span className="truncate">{preset.name}</span>
      </div>
      {preset.description && <p className="truncate text-xs text-muted-foreground">{preset.description}</p>}
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="group relative flex items-center gap-1">
          <ListChecks className="h-3.5 w-3.5" />
          <span className="font-medium text-foreground">{preset.loads.length}</span>
          <span className={TOOLTIP_BUBBLE_CLASSES}>Cargas</span>
        </span>
        <span className="group relative flex items-center gap-1">
          <Zap className="h-3.5 w-3.5" />
          <span className="font-medium text-foreground">{peakKva.toFixed(1)}</span>
          kVA
          <span className={TOOLTIP_BUBBLE_CLASSES}>Pico</span>
        </span>
        <span className="group relative flex items-center gap-1">
          <BatteryCharging className="h-3.5 w-3.5" />
          <span className="font-medium text-foreground">{dailyKwh.toFixed(1)}</span>
          kWh
          <span className={TOOLTIP_BUBBLE_CLASSES}>Consumo diário</span>
        </span>
      </div>
    </button>
  );
}

function CollapsibleSectionHeader({
  title,
  summary,
  open,
  onToggle,
}: {
  title: string;
  summary: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className="flex w-full items-center justify-between gap-2 rounded-lg border bg-card px-3 py-2 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <span className="flex items-center gap-2 text-sm font-semibold">
        <ChevronDown
          className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', !open && '-rotate-90')}
        />
        {title}
      </span>
      {!open && <span className="text-xs text-muted-foreground">{summary}</span>}
    </button>
  );
}

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
  const [manualName, setManualName] = useState('');
  const [manualPower, setManualPower] = useState('');
  const [manualHours, setManualHours] = useState('');
  const [manualQty, setManualQty] = useState('1');
  const [manualIpIn, setManualIpIn] = useState('1');
  const [catalogSaveWarning, setCatalogSaveWarning] = useState<string | null>(null);
  const [loadLimitMessage, setLoadLimitMessage] = useState<string | null>(null);
  const [savePresetOpen, setSavePresetOpen] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [dragOverPhase, setDragOverPhase] = useState<LoadPhase | null>(null);
  const [phaseFilter, setPhaseFilter] = useState<LoadPhase | 'all'>('all');

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
    const added = addLoad(newLoad({ name: '', powerW: 0, hoursPerDay: 4, qty: 1, ipInRatio: 1 }));
    setLoadLimitMessage(added ? null : limitReachedMessage('cargas neste projeto', ACCOUNT_LIMITS.loadsPerProject));
  }

  function handleAddFromCatalog(item: CatalogItem) {
    const added = addLoad(
      newLoad({
        name: item[nameKey as keyof CatalogItem] as string,
        powerW: item.powerW,
        hoursPerDay: 4,
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
        hoursPerDay: 4,
        qty: 1,
        ipInRatio: item.ipInRatio,
      })
    );
    setLoadLimitMessage(added ? null : limitReachedMessage('cargas neste projeto', ACCOUNT_LIMITS.loadsPerProject));
  }

  function handleAddManual() {
    if (!manualName || !manualPower) return;
    const powerW = Number(manualPower);
    const ipInRatio = Number(manualIpIn) || 1;
    const added = addLoad(
      newLoad({
        name: manualName,
        powerW,
        hoursPerDay: Number(manualHours) || 4,
        qty: Number(manualQty) || 1,
        ipInRatio,
      })
    );
    if (!added) {
      setLoadLimitMessage(limitReachedMessage('cargas neste projeto', ACCOUNT_LIMITS.loadsPerProject));
      return;
    }
    setLoadLimitMessage(null);
    setCatalogSaveWarning(null);
    saveManualLoadToCatalog({ name: manualName, powerW, ipInRatio }).catch((error) => {
      const message =
        error instanceof Error && error.message.startsWith('Limite de')
          ? error.message
          : 'Carga adicionada ao cálculo, mas não foi possível salvá-la em "Minhas Cargas" para reutilizar depois.';
      setCatalogSaveWarning(message);
    });
    setManualName('');
    setManualPower('');
    setManualHours('');
    setManualQty('1');
    setManualIpIn('1');
  }

  function handleAddPreset(preset: { loads: LoadPresetLoad[] }) {
    const remaining = ACCOUNT_LIMITS.loadsPerProject - residentialOptions.loads.length;
    if (preset.loads.length > remaining) {
      setLoadLimitMessage(
        remaining > 0
          ? `Este preset tem ${preset.loads.length} cargas, mas só cabem mais ${remaining} neste projeto (limite de ${ACCOUNT_LIMITS.loadsPerProject}).`
          : limitReachedMessage('cargas neste projeto', ACCOUNT_LIMITS.loadsPerProject)
      );
      return;
    }
    setLoadLimitMessage(null);
    preset.loads.forEach((load) => addLoad(newLoad(load)));
    setActiveSubTab('catalog');
  }

  async function handleSaveCurrentAsPreset() {
    if (!presetName.trim() || residentialOptions.loads.length === 0) return;
    setSavingPreset(true);
    setPresetSaveError(null);
    try {
      await saveLoadsAsPreset({
        name: presetName.trim(),
        description: presetDescription.trim(),
        loads: residentialOptions.loads.map((load) => ({
          name: load.name,
          powerW: load.powerW,
          hoursPerDay: load.hoursPerDay,
          qty: load.qty,
          ipInRatio: load.ipInRatio,
        })),
      });
      setSavePresetOpen(false);
      setPresetName('');
      setPresetDescription('');
    } catch (error) {
      setPresetSaveError(
        error instanceof Error && error.message.startsWith('Limite de')
          ? error.message
          : 'Não foi possível salvar o preset. Tente novamente.'
      );
    } finally {
      setSavingPreset(false);
    }
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

      <div className="space-y-2">
        <CollapsibleSectionHeader
          title="Cargas"
          summary={sectionSummary}
          open={sectionOpen}
          onToggle={() => setSectionOpen((current) => !current)}
        />
        {sectionOpen && (
        <div className="space-y-3 rounded-lg border bg-background p-3">
          <div className="flex gap-1 rounded-md bg-muted/60 p-0.5" role="tablist" aria-label="Cargas">
            <button
              type="button"
              role="tab"
              aria-selected={activeSubTab === 'presets'}
              onClick={() => setActiveSubTab('presets')}
              className={cn(
                'flex h-10 flex-1 items-center justify-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 md:h-8',
                activeSubTab === 'presets'
                  ? 'bg-background text-foreground shadow-sm ring-1 ring-border/70'
                  : 'text-muted-foreground hover:bg-background/60 hover:text-foreground'
              )}
            >
              Presets
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeSubTab === 'catalog'}
              onClick={() => setActiveSubTab('catalog')}
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

          {activeSubTab === 'presets' && (
          <div className="space-y-3">
            <div className="flex gap-4 border-b" role="tablist" aria-label="Presets">
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
                Presets do sistema
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
                Meus presets ({userLoadPresets.length}/{ACCOUNT_LIMITS.userPresets})
              </button>
            </div>

            {presetsSubTab === 'system' && (
              <div className="grid gap-2 grid-cols-1">
                {loadPresets.map((preset) => (
                  <PresetCard key={preset.id} preset={preset} onAdd={() => handleAddPreset(preset)} />
                ))}
              </div>
            )}

            {presetsSubTab === 'mine' && (
            <div className="space-y-2">
              <div className="flex justify-end">
                {!savePresetOpen && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={residentialOptions.loads.length === 0 || userLoadPresets.length >= ACCOUNT_LIMITS.userPresets}
                    onClick={() => setSavePresetOpen(true)}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Salvar cargas atuais como preset
                  </Button>
                )}
              </div>

              {savePresetOpen && (
                <div className="space-y-2 rounded-lg border bg-card p-3">
                  <Input
                    aria-label="Nome do preset"
                    placeholder="Nome do preset"
                    value={presetName}
                    onChange={(event) => setPresetName(event.target.value)}
                  />
                  <Input
                    aria-label="Descrição do preset"
                    placeholder="Descrição (opcional)"
                    value={presetDescription}
                    onChange={(event) => setPresetDescription(event.target.value)}
                  />
                  {presetSaveError && <p className="text-xs text-destructive">{presetSaveError}</p>}
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      disabled={!presetName.trim() || savingPreset}
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
                      }}
                    >
                      Cancelar
                    </Button>
                  </div>
                </div>
              )}

              {userLoadPresets.length === 0 ? (
                <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
                  Nenhum preset pessoal ainda. Monte as cargas do projeto e salve como preset para reutilizar depois.
                </p>
              ) : (
                <div className="grid gap-2 grid-cols-1">
                  {userLoadPresets.map((preset) => (
                    <div key={preset.id} className="relative">
                      <PresetCard preset={preset} onAdd={() => handleAddPreset(preset)} withDeleteSpacing />
                      <div className="absolute right-2 top-2">
                        <ConfirmDeleteButton
                          ariaLabel={`Remover preset ${preset.name}`}
                          title="Remover preset?"
                          description={`O preset "${preset.name}" será removido definitivamente.`}
                          confirmLabel="Remover"
                          onConfirm={() => removeUserLoadPreset(preset.id)}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            )}
          </div>
          )}

          {activeSubTab === 'catalog' && (
          <div className="space-y-2">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  autoFocus
                  aria-label={t('search_placeholder')}
                  placeholder={t('search_placeholder')}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8 md:pl-8"
                />
              </div>
              <AddCustomLoadPopover
                name={manualName}
                power={manualPower}
                hours={manualHours}
                qty={manualQty}
                ipIn={manualIpIn}
                nameLabel={t('name')}
                powerLabel={t('power')}
                hoursLabel={t('hours')}
                qtyLabel={t('qty')}
                addLabel={t('add_load')}
                onNameChange={setManualName}
                onPowerChange={setManualPower}
                onHoursChange={setManualHours}
                onQtyChange={setManualQty}
                onIpInChange={setManualIpIn}
                onAdd={handleAddManual}
              />
            </div>

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
          <div className="rounded-md border bg-card p-3">
            <p className="text-xs font-medium">
              <InfoLabel
                label="Modo de cálculo do pico (IP/IN)"
                tip="Define como as cargas com maior corrente de partida somam no pico de potência aparente do sistema, usado para escolher o inversor."
              />
            </p>
            <div className="mt-2 grid grid-cols-1 gap-1 rounded-lg bg-muted p-1 sm:grid-cols-3">
              {(
                [
                  {
                    value: 'sum' as const,
                    label: 'Soma de todas',
                    tip: 'Pico = soma de (potência × IP/IN) de todas as cargas, como se todas partissem ao mesmo tempo. Mais conservador.',
                  },
                  {
                    value: 'largest-surge' as const,
                    label: 'Só a maior carga',
                    tip: 'Pico = soma nominal de todas as cargas + o maior excedente de partida (potência × (IP/IN − 1)) entre elas, assumindo que só um motor/compressor parte por vez. Uma carga pequena com IP/IN alto pesa menos que uma carga grande com IP/IN baixo.',
                  },
                  {
                    value: 'select' as const,
                    label: 'Selecionar cargas',
                    tip: 'Pico = soma de (potência × IP/IN) apenas das cargas marcadas abaixo. Use para simular só um subconjunto das cargas partindo ao mesmo tempo.',
                  },
                ]
              ).map((option) => {
                const active = (residentialOptions.peakCalcMode ?? 'sum') === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setPeakCalcMode(option.value)}
                    className={cn(
                      'group relative h-10 rounded-md px-2 text-sm font-medium transition md:h-8 md:text-xs',
                      active
                        ? 'bg-background text-foreground shadow-sm ring-1 ring-border'
                        : 'text-muted-foreground hover:bg-background/60 hover:text-foreground'
                    )}
                  >
                    {option.label}
                    <span className={TOOLTIP_BUBBLE_CLASSES}>{option.tip}</span>
                  </button>
                );
              })}
            </div>
            {(residentialOptions.peakCalcMode ?? 'sum') === 'select' && (
              <p className="mt-2 text-[0.7rem] text-muted-foreground">
                Marque, em cada carga, se ela deve contar na potência de pico (ícone de raio no cabeçalho da carga).
              </p>
            )}
          </div>
          )}
          {residentialOptions.loads.length > 0 && gridType && gridTypePhaseCount[gridType] > 1 && (
            <div className="rounded-md border bg-card p-3">
              <p className="text-xs font-medium">
                <InfoLabel
                  label="Potência por fase"
                  tip="Soma da potência nominal das cargas em cada fase. Cargas trifásicas dividem a potência igualmente entre as três fases. Arraste uma carga monofásica para uma fase para conectá-la a ela. Selecione uma fase para filtrar as cargas exibidas abaixo."
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
                        if (dragged.phase2) {
                          const otherPhase = loadPhases.find((candidate) => candidate !== phase) ?? phase;
                          updateLoad(loadId, { phase, phase2: otherPhase });
                        } else {
                          updateLoad(loadId, { phase });
                        }
                      }}
                      className={cn(
                        'rounded-lg border p-2 text-center transition-colors',
                        overLimit ? 'border-destructive/40 bg-destructive/5' : 'bg-muted/40 hover:bg-muted/70',
                        active && 'border-primary bg-primary/10',
                        dragOverPhase === phase && 'border-primary bg-primary/10 ring-2 ring-primary/40'
                      )}
                    >
                      <p className="text-[0.7rem] font-medium uppercase text-muted-foreground">Fase {phase}</p>
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
            {effectivePhaseFilter === 'all' && (
              <AddLoadTile
                onAdd={handleAddBlank}
                disabled={residentialOptions.loads.length >= ACCOUNT_LIMITS.loadsPerProject}
              />
            )}
            {visibleLoads.map((load) => (
              <LoadCard
                key={load.id}
                load={load}
                gridType={residentialOptions.gridType}
                loadCatalog={loadCatalog}
                userLoadCatalog={userLoadCatalog}
                nameKey={nameKey}
                peakCalcMode={residentialOptions.peakCalcMode ?? 'sum'}
                onUpdate={updateLoad}
                onRemove={(id) => {
                  removeLoad(id);
                  setLoadLimitMessage(null);
                }}
                saveManualLoadToCatalog={saveManualLoadToCatalog}
                onCatalogSaveWarning={setCatalogSaveWarning}
              />
            ))}
          </div>
        </div>
    </div>
  );
}

function AddLoadTile({ onAdd, disabled }: { onAdd: () => void; disabled: boolean }) {
  return (
    <button
      type="button"
      onClick={onAdd}
      disabled={disabled}
      className="flex min-h-[88px] flex-col items-center justify-center gap-1 rounded-lg border border-dashed p-3 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <Plus className="h-5 w-5" />
      Adicionar carga
    </button>
  );
}

function AddCustomLoadPopover({
  name,
  power,
  hours,
  qty,
  ipIn,
  nameLabel,
  powerLabel,
  hoursLabel,
  qtyLabel,
  addLabel,
  onNameChange,
  onPowerChange,
  onHoursChange,
  onQtyChange,
  onIpInChange,
  onAdd,
}: {
  name: string;
  power: string;
  hours: string;
  qty: string;
  ipIn: string;
  nameLabel: string;
  powerLabel: string;
  hoursLabel: string;
  qtyLabel: string;
  addLabel: string;
  onNameChange: (value: string) => void;
  onPowerChange: (value: string) => void;
  onHoursChange: (value: string) => void;
  onQtyChange: (value: string) => void;
  onIpInChange: (value: string) => void;
  onAdd: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => setMounted(true), []);

  useLayoutEffect(() => {
    if (!open) return;
    const rect = triggerRef.current?.getBoundingClientRect();
    const popRect = popoverRef.current?.getBoundingClientRect();
    if (!rect || !popRect) return;

    const gap = 8;
    const margin = 12;

    let left = rect.right - popRect.width;
    left = Math.min(Math.max(margin, left), window.innerWidth - popRect.width - margin);

    const spaceBelow = window.innerHeight - rect.bottom - gap;
    const spaceAbove = rect.top - gap;
    let top =
      spaceBelow >= popRect.height || spaceBelow >= spaceAbove ? rect.bottom + gap : rect.top - gap - popRect.height;
    top = Math.min(Math.max(margin, top), window.innerHeight - popRect.height - margin);

    setPosition({ top, left });
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || popoverRef.current?.contains(target)) return;
      setOpen(false);
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  function handleAdd() {
    if (!name || !power) return;
    onAdd();
    setOpen(false);
  }

  return (
    <>
      <Button ref={triggerRef} type="button" variant="outline" onClick={() => setOpen((current) => !current)}>
        <Plus className="h-4 w-4" />
        Adicionar
      </Button>

      {open &&
        mounted &&
        createPortal(
          <div
            ref={popoverRef}
            role="dialog"
            aria-label="Adicionar nova carga"
            className="fixed z-[1000] w-80 rounded-lg border bg-popover p-3 text-popover-foreground shadow-lg"
            style={{
              top: position.top,
              left: position.left,
              visibility: position.top === 0 && position.left === 0 ? 'hidden' : 'visible',
            }}
          >
            <p className="text-sm font-medium">Nova carga</p>
            <div className="mt-3 space-y-3">
              <div>
                <Label htmlFor="popover-load-name">{nameLabel}</Label>
                <Input
                  id="popover-load-name"
                  value={name}
                  onChange={(event) => onNameChange(event.target.value)}
                  placeholder="Nome do equipamento"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label htmlFor="popover-load-power">{powerLabel}</Label>
                  <Input
                    id="popover-load-power"
                    type="number"
                    min={1}
                    value={power}
                    onChange={(event) => onPowerChange(event.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="popover-load-hours">{hoursLabel}</Label>
                  <Input
                    id="popover-load-hours"
                    type="number"
                    min={0.5}
                    max={24}
                    step={0.5}
                    value={hours}
                    onChange={(event) => onHoursChange(event.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="popover-load-qty">{qtyLabel}</Label>
                  <Input
                    id="popover-load-qty"
                    type="number"
                    min={1}
                    value={qty}
                    onChange={(event) => onQtyChange(event.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="popover-load-ipin">IP/IN</Label>
                  <Input
                    id="popover-load-ipin"
                    type="number"
                    min={1}
                    step={0.1}
                    value={ipIn}
                    onChange={(event) => onIpInChange(event.target.value)}
                  />
                </div>
              </div>
              <Button className="w-full" onClick={handleAdd} disabled={!name || !power}>
                <Plus className="h-4 w-4" />
                {addLabel}
              </Button>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}

function UserLoadCatalogItemMenu({
  item,
  onUpdate,
  onRemove,
}: {
  item: UserLoadCatalogItem;
  onUpdate: (id: string, partial: Partial<{ name: string; powerW: number; ipInRatio: number }>) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [view, setView] = useState<'menu' | 'edit' | 'confirm-delete'>('menu');
  const [editName, setEditName] = useState(item.name);
  const [editPower, setEditPower] = useState(String(item.powerW));
  const [editIpIn, setEditIpIn] = useState(String(item.ipInRatio));
  const [saving, setSaving] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  function close() {
    setOpen(false);
    setView('menu');
  }

  useEffect(() => setMounted(true), []);

  useLayoutEffect(() => {
    if (!open) return;
    const rect = triggerRef.current?.getBoundingClientRect();
    const popRect = popoverRef.current?.getBoundingClientRect();
    if (!rect || !popRect) return;

    const gap = 8;
    const margin = 12;

    let left = rect.right - popRect.width;
    left = Math.min(Math.max(margin, left), window.innerWidth - popRect.width - margin);

    const spaceBelow = window.innerHeight - rect.bottom - gap;
    const spaceAbove = rect.top - gap;
    let top =
      spaceBelow >= popRect.height || spaceBelow >= spaceAbove ? rect.bottom + gap : rect.top - gap - popRect.height;
    top = Math.min(Math.max(margin, top), window.innerHeight - popRect.height - margin);

    setPosition({ top, left });
  }, [open, view]);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || popoverRef.current?.contains(target)) return;
      close();
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') close();
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  function toggleMenu() {
    if (!open) {
      setEditName(item.name);
      setEditPower(String(item.powerW));
      setEditIpIn(String(item.ipInRatio));
      setView('menu');
    }
    setOpen((current) => !current);
  }

  async function handleSave() {
    if (!editName.trim() || !editPower) return;
    setSaving(true);
    try {
      await onUpdate(item.id, {
        name: editName.trim(),
        powerW: Number(editPower) || item.powerW,
        ipInRatio: Number(editIpIn) || 1,
      });
      close();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setSaving(true);
    try {
      await onRemove(item.id);
      close();
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Button
        ref={triggerRef}
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label={`Opções de ${item.name}`}
        aria-expanded={open}
        onClick={toggleMenu}
      >
        <MoreVertical className="h-3.5 w-3.5" />
      </Button>

      {open &&
        mounted &&
        createPortal(
          <div
            ref={popoverRef}
            role="dialog"
            aria-label={`Opções de ${item.name}`}
            className="fixed z-[1000] w-64 rounded-lg border bg-popover p-2 text-popover-foreground shadow-lg"
            style={{
              top: position.top,
              left: position.left,
              visibility: position.top === 0 && position.left === 0 ? 'hidden' : 'visible',
            }}
          >
            {view === 'menu' && (
              <div className="space-y-0.5">
                <button
                  type="button"
                  onClick={() => setView('edit')}
                  className="flex w-full items-center gap-2 rounded-md p-2 text-left text-sm transition hover:bg-muted"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Editar
                </button>
                <button
                  type="button"
                  onClick={() => setView('confirm-delete')}
                  className="flex w-full items-center gap-2 rounded-md p-2 text-left text-sm text-destructive transition hover:bg-destructive/10"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Excluir
                </button>
              </div>
            )}

            {view === 'edit' && (
              <div className="space-y-2 p-1">
                <div>
                  <Label htmlFor={`edit-name-${item.id}`}>Nome</Label>
                  <Input id={`edit-name-${item.id}`} value={editName} onChange={(event) => setEditName(event.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label htmlFor={`edit-power-${item.id}`}>Potência (VA)</Label>
                    <Input
                      id={`edit-power-${item.id}`}
                      type="number"
                      min={1}
                      value={editPower}
                      onChange={(event) => setEditPower(event.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor={`edit-ipin-${item.id}`}>IP/IN</Label>
                    <Input
                      id={`edit-ipin-${item.id}`}
                      type="number"
                      min={1}
                      step={0.1}
                      value={editIpIn}
                      onChange={(event) => setEditIpIn(event.target.value)}
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="ghost" size="sm" onClick={() => setView('menu')}>
                    Cancelar
                  </Button>
                  <Button type="button" size="sm" onClick={handleSave} disabled={saving || !editName.trim() || !editPower}>
                    Salvar
                  </Button>
                </div>
              </div>
            )}

            {view === 'confirm-delete' && (
              <div className="space-y-2 p-1">
                <p className="text-sm font-medium">Remover carga?</p>
                <p className="text-xs text-muted-foreground">
                  &quot;{item.name}&quot; sai do seu catálogo pessoal. Não afeta projetos que já a usam.
                </p>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="ghost" size="sm" onClick={() => setView('menu')}>
                    Cancelar
                  </Button>
                  <Button type="button" variant="destructive" size="sm" onClick={handleDelete} disabled={saving}>
                    Remover
                  </Button>
                </div>
              </div>
            )}
          </div>,
          document.body
        )}
    </>
  );
}

function LoadCard({
  load,
  gridType,
  loadCatalog,
  userLoadCatalog,
  nameKey,
  peakCalcMode,
  onUpdate,
  onRemove,
  saveManualLoadToCatalog,
  onCatalogSaveWarning,
}: {
  load: SingleLoad;
  gridType: ResidentialGridType | null;
  loadCatalog: CatalogItem[];
  userLoadCatalog: UserLoadCatalogItem[];
  nameKey: string;
  peakCalcMode: PeakCalcMode;
  onUpdate: (id: string, partial: Partial<SingleLoad>) => void;
  onRemove: (id: string) => void;
  saveManualLoadToCatalog: (input: { name: string; powerW: number; ipInRatio: number }) => Promise<void>;
  onCatalogSaveWarning: (message: string | null) => void;
}) {
  const [hours, setHours] = useState(String(load.hoursPerDay));
  const [qty, setQty] = useState(String(load.qty));
  const [ipIn, setIpIn] = useState(String(load.ipInRatio ?? 1));
  const [usageFactor, setUsageFactor] = useState(String(load.usageFactor ?? 1));
  const [expanded, setExpanded] = useState(false);
  const [draftName, setDraftName] = useState(load.name);
  const [draftPower, setDraftPower] = useState(load.powerW ? String(load.powerW) : '');
  const [draftDropdownOpen, setDraftDropdownOpen] = useState(false);
  const isDraft = load.powerW === 0;

  const draftMatches = useMemo(() => {
    const query = draftName.trim().toLowerCase();
    if (!query) return { mine: [], system: [] };
    return {
      mine: userLoadCatalog.filter((item) => item.name.toLowerCase().includes(query)).slice(0, 5),
      system: loadCatalog
        .filter((item) => (item[nameKey as keyof CatalogItem] as string).toLowerCase().includes(query))
        .slice(0, 5),
    };
  }, [draftName, userLoadCatalog, loadCatalog, nameKey]);

  function selectDraftSuggestion(name: string, powerW: number, ipInRatio: number) {
    setDraftName(name);
    setDraftPower(String(powerW));
    setDraftDropdownOpen(false);
    onUpdate(load.id, { name, powerW, ipInRatio });
  }

  function confirmDraft() {
    const parsedPower = Number(draftPower);
    if (!draftName.trim() || !(parsedPower > 0)) return;
    const name = draftName.trim();
    onUpdate(load.id, { name, powerW: parsedPower });
    // A freely typed name/power (as opposed to picking a "Minhas"/"Sistema"
    // suggestion) is a genuinely new load, so save it for reuse next time.
    onCatalogSaveWarning(null);
    saveManualLoadToCatalog({ name, powerW: parsedPower, ipInRatio: 1 }).catch((error) => {
      const message =
        error instanceof Error && error.message.startsWith('Limite de')
          ? error.message
          : 'Carga adicionada ao cálculo, mas não foi possível salvá-la em "Minhas Cargas" para reutilizar depois.';
      onCatalogSaveWarning(message);
    });
  }

  const phaseCount = gridType ? gridTypePhaseCount[gridType] : 3;
  const validVoltages = gridType ? gridTypeVoltages[gridType] : [110, 220, 380];
  const phaseToPhaseVoltages = useMemo(
    () => (gridType ? gridTypePhaseToPhaseVoltages[gridType] : []),
    [gridType]
  );
  const phaseType = load.phaseType ?? 'mono';
  const voltageV = load.voltageV ?? 220;
  // A trifásica load draws from all three phases at once, so it can only be
  // rated at the network's phase-to-phase voltage, not the phase-neutral one.
  // A mono load on a 380V three-phase network is always phase-neutral (220V) here;
  // 380V mono would need a phase-to-phase hookup, which this network doesn't offer as an option.
  const voltageOptions =
    phaseType === 'trifasica' && phaseToPhaseVoltages.length > 0
      ? phaseToPhaseVoltages
      : gridType === 'threePhase_380' && phaseType === 'mono'
        ? validVoltages.filter((v) => v !== 380)
        : validVoltages;
  const voltageValid = voltageOptions.includes(voltageV);
  const needsTwoPhases = phaseType === 'mono' && phaseCount > 1 && phaseToPhaseVoltages.includes(voltageV);
  const phase = load.phase ?? 'L1';
  const phasePairs: [LoadPhase, LoadPhase][] = [['L1', 'L2'], ['L2', 'L3'], ['L1', 'L3']];
  const canDragToPhase = phaseType === 'mono' && phaseCount > 1;

  useEffect(() => {
    if (phaseCount < 3 && phaseType === 'trifasica') {
      onUpdate(load.id, { phaseType: 'mono' });
    }
  }, [phaseCount, phaseType, load.id, onUpdate]);

  useEffect(() => {
    if (phaseType === 'trifasica' && phaseToPhaseVoltages.length > 0 && !phaseToPhaseVoltages.includes(voltageV)) {
      onUpdate(load.id, { voltageV: phaseToPhaseVoltages[0] as 110 | 220 | 380 });
    }
  }, [phaseType, phaseToPhaseVoltages, voltageV, load.id, onUpdate]);

  useEffect(() => {
    if (gridType === 'threePhase_380' && phaseType === 'mono' && voltageV === 380) {
      onUpdate(load.id, { voltageV: 220 });
    }
  }, [gridType, phaseType, voltageV, load.id, onUpdate]);

  useEffect(() => {
    if (needsTwoPhases && !load.phase2) {
      onUpdate(load.id, { phase: 'L1', phase2: 'L2' });
    } else if (!needsTwoPhases && load.phase2) {
      onUpdate(load.id, { phase2: null });
    }
  }, [needsTwoPhases, load.phase2, load.id, onUpdate]);

  function handleChange(
    field: 'hoursPerDay' | 'qty' | 'ipInRatio' | 'usageFactor',
    raw: string,
    setLocal: (value: string) => void
  ) {
    setLocal(raw);
    const parsed = Number(raw);
    const isValid =
      raw.trim() !== '' &&
      Number.isFinite(parsed) &&
      (field === 'usageFactor' ? parsed >= 0 && parsed <= 1 : parsed > 0);
    if (isValid) {
      onUpdate(load.id, { [field]: parsed } as Partial<SingleLoad>);
    }
  }

  function revertIfInvalid(raw: string, fallback: number, setLocal: (value: string) => void) {
    const parsed = Number(raw);
    if (raw.trim() === '' || !Number.isFinite(parsed) || parsed <= 0) {
      setLocal(String(fallback));
    }
  }

  function revertUsageFactorIfInvalid() {
    const parsed = Number(usageFactor);
    if (usageFactor.trim() === '' || !Number.isFinite(parsed) || parsed < 0) {
      setUsageFactor(String(load.usageFactor ?? 1));
      return;
    }
    if (parsed > 1) {
      setUsageFactor('1');
      onUpdate(load.id, { usageFactor: 1 });
    }
  }

  const loadPeakW = load.powerW * (load.ipInRatio ?? 1) * load.qty;
  const loadEnergyKwh = (load.powerW * load.hoursPerDay * load.qty * (load.usageFactor ?? 1)) / 1000;
  const includedInPeak = load.includedInPeak ?? true;

  if (isDraft) {
    const hasSuggestions = draftMatches.mine.length > 0 || draftMatches.system.length > 0;
    return (
      <div className="rounded-lg border border-dashed bg-card p-3 text-sm">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1 space-y-2">
            <div className="relative">
              <Label htmlFor={`draft-name-${load.id}`} className="text-xs font-normal text-muted-foreground">
                Nome
              </Label>
              <Input
                id={`draft-name-${load.id}`}
                autoFocus
                value={draftName}
                placeholder="Nome do equipamento"
                onChange={(event) => {
                  setDraftName(event.target.value);
                  setDraftDropdownOpen(true);
                }}
                onFocus={() => setDraftDropdownOpen(true)}
                onBlur={() => setTimeout(() => setDraftDropdownOpen(false), 150)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    confirmDraft();
                  }
                }}
                className="mt-1"
              />
              {draftDropdownOpen && draftName.trim() !== '' && hasSuggestions && (
                <div className="absolute left-0 top-full z-20 mt-1 max-h-56 w-72 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg">
                  {draftMatches.mine.length > 0 && (
                    <div>
                      <p className="px-2 py-1 text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground">
                        Minhas
                      </p>
                      {draftMatches.mine.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => selectDraftSuggestion(item.name, item.powerW, item.ipInRatio)}
                          className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                        >
                          <span className="truncate">{item.name}</span>
                          <span className="shrink-0 text-xs text-muted-foreground">{item.powerW}VA</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {draftMatches.system.length > 0 && (
                    <div>
                      <p className="px-2 py-1 text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground">
                        Sistema
                      </p>
                      {draftMatches.system.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() =>
                            selectDraftSuggestion(
                              item[nameKey as keyof CatalogItem] as string,
                              item.powerW,
                              item.ipInRatio ?? 1
                            )
                          }
                          className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                        >
                          <span className="truncate">{item[nameKey as keyof CatalogItem] as string}</span>
                          <span className="shrink-0 text-xs text-muted-foreground">{item.powerW}VA</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div>
              <Label htmlFor={`draft-power-${load.id}`} className="text-xs font-normal text-muted-foreground">
                Potência (VA)
              </Label>
              <Input
                id={`draft-power-${load.id}`}
                type="number"
                min={1}
                value={draftPower}
                placeholder="Ex.: 1200"
                onChange={(event) => setDraftPower(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    confirmDraft();
                  }
                }}
                className="mt-1"
              />
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0 md:h-7 md:w-7"
            onClick={() => onRemove(load.id)}
            aria-label="Remover carga em branco"
          >
            <Trash2 className="h-3.5 w-3.5 text-destructive" />
          </Button>
        </div>
        <Button
          type="button"
          size="sm"
          className="mt-3 w-full"
          disabled={!draftName.trim() || !(Number(draftPower) > 0)}
          onClick={confirmDraft}
        >
          Adicionar
        </Button>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'relative rounded-lg border bg-card text-sm',
        canDragToPhase && 'group cursor-grab active:cursor-grabbing'
      )}
      draggable={canDragToPhase}
      onDragStart={
        canDragToPhase
          ? (event) => {
              event.dataTransfer.setData('text/plain', load.id);
              event.dataTransfer.effectAllowed = 'move';
            }
          : undefined
      }
    >
      {canDragToPhase && (
        <span className={cn(TOOLTIP_BUBBLE_CLASSES, 'top-auto bottom-full mt-0 mb-2')}>
          Arraste para uma fase em &quot;Potência por fase&quot; para reconectar
        </span>
      )}
      <div
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onClick={() => setExpanded((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            setExpanded((current) => !current);
          }
        }}
        className="flex w-full cursor-pointer items-start justify-between gap-2 p-3 text-left focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <div className="min-w-0">
          <p className="font-medium truncate">{load.name}</p>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            <span className="group relative flex items-center gap-1">
              <Plug className="h-3.5 w-3.5" />
              <span className="font-medium text-foreground">{load.powerW} VA</span>
              <span className={TOOLTIP_BUBBLE_CLASSES}>Potência nominal</span>
            </span>
            <span
              className={cn(
                'group relative flex items-center gap-1',
                peakCalcMode === 'select' && !includedInPeak && 'opacity-50'
              )}
            >
              <Zap className="h-3.5 w-3.5" />
              <span className="font-medium text-foreground">{loadPeakW.toFixed(0)} VA</span>
              <span className={TOOLTIP_BUBBLE_CLASSES}>
                {peakCalcMode === 'select' && !includedInPeak
                  ? 'Potência de pico (não contabilizada — carga desmarcada)'
                  : 'Potência de pico (nominal × IP/IN × quantidade)'}
              </span>
            </span>
            <span className="group relative flex items-center gap-1">
              <BatteryCharging className="h-3.5 w-3.5" />
              <span className="font-medium text-foreground">{loadEnergyKwh.toFixed(2)} kWh</span>
              <span className={TOOLTIP_BUBBLE_CLASSES}>Consumo diário estimado</span>
            </span>
            <span className={cn(!voltageValid && 'font-medium text-destructive')}>
              {voltageV}V ·{' '}
              {phaseType === 'trifasica'
                ? 'Trifásica'
                : load.phase2
                  ? `Mono · Fases ${phase}-${load.phase2}`
                  : `Mono${phaseCount > 1 ? ` · Fase ${phase}` : ''}`}
              {!voltageValid && ' · tensão incompatível'}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {peakCalcMode === 'select' && (
            <Button
              variant="ghost"
              size="icon"
              className="group relative shrink-0 md:h-7 md:w-7"
              onClick={(event) => {
                event.stopPropagation();
                onUpdate(load.id, { includedInPeak: !includedInPeak });
              }}
              aria-pressed={includedInPeak}
              aria-label={
                includedInPeak
                  ? `Não contar ${load.name} na potência de pico`
                  : `Contar ${load.name} na potência de pico`
              }
            >
              <Zap className={cn('h-3.5 w-3.5', includedInPeak ? 'text-primary' : 'text-muted-foreground')} />
              <span className={cn(TOOLTIP_BUBBLE_CLASSES, 'left-auto right-0')}>
                {includedInPeak
                  ? 'Conta na potência de pico — clique para excluir'
                  : 'Não conta na potência de pico — clique para incluir'}
              </span>
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0 md:h-7 md:w-7"
            onClick={(event) => {
              event.stopPropagation();
              onRemove(load.id);
            }}
            aria-label={`Remover ${load.name}`}
          >
            <Trash2 className="h-3.5 w-3.5 text-destructive" />
          </Button>
          <ChevronDown
            className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', expanded && 'rotate-180')}
            aria-hidden="true"
          />
        </div>
      </div>
      {expanded && (
      <div className="grid grid-cols-2 gap-2 border-t p-3">
        <div>
          <Label htmlFor={`hours-${load.id}`} className="text-xs font-normal text-muted-foreground">
            <InfoLabel
              label="Horas/dia"
              tip="Tempo médio de uso diário desse equipamento. Usado para calcular o consumo em kWh/dia."
            />
          </Label>
          <NumberFieldWithClear
            id={`hours-${load.id}`}
            value={hours}
            placeholder="Ex.: 4"
            min={0.5}
            max={24}
            step={0.5}
            onChange={(value) => handleChange('hoursPerDay', value, setHours)}
            onBlur={() => revertIfInvalid(hours, load.hoursPerDay, setHours)}
            onClear={() => setHours('')}
          />
        </div>
        <div>
          <Label htmlFor={`qty-${load.id}`} className="text-xs font-normal text-muted-foreground">
            <InfoLabel label="Quantidade" tip="Número de unidades desse equipamento na instalação." />
          </Label>
          <NumberFieldWithClear
            id={`qty-${load.id}`}
            value={qty}
            placeholder="Ex.: 1"
            min={1}
            onChange={(value) => handleChange('qty', value, setQty)}
            onBlur={() => revertIfInvalid(qty, load.qty, setQty)}
            onClear={() => setQty('')}
          />
        </div>
        <div>
          <Label htmlFor={`ip-in-${load.id}`} className="text-xs font-normal text-muted-foreground">
            <InfoLabel
              label="IP/IN"
              tip="Relação entre a potência aparente de partida (pico) e a nominal. Motores e compressores (ar-condicionado, geladeira, bombas) costumam partir com 2 a 3× a potência nominal; cargas resistivas/eletrônicas usam 1."
            />
          </Label>
          <NumberFieldWithClear
            id={`ip-in-${load.id}`}
            value={ipIn}
            placeholder="Ex.: 1"
            min={1}
            step={0.1}
            onChange={(value) => handleChange('ipInRatio', value, setIpIn)}
            onBlur={() => revertIfInvalid(ipIn, load.ipInRatio ?? 1, setIpIn)}
            onClear={() => setIpIn('')}
          />
        </div>
        <div>
          <Label htmlFor={`usage-factor-${load.id}`} className="text-xs font-normal text-muted-foreground">
            <InfoLabel
              label="Fator de uso"
              tip="Fração do tempo (0 a 1) em que a carga fica efetivamente ligada dentro do período diário informado — por exemplo, um compressor que liga e desliga por termostato. Define o consumo real em kWh/dia; não afeta o pico de potência."
            />
          </Label>
          <NumberFieldWithClear
            id={`usage-factor-${load.id}`}
            value={usageFactor}
            placeholder="Ex.: 1"
            min={0}
            max={1}
            step={0.05}
            onChange={(value) => handleChange('usageFactor', value, setUsageFactor)}
            onBlur={revertUsageFactorIfInvalid}
            onClear={() => setUsageFactor('')}
          />
        </div>
      </div>
      )}
      {expanded && (
      <div className="grid grid-cols-1 gap-2 border-t p-3 sm:grid-cols-3">
        <div>
          <Label className="text-xs font-normal text-muted-foreground">
            <InfoLabel label="Tensão" tip="Tensão de operação da carga. Só mostra as tensões disponíveis na rede escolhida." />
          </Label>
          <div className="mt-1 flex gap-1 rounded-lg bg-muted p-1">
            {(voltageValid ? voltageOptions : [...voltageOptions, voltageV]).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={voltageV === option}
                onClick={() => onUpdate(load.id, { voltageV: option as 110 | 220 | 380 })}
                className={cn(
                  'h-7 flex-1 rounded-md text-xs font-medium transition',
                  voltageV === option
                    ? !voltageValid
                      ? 'bg-destructive/10 text-destructive ring-1 ring-destructive/40'
                      : 'bg-background text-foreground shadow-sm ring-1 ring-border'
                    : 'text-muted-foreground hover:bg-background/60 hover:text-foreground'
                )}
              >
                {option}V
              </button>
            ))}
          </div>
        </div>
        <div>
          <Label className="text-xs font-normal text-muted-foreground">
            <InfoLabel label="Tipo" tip="Se a carga liga em uma única fase (mono) ou distribui a potência pelas três fases (trifásica)." />
          </Label>
          <div className="mt-1 flex gap-1 rounded-lg bg-muted p-1">
            <button
              type="button"
              aria-pressed={phaseType === 'mono'}
              onClick={() => onUpdate(load.id, { phaseType: 'mono' })}
              className={cn(
                'h-7 flex-1 rounded-md text-xs font-medium transition',
                phaseType === 'mono'
                  ? 'bg-background text-foreground shadow-sm ring-1 ring-border'
                  : 'text-muted-foreground hover:bg-background/60 hover:text-foreground'
              )}
            >
              Mono
            </button>
            {phaseCount === 3 && (
              <button
                type="button"
                aria-pressed={phaseType === 'trifasica'}
                onClick={() => onUpdate(load.id, { phaseType: 'trifasica' })}
                className={cn(
                  'h-7 flex-1 rounded-md text-xs font-medium transition',
                  phaseType === 'trifasica'
                    ? 'bg-background text-foreground shadow-sm ring-1 ring-border'
                    : 'text-muted-foreground hover:bg-background/60 hover:text-foreground'
                )}
              >
                Trifásica
              </button>
            )}
          </div>
        </div>
        {phaseCount > 1 && phaseType === 'mono' && needsTwoPhases && phaseCount === 3 && (
          <div>
            <Label className="text-xs font-normal text-muted-foreground">
              <InfoLabel
                label="Fases"
                tip="Essa tensão é obtida ligando a carga entre duas fases (não fase-neutro), então a potência soma nas duas fases escolhidas."
              />
            </Label>
            <div className="mt-1 flex gap-1 rounded-lg bg-muted p-1">
              {phasePairs.map(([a, b]) => {
                const active = phase === a && load.phase2 === b;
                return (
                  <button
                    key={`${a}${b}`}
                    type="button"
                    aria-pressed={active}
                    onClick={() => onUpdate(load.id, { phase: a, phase2: b })}
                    className={cn(
                      'h-7 flex-1 rounded-md text-xs font-medium transition',
                      active
                        ? 'bg-background text-foreground shadow-sm ring-1 ring-border'
                        : 'text-muted-foreground hover:bg-background/60 hover:text-foreground'
                    )}
                  >
                    {a}-{b}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {phaseCount === 2 && phaseType === 'mono' && needsTwoPhases && (
          <div>
            <Label className="text-xs font-normal text-muted-foreground">
              <InfoLabel
                label="Fases"
                tip="Essa tensão é obtida ligando a carga entre duas fases (não fase-neutro), então a potência soma nas duas fases da rede."
              />
            </Label>
            <div className="mt-1 flex gap-1 rounded-lg bg-muted p-1">
              <button
                type="button"
                aria-pressed="true"
                disabled
                className="h-7 flex-1 rounded-md bg-background text-xs font-medium text-foreground shadow-sm ring-1 ring-border"
              >
                L1-L2
              </button>
            </div>
          </div>
        )}
        {phaseCount > 1 && phaseType === 'mono' && !needsTwoPhases && (
          <div>
            <Label className="text-xs font-normal text-muted-foreground">
              <InfoLabel label="Fase" tip="Em qual fase da rede essa carga está conectada, para acompanhar o equilíbrio entre fases." />
            </Label>
            <div className="mt-1 flex gap-1 rounded-lg bg-muted p-1">
              {loadPhases.slice(0, phaseCount).map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={phase === option}
                  onClick={() => onUpdate(load.id, { phase: option })}
                  className={cn(
                    'h-7 flex-1 rounded-md text-xs font-medium transition',
                    phase === option
                      ? 'bg-background text-foreground shadow-sm ring-1 ring-border'
                      : 'text-muted-foreground hover:bg-background/60 hover:text-foreground'
                  )}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      )}
    </div>
  );
}
