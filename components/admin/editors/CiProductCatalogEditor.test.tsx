// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyBattery, emptyInverter } from '../types';
import { CiProductCatalogEditor } from './CiProductCatalogEditor';

const mocks = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));
vi.mock('@/lib/supabase/client', () => ({ createClient: () => mocks }));
const pcs = { ...emptyInverter, id: 'pcs-1', model: 'PCS teste', power_kw: 100, standard_power_kva: 100, battery_current_max_a: 200 };
const battery = { ...emptyBattery, id: 'battery-1', model: 'Bateria teste', max_current_a: 100, min_soc_percent: 10 };
const pcsLimits = { inverter_id: pcs.id, active: true, charge_power_kw: 80, discharge_power_kw: 100, charge_current_a: 150, discharge_current_a: 160, port_charge_current_a: 150, port_discharge_current_a: 160, port_charge_power_kw: 25, max_parallel_units: 4, max_strings_per_port: 2, supports_backup: true };
const batteryLimits = { battery_id: battery.id, active: true, unit_kind: 'rack', charge_power_kw: 40, discharge_power_kw: 45, charge_current_a: 80, discharge_current_a: 90, soc_max_percent: 95 };

beforeEach(() => {
  vi.clearAllMocks();
  const rows: Record<string, unknown[]> = { ci_inverters: [pcs], ci_pcs_specs: [pcsLimits], ci_batteries: [battery], ci_battery_specs: [batteryLimits] };
  mocks.from.mockImplementation((table: string) => {
    const result = { data: rows[table] ?? [], error: null };
    const query = { select: vi.fn(), order: vi.fn(), then: (resolve: (r: unknown) => unknown) => Promise.resolve(result).then(resolve) };
    query.select.mockReturnValue(query); query.order.mockReturnValue(query);
    return query;
  });
  mocks.rpc.mockImplementation(async (name, args) => ({ data: name === 'save_ci_equipment'
    ? { product: { ...args.p_product, id: args.p_id ?? 'new-id' }, limits: args.p_limits && { ...args.p_limits, [args.p_kind === 'pcs' ? 'inverter_id' : 'battery_id']: args.p_id ?? 'new-id' } } : null, error: null }));
});

function setup(kind: 'pcs' | 'batteries' = 'pcs') {
  const activity = vi.fn();
  render(<CiProductCatalogEditor kind={kind} uploadAsset={vi.fn()} onViewRules={vi.fn()} onActivity={activity} />);
  return activity;
}
async function edit() {
  fireEvent.click(await screen.findByRole('button', { name: 'Editar' }));
  return within(screen.getByRole('dialog'));
}

describe('Unified C&I equipment registration', () => {
  it('loads identification and PCS limits in the same form and saves both with the original ID', async () => {
    const activity = setup();
    const dialog = await edit();
    expect(dialog.getByLabelText('Modelo')).toHaveValue('PCS teste');
    expect(dialog.getByLabelText('Corrente contínua de descarga CC por porta (A)')).toHaveValue(160);
    fireEvent.change(dialog.getByLabelText('Potência contínua de carga AC (kW)'), { target: { value: '70' } });
    fireEvent.change(dialog.getByPlaceholderText('Ex.: Inversor Compacto'), { target: { value: 'PCS atualizado' } });
    fireEvent.click(dialog.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith('save_ci_equipment', expect.objectContaining({ p_id: 'pcs-1', p_kind: 'pcs', p_product: expect.objectContaining({ nickname: 'PCS atualizado' }), p_limits: expect.objectContaining({ charge_power_kw: 70, port_charge_current_a: 150, port_discharge_current_a: 160, max_parallel_units: 4 }) })));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(activity).toHaveBeenCalledWith(expect.objectContaining({ targetId: 'pcs-1', action: 'update' }));
    const reopened = await edit();
    expect(reopened.getByLabelText('Potência contínua de carga AC (kW)')).toHaveValue(70);
  });

  it('saves battery limits and identification together and preserves unsaved limits across the media tab', async () => {
    setup('batteries');
    const dialog = await edit();
    fireEvent.change(dialog.getByLabelText('SOC máximo (%)'), { target: { value: '90' } });
    fireEvent.click(dialog.getByRole('button', { name: 'Mídias' }));
    fireEvent.click(dialog.getByRole('button', { name: 'Informações' }));
    expect(dialog.getByLabelText('SOC máximo (%)')).toHaveValue(90);
    fireEvent.click(dialog.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith('save_ci_equipment', expect.objectContaining({ p_kind: 'batteries', p_id: 'battery-1', p_limits: expect.objectContaining({ unit_kind: 'rack', soc_max_percent: 90, charge_current_a: 80, discharge_current_a: 90 }) })));
  });

  it('clears the previous equipment limits when creating a new draft', async () => {
    setup(); await edit();
    fireEvent.click(screen.getByRole('button', { name: /Fechar Editar inversor/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Novo inversor' }));
    const dialog = within(screen.getByRole('dialog'));
    expect(dialog.getByLabelText('Potência contínua de carga AC (kW)')).toHaveValue(null);
    fireEvent.change(dialog.getByLabelText('Modelo'), { target: { value: 'PCS rascunho' } });
    fireEvent.click(dialog.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith('save_ci_equipment', expect.objectContaining({ p_id: null, p_limits: null })));
    expect(await screen.findByText('Limites pendentes')).toBeInTheDocument();
  });

  it.each([
    ['pcs', 'Corrente contínua de carga CC por porta (A)', '201', 'por porta'],
    ['pcs', 'Potência contínua de descarga AC (kW)', '101', 'potência nominal'],
    ['batteries', 'Corrente contínua de descarga por unidade (A)', '101', 'corrente máxima'],
    ['batteries', 'SOC máximo (%)', '5', 'SOC mínimo'],
  ] as const)('rejects inconsistent %s limits before saving (%s)', async (kind, label, value, message) => {
    setup(kind); const dialog = await edit();
    fireEvent.change(dialog.getByLabelText(label), { target: { value } });
    fireEvent.click(dialog.getByRole('button', { name: 'Salvar' }));
    expect(await dialog.findByRole('alert')).toHaveTextContent(message);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('keeps the form and edits available when the transaction fails', async () => {
    setup(); const dialog = await edit();
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'Falha ao salvar limites' } });
    fireEvent.change(dialog.getByLabelText('Potência contínua de carga AC (kW)'), { target: { value: '75' } });
    fireEvent.click(dialog.getByRole('button', { name: 'Salvar' }));
    expect(await dialog.findByRole('alert')).toHaveTextContent('Falha ao salvar limites');
    expect(dialog.getByLabelText('Potência contínua de carga AC (kW)')).toHaveValue(75);
    fireEvent.click(dialog.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('requires the continuous ratings before saving a customized parallel limit', async () => {
    setup();
    await screen.findByRole('button', { name: 'Editar' });
    fireEvent.click(screen.getByRole('button', { name: 'Novo inversor' }));
    const dialog = within(screen.getByRole('dialog'));
    fireEvent.change(dialog.getByLabelText('Modelo'), { target: { value: 'PCS incompleto' } });
    fireEvent.change(dialog.getByLabelText('Máximo de PCS em paralelo'), { target: { value: '6' } });
    fireEvent.click(dialog.getByRole('button', { name: 'Salvar' }));
    expect(await dialog.findByRole('alert')).toHaveTextContent('Preencha as potências e correntes contínuas');
    expect(dialog.getByLabelText('Máximo de PCS em paralelo')).toHaveValue(6);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
