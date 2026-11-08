// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { modularFixture } from '@/supabase/functions/_shared/commercial-industrial/modular.test-fixtures';
import { CiModularCatalogEditor } from './CiModularCatalogEditor';

const mocks = vi.hoisted(() => ({ load: vi.fn(), savePcs: vi.fn(), saveBattery: vi.fn(), saveRule: vi.fn() }));
vi.mock('./CiProductCatalogEditor', () => ({CiProductCatalogEditor: () => <p>Produtos próprios C&I</p>}));
vi.mock('@/lib/data/ci-modular-catalog-repository', () => ({ loadCiModularCatalog: mocks.load, saveCiPcsSpec: mocks.savePcs, saveCiBatterySpec: mocks.saveBattery, saveCiCompatibilityRule: mocks.saveRule }));
function fixture() {
  const data = modularFixture();
  return { ...data, inverterOptions: data.pcs.map((pcs) => ({ id: pcs.inverter_id, model: pcs.model,power_kw:pcs.discharge_power_kw,battery_ports:pcs.batteryPorts,battery_current_max_a:pcs.port_charge_current_a, battery_voltage_min_v: pcs.voltageMinV, battery_voltage_max_v: pcs.voltageMaxV, battery_charge_efficiency_percent: pcs.chargeEfficiencyPercent, battery_discharge_efficiency_percent: pcs.dischargeEfficiencyPercent })), batteryOptions: data.batteries.map((battery) => ({ id: battery.battery_id, model: battery.model, capacity_kwh: battery.capacityKwh, voltage_min_v: battery.voltageMinV, voltage_max_v: battery.voltageMaxV, min_soc_percent: battery.socMinPercent, round_trip_efficiency_percent: battery.roundTripEfficiencyPercent })) };
}
beforeEach(() => { vi.clearAllMocks(); mocks.load.mockResolvedValue(fixture()); mocks.savePcs.mockResolvedValue(undefined); mocks.saveRule.mockResolvedValue('new-rule'); });

describe('C&I modular administrative catalog', () => {
  it('opens each unified equipment catalog without a second registration tab', () => {
    render(<CiModularCatalogEditor uploadAsset={vi.fn()} integrated={<p>Catálogo integrado existente</p>} />);
    expect(screen.getByText('Catálogo integrado existente')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Inversores / PCS' }));
    expect(screen.getByText('Produtos próprios C&I')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cadastro de produtos' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Limites contínuos C&I' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Baterias C&I' }));
    expect(screen.getByText('Produtos próprios C&I')).toBeInTheDocument();
    expect(mocks.load).not.toHaveBeenCalled();
  });

  it('blocks an approved rule whose series voltage exceeds the inherited PCS range', async () => {
    render(<CiModularCatalogEditor uploadAsset={vi.fn()} integrated={null} />);
    fireEvent.click(screen.getByRole('button', { name: 'Compatibilidades' }));
    await screen.findByText('Composição de teste');
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Baterias em série: máximo'), { target: { value: '3' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('janela DC');
    expect(mocks.saveRule).not.toHaveBeenCalled();
    fireEvent.change(within(dialog).getByLabelText('Baterias em série: máximo'), { target: { value: '2' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(mocks.saveRule).toHaveBeenCalledTimes(1));
    expect(mocks.saveRule).toHaveBeenCalledWith(expect.objectContaining({ pcs_id: fixture().pcs[0].inverter_id, battery_id: fixture().batteries[0].battery_id, approval_status: 'approved', reference_document: 'Documento sintético de teste' }));
  });
});
