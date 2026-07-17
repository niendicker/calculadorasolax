'use client';

import { useState } from 'react';
import {
  AlertTriangle,
  Battery,
  Calculator,
  Check,
  FileText,
  FolderOpen,
  Home,
  ImagePlus,
  ListChecks,
  Loader2,
  Save,
  Settings,
  Sun,
  Trash2,
  Zap,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { LoadSelector } from '@/components/wizard/LoadSelector';
import { DESIRED_FEATURE_DEFINITIONS } from '@/lib/desired-features';
import type {
  BatteryTopology,
  DesiredFeatureId,
  GeneratorConfig,
  MicrogridConfig,
  ProductDocument,
  ResidentialGridType,
  Solution,
  UserStockItem,
  WhiteTariffConfig,
} from '@/lib/types';
import { cn } from '@/lib/utils';
import { calculateSystemCost, calculateTariffSavings, formatCurrencyBRL, parseAccessoryLabel } from '../helpers';
import { PageHeader, PageSummary } from '../shell/slots';
import {
  BatteryCardsSkeleton,
  DocPreviewModal,
  ImagePreviewModal,
  Metric,
  ProductAttachments,
  Requirement,
  SolutionSkeleton,
} from '../shared-ui';
import { gridOptions, type BatteryCatalogOption, type InverterCatalogOption, type ProductMedia } from '../types';

export function SizingTab({
  title,
  subtitle,
  projectName,
  loadingLabel,
  calculateLabel,
  residentialOptions,
  batteryCatalog,
  inverterCatalog,
  availableInverterModels,
  solution,
  peakW,
  dailyKwh,
  canCalculate,
  loading,
  initialLoading,
  error,
  setTopology,
  setBatteryModel,
  setInverterModel,
  setGridType,
  setDesiredFeatures,
  setWhiteTariffConfig,
  setMicrogridConfig,
  setGeneratorConfig,
  setAtsPhotoUrl,
  onUploadFeaturePhoto,
  resetResidential,
  calculate,
  exportPdf,
  saveProject,
  productMedia,
  userStockItems,
  onChooseMicrogridVariant,
}: {
  title: string;
  subtitle: string;
  projectName: string;
  loadingLabel: string;
  calculateLabel: string;
  residentialOptions: {
    topology: BatteryTopology | null;
    batteryModel: string | null;
    inverterModel: string | null;
    gridType: ResidentialGridType | null;
    loads: unknown[];
    desiredFeatures: DesiredFeatureId[];
    whiteTariff: WhiteTariffConfig | null;
    microgrid: MicrogridConfig | null;
    generator: GeneratorConfig | null;
    atsPhotoUrl: string | null;
    maxPowerPerPhaseW: number | null;
  };
  batteryCatalog: BatteryCatalogOption[];
  inverterCatalog: InverterCatalogOption[];
  availableInverterModels: Set<string> | null;
  solution: Solution | null;
  peakW: number;
  dailyKwh: number;
  canCalculate: boolean;
  loading: boolean;
  initialLoading: boolean;
  error: string | null;
  setTopology: (topology: BatteryTopology) => void;
  setBatteryModel: (batteryModel: string | null) => void;
  setInverterModel: (inverterModel: string | null) => void;
  setGridType: (gridType: ResidentialGridType) => void;
  setDesiredFeatures: (desiredFeatures: DesiredFeatureId[]) => void;
  setWhiteTariffConfig: (whiteTariff: WhiteTariffConfig | null) => void;
  setMicrogridConfig: (microgrid: MicrogridConfig | null) => void;
  setGeneratorConfig: (generator: GeneratorConfig | null) => void;
  setAtsPhotoUrl: (atsPhotoUrl: string | null) => void;
  onUploadFeaturePhoto: (file: File, slot: 'ats' | 'microgrid' | 'generator') => Promise<string>;
  resetResidential: () => void;
  calculate: () => void;
  exportPdf: () => void;
  saveProject: () => void;
  productMedia: Record<string, ProductMedia>;
  userStockItems: UserStockItem[];
  onChooseMicrogridVariant: (variant: 'economic' | 'microgrid') => void;
}) {
  return (
    <>
      <PageHeader>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            {projectName && (
              <Badge variant="secondary" className="gap-1">
                <FolderOpen className="h-3 w-3" />
                {projectName}
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={saveProject}>
            <Save className="h-4 w-4" />
            Salvar projeto
          </Button>
          <Button variant="outline" onClick={() => resetResidential()}>
            Limpar
          </Button>
          {solution && (
            <Button variant="outline" onClick={exportPdf}>
              <FileText className="h-4 w-4" />
              Exportar PDF
            </Button>
          )}
          <Button onClick={calculate} disabled={!canCalculate || loading}>
            <Calculator className="h-4 w-4" />
            {loading ? loadingLabel : calculateLabel}
          </Button>
        </div>
      </PageHeader>

      <PageSummary>
        <div className="grid grid-cols-2 gap-3">
          <Metric label="Pico" value={`${(peakW / 1000).toFixed(2)} kVA`} />
          <Metric label="Consumo" value={`${dailyKwh.toFixed(2)} kWh/dia`} />
        </div>
        <Separator />
        {error && (
          <p role="alert" className="rounded-lg border border-destructive/40 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
        {loading ? (
          <SolutionSkeleton />
        ) : !solution ? (
          <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            <p>Configure os dados para ver a solução recomendada.</p>
            <ul className="mt-3 space-y-1">
              <Requirement done={Boolean(residentialOptions.topology)} label="Topologia da bateria" />
              <Requirement done={Boolean(residentialOptions.batteryModel)} label="Modelo da bateria" />
              <Requirement done={Boolean(residentialOptions.gridType)} label="Tipo de rede" />
              <Requirement done={residentialOptions.loads.length > 0} label="Cargas da instalação" />
            </ul>
          </div>
        ) : (
          <ResultSummary
            solution={solution}
            onExport={exportPdf}
            productMedia={productMedia}
            userStockItems={userStockItems}
            whiteTariff={residentialOptions.whiteTariff}
            onChooseMicrogridVariant={onChooseMicrogridVariant}
          />
        )}
      </PageSummary>

      <div className="mt-4 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Settings className="h-4 w-4" />
                Configuração
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3 rounded-lg border bg-background p-3">
                <p className="text-sm font-medium">Tipo de rede</p>
                <div
                  className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1 sm:grid-cols-4"
                  role="radiogroup"
                  aria-label="Tipo de rede"
                >
                  {gridOptions.map((option) => {
                    const active = residentialOptions.gridType === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => setGridType(option.value)}
                        className={cn(
                          'flex h-14 flex-col items-center justify-center gap-1 rounded-md px-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                          active
                            ? 'bg-background text-foreground shadow-sm ring-1 ring-border'
                            : 'text-muted-foreground hover:bg-background/60 hover:text-foreground'
                        )}
                      >
                        {option.label}
                        <span
                          className={cn(
                            'rounded-full px-1.5 py-0.5 text-[0.7rem]',
                            active ? 'bg-primary/10 text-primary' : 'bg-background'
                          )}
                        >
                          {option.detail}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <InverterModelPicker
                  inverters={inverterCatalog}
                  availableModels={availableInverterModels}
                  selectedModel={residentialOptions.inverterModel}
                  loading={initialLoading}
                  setInverterModel={setInverterModel}
                  userStockItems={userStockItems}
                />
              </div>

              <BatteryModelPicker
                batteries={batteryCatalog}
                topology={residentialOptions.topology}
                selectedModel={residentialOptions.batteryModel}
                loading={initialLoading}
                setTopology={setTopology}
                setBatteryModel={setBatteryModel}
                userStockItems={userStockItems}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <ListChecks className="h-4 w-4" />
                Funcionalidades desejadas
              </CardTitle>
            </CardHeader>
            <CardContent>
              <DesiredFeaturesPicker
                value={residentialOptions.desiredFeatures}
                onChange={setDesiredFeatures}
                whiteTariff={residentialOptions.whiteTariff}
                onWhiteTariffChange={setWhiteTariffConfig}
                microgrid={residentialOptions.microgrid}
                onMicrogridChange={setMicrogridConfig}
                generator={residentialOptions.generator}
                onGeneratorChange={setGeneratorConfig}
                atsPhotoUrl={residentialOptions.atsPhotoUrl}
                onAtsPhotoUrlChange={setAtsPhotoUrl}
                onUploadPhoto={onUploadFeaturePhoto}
              />
            </CardContent>
          </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Home className="h-4 w-4" />
              Cargas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <LoadSelector />
          </CardContent>
        </Card>
      </div>
    </>
  );
}

const emptyWhiteTariffConfig: WhiteTariffConfig = {
  requiredPowerW: 0,
  requiredEnergyWh: 0,
  includeBackupReserve: false,
  tariffSpreadPerKwh: 0,
};

const emptyMicrogridConfig: MicrogridConfig = {
  onGridPhases: 1,
  onGridApparentPowerVA: 0,
  isFundamentalRequirement: false,
  photoUrl: null,
};

const emptyGeneratorConfig: GeneratorConfig = {
  voltageV: 220,
  phases: 1,
  apparentPowerVA: 0,
  photoUrl: null,
};

const phaseOptions: { value: 1 | 2 | 3; label: string }[] = [
  { value: 1, label: 'Monofásico' },
  { value: 2, label: 'Bifásico' },
  { value: 3, label: 'Trifásico' },
];

function PhasePicker({
  value,
  onChange,
  ariaLabel,
}: {
  value: 1 | 2 | 3;
  onChange: (value: 1 | 2 | 3) => void;
  ariaLabel: string;
}) {
  return (
    <div className="flex flex-wrap gap-1 rounded-lg bg-muted p-1" role="radiogroup" aria-label={ariaLabel}>
      {phaseOptions.map((option) => {
        const active = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={cn(
              'h-9 min-w-[88px] flex-1 rounded-md text-sm font-medium transition focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
              active
                ? 'bg-background text-foreground shadow-sm ring-1 ring-border'
                : 'text-muted-foreground hover:bg-background/60 hover:text-foreground'
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function PhotoUploadField({
  label,
  photoUrl,
  slot,
  onUploadPhoto,
  onChange,
}: {
  label: string;
  photoUrl: string | null;
  slot: 'ats' | 'microgrid' | 'generator';
  onUploadPhoto: (file: File, slot: 'ats' | 'microgrid' | 'generator') => Promise<string>;
  onChange: (url: string | null) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const url = await onUploadPhoto(file, slot);
      onChange(url);
    } catch {
      setError('Não foi possível enviar a imagem. Tente novamente.');
    } finally {
      setUploading(false);
    }
  }

  const inputId = `photo-upload-${slot}`;

  return (
    <div className="space-y-1.5">
      <div className="rounded-lg border bg-card p-3">
        {photoUrl ? (
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photoUrl}
              alt={label}
              className="h-20 w-20 shrink-0 rounded-md border bg-background object-cover"
            />
            <div className="min-w-0 space-y-2">
              <p className="text-xs text-muted-foreground">{label}</p>
              <div className="flex flex-wrap gap-2">
                <label htmlFor={inputId} className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'cursor-pointer')}>
                  Trocar foto
                </label>
                <Button type="button" variant="outline" size="sm" onClick={() => onChange(null)}>
                  <Trash2 className="h-3.5 w-3.5" />
                  Remover
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <label
            htmlFor={inputId}
            className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed border-input py-6 text-center text-sm text-muted-foreground transition hover:border-primary/50 hover:bg-muted/60 hover:text-foreground"
          >
            {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
            <span className="font-medium text-foreground">{uploading ? 'Enviando...' : 'Anexar foto'}</span>
            {!uploading && <span className="text-xs">{label}</span>}
          </label>
        )}
        <input
          id={inputId}
          type="file"
          accept="image/*"
          className="hidden"
          disabled={uploading}
          onChange={(event) => handleFile(event.target.files?.[0])}
        />
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function DesiredFeaturesPicker({
  value,
  onChange,
  whiteTariff,
  onWhiteTariffChange,
  microgrid,
  onMicrogridChange,
  generator,
  onGeneratorChange,
  atsPhotoUrl,
  onAtsPhotoUrlChange,
  onUploadPhoto,
}: {
  value: DesiredFeatureId[];
  onChange: (value: DesiredFeatureId[]) => void;
  whiteTariff: WhiteTariffConfig | null;
  onWhiteTariffChange: (whiteTariff: WhiteTariffConfig | null) => void;
  microgrid: MicrogridConfig | null;
  onMicrogridChange: (microgrid: MicrogridConfig | null) => void;
  generator: GeneratorConfig | null;
  onGeneratorChange: (generator: GeneratorConfig | null) => void;
  atsPhotoUrl: string | null;
  onAtsPhotoUrlChange: (atsPhotoUrl: string | null) => void;
  onUploadPhoto: (file: File, slot: 'ats' | 'microgrid' | 'generator') => Promise<string>;
}) {
  function toggle(id: DesiredFeatureId) {
    if (value.includes(id)) {
      onChange(value.filter((item) => item !== id));
      if (id === 'white_tariff') onWhiteTariffChange(null);
      if (id === 'microgrid') onMicrogridChange(null);
      if (id === 'external_generator') onGeneratorChange(null);
    } else {
      onChange([...value, id]);
      if (id === 'white_tariff' && !whiteTariff) onWhiteTariffChange(emptyWhiteTariffConfig);
      if (id === 'microgrid' && !microgrid) onMicrogridChange(emptyMicrogridConfig);
      if (id === 'external_generator' && !generator) onGeneratorChange(emptyGeneratorConfig);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {DESIRED_FEATURE_DEFINITIONS.map((feature) => {
          const active = value.includes(feature.id);
          return (
            <button
              key={feature.id}
              type="button"
              aria-pressed={active}
              title={feature.description}
              onClick={() => toggle(feature.id)}
              className={cn(
                'rounded-full border px-3 py-1.5 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                active
                  ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                  : 'border-input bg-background text-muted-foreground hover:border-primary/50 hover:bg-muted/60 hover:text-foreground'
              )}
            >
              {feature.label}
            </button>
          );
        })}
      </div>

      {value.includes('external_ats') && (
        <div className="space-y-3 rounded-lg border bg-background p-3">
          <p className="text-sm font-semibold">ATS Externo</p>
          <PhotoUploadField
            label="Foto do disjuntor geral"
            photoUrl={atsPhotoUrl}
            slot="ats"
            onUploadPhoto={onUploadPhoto}
            onChange={onAtsPhotoUrlChange}
          />
        </div>
      )}

      {value.includes('white_tariff') && (
        <div className="space-y-3 rounded-lg border bg-background p-3">
          <p className="text-sm font-semibold">Tarifa Branca</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="whiteTariffPower">Potência (W)</Label>
              <Input
                id="whiteTariffPower"
                type="number"
                min={0}
                placeholder="Ex.: 3000"
                value={whiteTariff?.requiredPowerW || ''}
                onChange={(event) =>
                  onWhiteTariffChange({
                    ...(whiteTariff ?? emptyWhiteTariffConfig),
                    requiredPowerW: Number(event.target.value) || 0,
                  })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="whiteTariffEnergy">Energia (Wh)</Label>
              <Input
                id="whiteTariffEnergy"
                type="number"
                min={0}
                placeholder="Ex.: 5000"
                value={whiteTariff?.requiredEnergyWh || ''}
                onChange={(event) =>
                  onWhiteTariffChange({
                    ...(whiteTariff ?? emptyWhiteTariffConfig),
                    requiredEnergyWh: Number(event.target.value) || 0,
                  })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="whiteTariffSpread">Spread (R$/kWh)</Label>
              <Input
                id="whiteTariffSpread"
                type="number"
                min={0}
                step={0.01}
                placeholder="Ex.: 0.35"
                value={whiteTariff?.tariffSpreadPerKwh || ''}
                onChange={(event) =>
                  onWhiteTariffChange({
                    ...(whiteTariff ?? emptyWhiteTariffConfig),
                    tariffSpreadPerKwh: Number(event.target.value) || 0,
                  })
                }
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={whiteTariff?.includeBackupReserve ?? false}
              onChange={(event) =>
                onWhiteTariffChange({
                  ...(whiteTariff ?? emptyWhiteTariffConfig),
                  includeBackupReserve: event.target.checked,
                })
              }
            />
            Reservar para backup das cargas
          </label>
        </div>
      )}

      {value.includes('microgrid') && (
        <div className="space-y-3 rounded-lg border bg-background p-3">
          <p className="text-sm font-semibold">Microrrede</p>
          <p className="text-xs text-muted-foreground">Dados do sistema ongrid existente a ser conectado.</p>
          <p className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            A microrrede só é compatível se a potência aparente do sistema ongrid for menor que a potência do
            inversor híbrido e das baterias da solução aprovada (e, quando o inversor limitar a potência por fase,
            menor também que esse limite por fase).
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="microgridPower">Potência (VA)</Label>
            <Input
              id="microgridPower"
              type="number"
              min={0}
              placeholder="Ex.: 3000"
              value={microgrid?.onGridApparentPowerVA || ''}
              onChange={(event) =>
                onMicrogridChange({
                  ...(microgrid ?? emptyMicrogridConfig),
                  onGridApparentPowerVA: Number(event.target.value) || 0,
                })
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label>Fases</Label>
            <PhasePicker
              value={microgrid?.onGridPhases ?? 1}
              ariaLabel="Fases do sistema ongrid"
              onChange={(phases) =>
                onMicrogridChange({
                  ...(microgrid ?? emptyMicrogridConfig),
                  onGridPhases: phases,
                })
              }
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={microgrid?.isFundamentalRequirement ?? false}
              onChange={(event) =>
                onMicrogridChange({
                  ...(microgrid ?? emptyMicrogridConfig),
                  isFundamentalRequirement: event.target.checked,
                })
              }
            />
            Requisito fundamental
          </label>
          <p className="text-xs text-muted-foreground">
            Se não for fundamental, você poderá escolher entre a versão econômica e a versão com microrrede.
          </p>
          <PhotoUploadField
            label="Foto da etiqueta do inversor ongrid"
            photoUrl={microgrid?.photoUrl ?? null}
            slot="microgrid"
            onUploadPhoto={onUploadPhoto}
            onChange={(photoUrl) => onMicrogridChange({ ...(microgrid ?? emptyMicrogridConfig), photoUrl })}
          />
        </div>
      )}

      {value.includes('external_generator') && (
        <div className="space-y-3 rounded-lg border bg-background p-3">
          <p className="text-sm font-semibold">Gerador Externo</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="generatorVoltage">Tensão (V)</Label>
              <Input
                id="generatorVoltage"
                type="number"
                min={0}
                placeholder="Ex.: 220"
                value={generator?.voltageV || ''}
                onChange={(event) =>
                  onGeneratorChange({
                    ...(generator ?? emptyGeneratorConfig),
                    voltageV: Number(event.target.value) || 0,
                  })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="generatorPower">Potência (VA)</Label>
              <Input
                id="generatorPower"
                type="number"
                min={0}
                placeholder="Ex.: 5000"
                value={generator?.apparentPowerVA || ''}
                onChange={(event) =>
                  onGeneratorChange({
                    ...(generator ?? emptyGeneratorConfig),
                    apparentPowerVA: Number(event.target.value) || 0,
                  })
                }
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Fases</Label>
            <PhasePicker
              value={generator?.phases ?? 1}
              ariaLabel="Fases do gerador"
              onChange={(phases) =>
                onGeneratorChange({
                  ...(generator ?? emptyGeneratorConfig),
                  phases,
                })
              }
            />
          </div>
          {!value.includes('external_ats') && (
            <p className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Gerador Externo normalmente exige ATS Externo — considere selecionar essa funcionalidade também.
            </p>
          )}
          <PhotoUploadField
            label="Foto da etiqueta do gerador"
            photoUrl={generator?.photoUrl ?? null}
            slot="generator"
            onUploadPhoto={onUploadPhoto}
            onChange={(photoUrl) => onGeneratorChange({ ...(generator ?? emptyGeneratorConfig), photoUrl })}
          />
        </div>
      )}
    </div>
  );
}

function BatteryModelPicker({
  batteries,
  topology,
  selectedModel,
  loading,
  setTopology,
  setBatteryModel,
  userStockItems,
}: {
  batteries: BatteryCatalogOption[];
  topology: BatteryTopology | null;
  selectedModel: string | null;
  loading: boolean;
  setTopology: (topology: BatteryTopology) => void;
  setBatteryModel: (batteryModel: string | null) => void;
  userStockItems: UserStockItem[];
}) {
  const [previewDoc, setPreviewDoc] = useState<ProductDocument | null>(null);
  const [previewImage, setPreviewImage] = useState<{ url: string; alt: string } | null>(null);
  const activeTopology = topology === 'LowVoltage' ? 'LV' : 'HV';
  const visibleBatteries = batteries.filter((battery) => battery.topology === activeTopology);
  const counts = {
    HV: batteries.filter((battery) => battery.topology === 'HV').length,
    LV: batteries.filter((battery) => battery.topology === 'LV').length,
  };

  function selectTab(nextTopology: 'HV' | 'LV') {
    setTopology(nextTopology === 'HV' ? 'HighVoltage' : 'LowVoltage');
  }

  function selectBattery(battery: BatteryCatalogOption) {
    if (battery.topology !== activeTopology) {
      setTopology(battery.topology === 'HV' ? 'HighVoltage' : 'LowVoltage');
    } else if (!topology) {
      setTopology(battery.topology === 'HV' ? 'HighVoltage' : 'LowVoltage');
    }
    setBatteryModel(battery.model);
  }

  return (
    <div className="space-y-3 rounded-lg border bg-background p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium">Modelo da bateria</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Selecione um modelo cadastrado pelo admin.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
          {(['HV', 'LV'] as const).map((tab) => {
            const active = activeTopology === tab;
            return (
              <button
                key={tab}
                type="button"
                className={cn(
                  'flex h-8 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium transition',
                  active
                    ? 'bg-background text-foreground shadow-sm ring-1 ring-border'
                    : 'text-muted-foreground hover:bg-background/60 hover:text-foreground'
                )}
                aria-pressed={active}
                onClick={() => selectTab(tab)}
              >
                {tab}
                <span className={cn('rounded-full px-1.5 py-0.5 text-[0.7rem]', active ? 'bg-primary/10 text-primary' : 'bg-background')}>
                  {counts[tab]}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {loading ? (
        <BatteryCardsSkeleton />
      ) : visibleBatteries.length === 0 ? (
        <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          Nenhuma bateria {activeTopology} cadastrada.
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {visibleBatteries.map((battery) => {
            const selected = selectedModel === battery.model;
            const usefulEnergyKwh = battery.capacityKwh * (1 - battery.minSocPercent / 100);
            const inStock = userStockItems.some(
              (item) => item.productType === 'battery' && item.productModel === battery.model
            );
            return (
              <div
                key={battery.id}
                role="button"
                tabIndex={0}
                aria-pressed={selected}
                onClick={() => selectBattery(battery)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    selectBattery(battery);
                  }
                }}
                className={cn(
                  'grid cursor-pointer gap-3 rounded-lg border bg-card p-3 text-left transition focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:grid-cols-[72px_1fr]',
                  selected ? 'border-accent bg-primary/10 shadow-sm' : 'hover:border-primary/50 hover:bg-muted/60'
                )}
              >
                <div className="flex h-20 items-center justify-center overflow-hidden rounded-lg border bg-background">
                  {battery.imageUrl ? (
                    <button
                      type="button"
                      className="flex h-full w-full cursor-zoom-in items-center justify-center transition hover:bg-muted/70"
                      onClick={(event) => {
                        event.stopPropagation();
                        setPreviewImage({ url: battery.imageUrl as string, alt: battery.model });
                      }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={battery.imageUrl} alt={battery.model} className="h-full w-full object-contain p-2" />
                    </button>
                  ) : (
                    <Battery className="h-8 w-8 text-muted-foreground" />
                  )}
                </div>
                <div className="min-w-0 space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 break-words text-sm font-semibold leading-snug">{battery.model}</p>
                    <div className="flex shrink-0 flex-wrap justify-end gap-1">
                      {inStock && (
                        <Badge variant="secondary" className="gap-1" title="Você tem esse modelo no seu catálogo">
                          <Check className="h-3 w-3" />
                          No catálogo
                        </Badge>
                      )}
                      <Badge variant="secondary">{battery.topology}</Badge>
                    </div>
                  </div>
                  <div className="grid gap-1 text-xs text-muted-foreground">
                    <span>Capacidade: {battery.capacityKwh} kWh</span>
                    <span>
                      Energia útil: {usefulEnergyKwh.toFixed(2)} kWh · SOC mín. {battery.minSocPercent}%
                    </span>
                    <span>
                      Potência: {battery.standardPowerKw ?? '-'} kW · pico {battery.peakPowerKw ?? '-'} kW
                    </span>
                  </div>
                  <div className="flex min-w-0 flex-wrap gap-1">
                    {battery.documents.length > 0 ? (
                      battery.documents.map((document) => (
                        <button
                          key={`${battery.id}-${document.url}`}
                          type="button"
                          className="max-w-full truncate rounded-md border bg-background px-2 py-1 text-xs text-primary hover:bg-primary/10"
                          onClick={(event) => { event.stopPropagation(); setPreviewDoc(document); }}
                        >
                          {document.name || 'Documento'}
                        </button>
                      ))
                    ) : (
                      <span className="text-xs text-muted-foreground">Sem anexos</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <DocPreviewModal doc={previewDoc} onClose={() => setPreviewDoc(null)} />
      <ImagePreviewModal image={previewImage} onClose={() => setPreviewImage(null)} />
    </div>
  );
}

function InverterModelPicker({
  inverters,
  availableModels,
  selectedModel,
  loading,
  setInverterModel,
  userStockItems,
}: {
  inverters: InverterCatalogOption[];
  availableModels: Set<string> | null;
  selectedModel: string | null;
  loading: boolean;
  setInverterModel: (inverterModel: string | null) => void;
  userStockItems: UserStockItem[];
}) {
  const [previewDoc, setPreviewDoc] = useState<ProductDocument | null>(null);
  const [previewImage, setPreviewImage] = useState<{ url: string; alt: string } | null>(null);
  const visibleInverters = availableModels
    ? inverters.filter((inverter) => availableModels.has(inverter.model))
    : inverters;

  return (
    <div className="space-y-3 border-t pt-3">
      <div>
        <p className="text-sm font-medium">Modelo do inversor</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Escolha um modelo específico ou deixe em &quot;Todos&quot; para o sistema escolher automaticamente.
        </p>
      </div>

      {loading ? (
        <BatteryCardsSkeleton />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          <div
            role="button"
            tabIndex={0}
            aria-pressed={selectedModel === null}
            onClick={() => setInverterModel(null)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                setInverterModel(null);
              }
            }}
            className={cn(
              'grid cursor-pointer place-items-center gap-2 rounded-lg border bg-card p-3 text-center transition focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
              selectedModel === null ? 'border-accent bg-primary/10 shadow-sm' : 'hover:border-primary/50 hover:bg-muted/60'
            )}
          >
            <Zap className="h-6 w-6 text-muted-foreground" />
            <div>
              <p className="text-sm font-semibold">Todos</p>
              <p className="text-xs text-muted-foreground">O sistema escolhe o melhor inversor</p>
            </div>
          </div>

          {visibleInverters.map((inverter) => {
            const selected = selectedModel === inverter.model;
            const inStock = userStockItems.some(
              (item) => item.productType === 'inverter' && item.productModel === inverter.model
            );
            return (
              <div
                key={inverter.id}
                role="button"
                tabIndex={0}
                aria-pressed={selected}
                onClick={() => setInverterModel(inverter.model)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setInverterModel(inverter.model);
                  }
                }}
                className={cn(
                  'grid cursor-pointer gap-3 rounded-lg border bg-card p-3 text-left transition focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:grid-cols-[72px_1fr]',
                  selected ? 'border-accent bg-primary/10 shadow-sm' : 'hover:border-primary/50 hover:bg-muted/60'
                )}
              >
                <div className="flex h-20 items-center justify-center overflow-hidden rounded-lg border bg-background">
                  {inverter.imageUrl ? (
                    <button
                      type="button"
                      className="flex h-full w-full cursor-zoom-in items-center justify-center transition hover:bg-muted/70"
                      onClick={(event) => {
                        event.stopPropagation();
                        setPreviewImage({ url: inverter.imageUrl as string, alt: inverter.model });
                      }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={inverter.imageUrl} alt={inverter.model} className="h-full w-full object-contain p-2" />
                    </button>
                  ) : (
                    <Zap className="h-8 w-8 text-muted-foreground" />
                  )}
                </div>
                <div className="min-w-0 space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 break-words text-sm font-semibold leading-snug">{inverter.model}</p>
                    <div className="flex shrink-0 flex-wrap justify-end gap-1">
                      {inStock && (
                        <Badge variant="secondary" className="gap-1" title="Você tem esse modelo no seu catálogo">
                          <Check className="h-3 w-3" />
                          No catálogo
                        </Badge>
                      )}
                      <Badge variant="secondary">{inverter.topology}</Badge>
                    </div>
                  </div>
                  <div className="grid gap-1 text-xs text-muted-foreground">
                    <span>Fases: {inverter.phases}</span>
                    <span>
                      Potência: {inverter.standardPowerKva ?? '-'} kVA · pico {inverter.peakPowerKva ?? '-'} kVA
                    </span>
                  </div>
                  <div className="flex min-w-0 flex-wrap gap-1">
                    {inverter.documents.length > 0 ? (
                      inverter.documents.map((document) => (
                        <button
                          key={`${inverter.id}-${document.url}`}
                          type="button"
                          className="max-w-full truncate rounded-md border bg-background px-2 py-1 text-xs text-primary hover:bg-primary/10"
                          onClick={(event) => { event.stopPropagation(); setPreviewDoc(document); }}
                        >
                          {document.name || 'Documento'}
                        </button>
                      ))
                    ) : (
                      <span className="text-xs text-muted-foreground">Sem anexos</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {visibleInverters.length === 0 && (
            <div className="col-span-full rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              Nenhum inversor com solução aprovada para este tipo de rede.
            </div>
          )}
        </div>
      )}
      <DocPreviewModal doc={previewDoc} onClose={() => setPreviewDoc(null)} />
      <ImagePreviewModal image={previewImage} onClose={() => setPreviewImage(null)} />
    </div>
  );
}

function ResultSummary({
  solution,
  onExport,
  productMedia,
  userStockItems,
  whiteTariff,
  onChooseMicrogridVariant,
}: {
  solution: Solution;
  onExport: () => void;
  productMedia: Record<string, ProductMedia>;
  userStockItems: UserStockItem[];
  whiteTariff: WhiteTariffConfig | null;
  onChooseMicrogridVariant: (variant: 'economic' | 'microgrid') => void;
}) {
  const [previewDoc, setPreviewDoc] = useState<ProductDocument | null>(null);
  const [previewImage, setPreviewImage] = useState<{ url: string; alt: string } | null>(null);
  const inverterMedia = productMedia[solution.inverterModel];
  const batteryMedia = productMedia[solution.batteryModel];
  const systemCost = calculateSystemCost(solution, userStockItems);
  const tariffSavings = calculateTariffSavings(whiteTariff);

  if (solution.microgridAlternative) {
    return (
      <MicrogridVariantChoice
        economic={solution}
        withMicrogrid={solution.microgridAlternative}
        onChoose={onChooseMicrogridVariant}
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg border bg-background p-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Zap className="h-4 w-4 text-accent" />
          Inversor
        </div>
        <p className="mt-1 text-lg font-semibold">{solution.inverterModel}</p>
        <p className="text-sm text-muted-foreground">Quantidade: x{solution.inverterQty ?? 1}</p>
        <ProductAttachments media={inverterMedia} onPreview={setPreviewDoc} onPreviewImage={setPreviewImage} />
      </div>

      <div className="rounded-lg border bg-background p-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Battery className="h-4 w-4 text-primary" />
          Bateria
        </div>
        <p className="mt-1 text-lg font-semibold">{solution.batteryModel}</p>
        <p className="text-sm text-muted-foreground">Quantidade: x{solution.batteryQty}</p>
        <ProductAttachments media={batteryMedia} onPreview={setPreviewDoc} onPreviewImage={setPreviewImage} />
      </div>

      {solution.pvPowerKw !== null && (
        <div className="rounded-lg border bg-background p-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Sun className="h-4 w-4 text-primary" />
            FV recomendado
          </div>
          <p className="mt-1 text-lg font-semibold">{solution.pvPowerKw.toFixed(2)} kWp</p>
        </div>
      )}

      {solution.accessories.length > 0 && (
        <div className="rounded-lg border bg-background p-3">
          <p className="text-sm font-medium">Acessórios</p>
          <div className="mt-2 space-y-2">
            {solution.accessories.map((accessory) => {
              const { model, qty, optional } = parseAccessoryLabel(accessory);
              return (
                <div key={accessory}>
                  <Badge variant="secondary">
                    {model}
                    {optional ? ' (opcional)' : ''}
                  </Badge>
                  <p className="mt-1 text-sm text-muted-foreground">Quantidade: x{qty}</p>
                  <ProductAttachments
                    media={productMedia[model]}
                    onPreview={setPreviewDoc}
                    onPreviewImage={setPreviewImage}
                    inline
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {(systemCost.pricedItemsCount > 0 || tariffSavings) && (
        <div className="rounded-lg border bg-background p-3">
          <p className="text-sm font-medium">Análise econômica</p>
          <div className="mt-2 space-y-2 text-sm">
            {systemCost.pricedItemsCount > 0 && (
              <div>
                <p className="text-muted-foreground">Custo total do sistema</p>
                <p className="text-lg font-semibold">{formatCurrencyBRL(systemCost.totalCost)}</p>
                {!systemCost.isComplete && (
                  <p className="text-xs text-muted-foreground">
                    Preço parcial: {systemCost.pricedItemsCount} de {systemCost.totalItemsCount} itens com valor no
                    seu catálogo.
                  </p>
                )}
              </div>
            )}
            {tariffSavings && (
              <div>
                <p className="text-muted-foreground">Economia estimada com Tarifa Branca</p>
                <p className="text-lg font-semibold">{formatCurrencyBRL(tariffSavings.monthlySavings)}/mês</p>
                <p className="text-xs text-muted-foreground">
                  {formatCurrencyBRL(tariffSavings.annualSavings)}/ano · considerando {tariffSavings.businessDaysPerMonth}{' '}
                  dias úteis/mês
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      <Button className="w-full" variant="outline" onClick={onExport}>
        <FileText className="h-4 w-4" />
        Exportar relatório em PDF
      </Button>

      <DocPreviewModal doc={previewDoc} onClose={() => setPreviewDoc(null)} />
      <ImagePreviewModal image={previewImage} onClose={() => setPreviewImage(null)} />
    </div>
  );
}

function MicrogridVariantChoice({
  economic,
  withMicrogrid,
  onChoose,
}: {
  economic: Solution;
  withMicrogrid: Solution;
  onChoose: (variant: 'economic' | 'microgrid') => void;
}) {
  const options: { variant: 'economic' | 'microgrid'; label: string; description: string; solution: Solution }[] = [
    {
      variant: 'economic',
      label: 'Versão Econômica',
      description: 'Menor sistema que atende às cargas e demais funcionalidades, sem garantir a microrrede.',
      solution: economic,
    },
    {
      variant: 'microgrid',
      label: 'Versão c/ Microrrede',
      description: 'Sistema dimensionado para suportar o sistema ongrid junto com a microrrede.',
      solution: withMicrogrid,
    },
  ];

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
        <p className="text-sm font-medium">Escolha uma versão do sistema</p>
        <p className="mt-1 text-xs text-muted-foreground">
          A Microrrede não é um requisito fundamental e exigi-la deixaria o sistema maior que o necessário. Compare
          as duas opções abaixo e escolha qual usar.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {options.map((option) => (
          <div key={option.variant} className="flex flex-col gap-3 rounded-lg border bg-background p-3">
            <div>
              <p className="text-sm font-semibold">{option.label}</p>
              <p className="mt-1 text-xs text-muted-foreground">{option.description}</p>
            </div>
            <div className="space-y-2 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Inversor</p>
                <p className="font-medium">
                  {option.solution.inverterModel} · x{option.solution.inverterQty ?? 1}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Bateria</p>
                <p className="font-medium">
                  {option.solution.batteryModel} · x{option.solution.batteryQty}
                </p>
              </div>
            </div>
            <Button size="sm" onClick={() => onChoose(option.variant)}>
              Usar esta versão
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
