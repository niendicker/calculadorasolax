'use client';

import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { FieldHelpLabel } from '../field-help';
import { Field } from '../shared-ui';
import type { CiEquipmentLimits } from './ci-equipment-limits';

export function CiEquipmentLimitsFields({ kind, value, onChange }: {
  kind: 'pcs' | 'batteries';
  value: CiEquipmentLimits;
  onChange: (value: CiEquipmentLimits) => void;
}) {
  const number = (key: keyof CiEquipmentLimits, label: string, fallback?: number, integer = false) => (
    <Field key={key} label={label}>
      <Input type="number" aria-label={label} min={integer ? 1 : 0.000001} step={integer ? 1 : 'any'}
        value={value[key] as number | null | undefined ?? fallback ?? ''}
        onChange={event => onChange({ ...value, [key]: event.target.value === '' ? undefined : Number(event.target.value) })} />
    </Field>
  );
  const check = (key: 'active' | 'supports_backup', label: string, fallback: boolean) => (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" aria-label={label} checked={value[key] ?? fallback}
        onChange={event => onChange({ ...value, [key]: event.target.checked })} />
      <FieldHelpLabel label={label} />
    </label>
  );
  return <section className="space-y-3 rounded-lg border bg-background p-3" aria-label="Limites contínuos de operação">
    <h3 className="text-sm font-semibold">Limites contínuos de operação</h3>
    <p className="text-xs text-muted-foreground">Valores sustentados, distintos dos limites de pico. Sem as potências e correntes contínuas, o equipamento fica com limites pendentes e não pode compor novas soluções.</p>
    {kind === 'batteries' && <Field label="Unidade comercial">
      <Select aria-label="Unidade comercial" value={value.unit_kind ?? 'rack'}
        onChange={event => onChange({ ...value, unit_kind: event.target.value as CiEquipmentLimits['unit_kind'] })}>
        <option value="module">Módulo</option><option value="rack">Rack</option><option value="cabinet">Gabinete</option>
      </Select>
    </Field>}
    <div className="grid gap-3 sm:grid-cols-2">
      {kind === 'pcs' ? <>
        {number('charge_power_kw', 'Potência contínua de carga AC (kW)')}
        {number('discharge_power_kw', 'Potência contínua de descarga AC (kW)')}
        {number('port_charge_current_a', 'Corrente contínua de carga CC por porta (A)')}
        {number('port_discharge_current_a', 'Corrente contínua de descarga CC por porta (A)')}
        {number('max_strings_per_port', 'Máximo de strings em paralelo por porta', 1, true)}
        {number('max_parallel_units', 'Máximo de PCS em paralelo', 1, true)}
        {number('port_charge_power_kw', 'Limite adicional de carga CC por porta (kW)')}
        {number('port_discharge_power_kw', 'Limite adicional de descarga CC por porta (kW)')}
      </> : <>
        {number('charge_power_kw', 'Potência contínua de carga DC por unidade (kW)')}
        {number('discharge_power_kw', 'Potência contínua de descarga DC por unidade (kW)')}
        {number('charge_current_a', 'Corrente contínua de carga por unidade (A)')}
        {number('discharge_current_a', 'Corrente contínua de descarga por unidade (A)')}
        {number('soc_max_percent', 'SOC máximo (%)', 100)}
      </>}
    </div>
    {kind === 'pcs' && check('supports_backup', 'PCS apto a operar em backup', false)}
    {check('active', kind === 'pcs' ? 'Ativo' : 'Ativa', true)}
  </section>;
}
