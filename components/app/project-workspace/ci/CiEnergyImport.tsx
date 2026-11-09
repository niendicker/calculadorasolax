'use client';

import { useCiAcPower } from './ci-ac-power';
import { useId, useState, type ReactNode } from 'react';
import { FileUp } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { InfoTooltip } from '@/components/ui/tooltip';
import { Select } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { importEnergyProfiles, readEnergyImportTable, suggestEnergyImportMapping, type EnergyImportMapping, type EnergyImportResult, type EnergyImportTable, type EnergyImportUnit } from '@/supabase/functions/_shared/commercial-industrial/energy-profile-import';
import { DEFAULT_CI_SOLAR_CONFIG, type CommercialIndustrialOptions, type LoadCurve } from '@/supabase/functions/_shared/commercial-industrial/types';

export function curvesAlign(load: LoadCurve, generation: LoadCurve): boolean {
  const timestamps = new Set(generation.points.map((point) => Date.parse(point.timestamp)));
  return load.resolutionMinutes === generation.resolutionMinutes && load.points.every((point) => timestamps.has(Date.parse(point.timestamp)));
}

export function CiEnergyImport({ ciOptions, onChange, onImported, defaultSeries = 'consumption', actions }: {
  actions?: ReactNode;
  defaultSeries?: 'consumption' | 'generation';
  ciOptions: CommercialIndustrialOptions;
  onChange: (partial: Partial<CommercialIndustrialOptions>) => void;
  onImported?: (result: Extract<EnergyImportResult, { ok: true }>, fileName: string) => void;
}) {
  const { factor } = useCiAcPower(ciOptions.acPowerFactor);
  const id = useId();
  const [table, setTable] = useState<EnergyImportTable | null>(null);
  const [mapping, setMapping] = useState<EnergyImportMapping | null>(null);
  const [fileName, setFileName] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [reading, setReading] = useState(false);
  const [success, setSuccess] = useState('');
  const timezone = ciOptions.loadCurve?.timezone ?? ciOptions.solar?.generationCurve?.timezone ?? 'America/Sao_Paulo';

  const preview = table && mapping ? importEnergyProfiles(table, { ...mapping, powerFactor: factor }) : null;
  const previewCurve = preview?.ok ? preview.consumption ?? preview.generation : null;

  function updateMapping(partial: Partial<EnergyImportMapping>) {
    setMapping((current) => current ? { ...current, ...partial } : current);
    setErrors([]);
  }

  function applyImport() {
    if (!table || !mapping) return;
    const result = importEnergyProfiles(table, { ...mapping, powerFactor: factor });
    if (!result.ok) { setErrors(result.errors); return; }
    const load = result.consumption ?? ciOptions.loadCurve;
    const generation = result.generation ?? (ciOptions.solar?.enabled ? ciOptions.solar.generationCurve : null);
    if (load && generation && !curvesAlign(load, generation)) {
      setErrors(['Consumo e geração precisam cobrir os mesmos horários e usar o mesmo intervalo. Importe os dois no mesmo arquivo ou ajuste o período.']);
      return;
    }
    const partial: Partial<CommercialIndustrialOptions> = {};
    if (result.consumption) partial.loadCurve = result.consumption;
    if (result.generation) partial.solar = { ...(ciOptions.solar ?? DEFAULT_CI_SOLAR_CONFIG), enabled: true, generationCurve: result.generation, generationPoints: undefined };
    onChange(partial);
    onImported?.(result, fileName);
    setSuccess(`${result.consumption && result.generation ? 'Consumo e geração importados. Curva de carga e Solar FV preenchidos' : result.consumption ? 'Consumo importado. Curva de carga preenchida' : 'Geração importada. Solar FV preenchido'} · ${(result.consumption ?? result.generation)!.points.length} amostras · ${mapping.resolutionMinutes} min.`);
    setTable(null);
    setMapping(null);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
      <label className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'cursor-pointer gap-1.5 text-xs focus-within:ring-3 focus-within:ring-ring/50')}>
        <FileUp className="h-4 w-4" aria-hidden="true" />Importar CSV
        <input type="file" accept=".csv,text/csv,.txt,text/plain" aria-label="Importar CSV de consumo e geração" className="sr-only" disabled={reading} onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (!file) return;
          setErrors([]); setSuccess(''); setTable(null); setMapping(null);
          if (file.size > 5 * 1024 * 1024) { setErrors(['O arquivo deve ter no máximo 5 MB e conter até 7 dias de medições.']); return; }
          setReading(true); setFileName(file.name);
          const reader = new FileReader();
          reader.onload = () => {
            try {
              const parsed = readEnergyImportTable(String(reader.result ?? ''));
              setTable(parsed); setMapping(suggestEnergyImportMapping(parsed, timezone, defaultSeries));
            } catch (error) { setErrors([error instanceof Error ? error.message : 'Não foi possível ler o CSV.']); }
            finally { setReading(false); }
          };
          reader.onerror = () => { setErrors(['Não foi possível ler o arquivo. Tente novamente.']); setReading(false); };
          reader.readAsText(file);
        }} />
      </label>
      <InfoTooltip label="Sobre a importação CSV">Importe até 7 dias em intervalos de 15, 30 ou 60 minutos. Use consumo total da instalação e geração FV em AC, antes do BESS. Energia em kWh é convertida em potência média pelo intervalo; confira as unidades e os horários. Fontes em kVA usam o FP do projeto para calcular a energia ativa.</InfoTooltip>
      {actions}
      </div>
      {reading && <p role="status" className="text-xs text-muted-foreground">Lendo arquivo…</p>}
      {success && <p role="status" className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">{success}</p>}
      {errors.length > 0 && <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"><p className="font-medium">Não foi possível importar o arquivo</p><ul className="mt-1 list-disc pl-5">{errors.map((error) => <li key={error}>{error}</li>)}</ul></div>}
      {table && mapping && <div className="space-y-4 rounded-xl border bg-muted/15 p-4">
        <div><h3 className="text-sm font-semibold">Importar consumo e geração</h3><p className="mt-1 break-all text-xs text-muted-foreground">{fileName} · {table.rows.length} linhas</p></div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="space-y-1 text-xs font-medium" htmlFor={`${id}-date`}>Data e hora<Select id={`${id}-date`} value={mapping.timestamp} onChange={(event) => updateMapping({ timestamp: Number(event.target.value) })}>{table.headers.map((header, index) => <option key={index} value={index}>{header}</option>)}</Select></label>
          {(['consumption', 'generation'] as const).map((kind) => <div key={kind} className="space-y-2">
            <label className="block space-y-1 text-xs font-medium" htmlFor={`${id}-${kind}`}>{kind === 'consumption' ? 'Coluna de consumo' : 'Coluna de geração'}<Select id={`${id}-${kind}`} value={mapping[kind] ?? ''} onChange={(event) => updateMapping({ [kind]: event.target.value === '' ? null : Number(event.target.value) })}><option value="">Não importar</option>{table.headers.map((header, index) => <option key={index} value={index}>{header}</option>)}</Select></label>
            <label className="block space-y-1 text-xs" htmlFor={`${id}-${kind}-unit`}>Unidade de {kind === 'consumption' ? 'consumo' : 'geração'}<Select id={`${id}-${kind}-unit`} disabled={mapping[kind] === null} value={mapping[`${kind}Unit`]} onChange={(event) => updateMapping({ [`${kind}Unit`]: event.target.value as EnergyImportUnit })}>{['kVA', 'VA', 'MVA', 'kW', 'W', 'MW', 'kWh', 'Wh', 'MWh'].map((unit) => <option key={unit} value={unit}>{unit}</option>)}</Select></label>
          </div>)}
          <label className="space-y-1 text-xs font-medium" htmlFor={`${id}-resolution`}>Intervalo das medições<Select id={`${id}-resolution`} value={mapping.resolutionMinutes} onChange={(event) => updateMapping({ resolutionMinutes: Number(event.target.value) as 15 | 30 | 60 })}>{[15, 30, 60].map((value) => <option key={value} value={value}>{value} minutos</option>)}</Select></label>
          <label className="space-y-1 text-xs font-medium" htmlFor={`${id}-timezone`}>Fuso horário do arquivo<Select id={`${id}-timezone`} value={mapping.timezone} onChange={(event) => updateMapping({ timezone: event.target.value })}><option value="America/Sao_Paulo">Brasília (UTC-3)</option><option value="America/Manaus">Manaus / Cuiabá (UTC-4)</option></Select></label>
          <label className="space-y-1 text-xs font-medium" htmlFor={`${id}-position`}>Data e hora representam<Select id={`${id}-position`} value={mapping.timestampPosition ?? 'start'} onChange={(event) => updateMapping({ timestampPosition: event.target.value as 'start' | 'end' })}><option value="start">Início do intervalo</option><option value="end">Fim do intervalo</option></Select></label>
        </div>
        {previewCurve && <p className="rounded-lg border bg-background p-3 text-xs">Período detectado: {previewCurve.periodStart} a {previewCurve.periodEnd} · {previewCurve.points.length} amostras de {previewCurve.resolutionMinutes} min. {preview?.ok && preview.consumption && preview.generation ? 'Consumo e geração identificados: as duas etapas serão preenchidas.' : 'Apenas a série selecionada será atualizada.'}</p>}
        <div className="flex flex-wrap gap-2"><Button type="button" size="sm" onClick={applyImport}>Importar dados</Button><Button type="button" size="sm" variant="ghost" onClick={() => { setTable(null); setMapping(null); setErrors([]); }}>Cancelar importação</Button></div>
      </div>}
    </div>
  );
}
