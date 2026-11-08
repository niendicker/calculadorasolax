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
  it('preserves integrated products and edits PCS ratings by the C&I catalog ID', async () => {
    const onActivity = vi.fn();
    render(<CiModularCatalogEditor uploadAsset={vi.fn()} integrated={<p>Catálogo integrado existente</p>} onActivity={onActivity} />);
    expect(screen.getByText('Catálogo integrado existente')).toBeInTheDocument();
    expect(mocks.load).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Inversores / PCS' }));
    fireEvent.click(screen.getByRole('button', { name: 'Limites contínuos C&I' }));
    await screen.findByText('PCS teste 100');
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Potência contínua de carga AC (kW)'), { target: { value: '70' } });
    fireEvent.change(within(dialog).getByLabelText('Corrente contínua de carga CC por porta (A)'), {target:{value:'150'}});
    fireEvent.change(within(dialog).getByLabelText('Corrente contínua de descarga CC por porta (A)'), {target:{value:'160'}});
    fireEvent.change(within(dialog).getByLabelText('Limite adicional de carga CC por porta (kW)'), {target:{value:'20'}});
    fireEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(mocks.savePcs).toHaveBeenCalledTimes(1));
    expect(mocks.savePcs).toHaveBeenCalledWith(expect.objectContaining({ inverter_id: fixture().pcs[0].inverter_id, charge_power_kw: 70,discharge_power_kw:100,port_charge_current_a:150,port_discharge_current_a:160,port_charge_power_kw:20 }));
    expect(mocks.savePcs.mock.calls[0][0]).not.toHaveProperty('model');
    expect(onActivity).toHaveBeenCalledWith(expect.objectContaining({ entityType: 'ci_pcs', action: 'update' }));
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

it('rejects a per-port current above the physical per-port catalog rating',async()=>{
 render(<CiModularCatalogEditor uploadAsset={vi.fn()} integrated={null}/>);
 fireEvent.click(screen.getByRole('button',{name:'Inversores / PCS'}));fireEvent.click(screen.getByRole('button',{name:'Limites contínuos C&I'}));
 await screen.findByText('PCS teste 100');fireEvent.click(screen.getByRole('button',{name:'Editar'}));const dialog=screen.getByRole('dialog');
 fireEvent.change(within(dialog).getByLabelText('Corrente contínua de carga CC por porta (A)'),{target:{value:'201'}});
 fireEvent.click(within(dialog).getByRole('button',{name:'Salvar'}));expect(await within(dialog).findByRole('alert')).toHaveTextContent('por porta');expect(mocks.savePcs).not.toHaveBeenCalled();
});
