// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Client, ProjectInfo, Solution, UserStockItem } from '@/lib/types';
import type { BatteryCatalogOption, InlineProfile } from './types';
import { PrintableReport } from './PrintableReport';

const projectInfo: ProjectInfo = { name: 'Casa de praia', clientId: 'c1', address: 'Rua X, 1', notes: '' };

const client: Client = {
  id: 'c1',
  name: 'Fulano',
  email: 'fulano@x.com',
  phone: '11999999999',
  document: '123.456.789-00',
  notes: '',
  createdAt: '',
  updatedAt: '',
};

const solution: Solution = {
  inverterId: 'i1',
  inverterModel: 'X1-Hybrid-5.0kW-G4',
  inverterQty: 1,
  inverterRatedPowerW: 5000,
  batteryId: 'b1',
  batteryModel: 'TP-HS3.6',
  batteryQty: 1,
  availableEnergyWh: 3200,
  pvPowerKw: 5,
  accessories: [],
  comments: [],
};

const load = { id: 'l1', name: 'Chuveiro', powerW: 5500, hoursPerDay: 1, qty: 1 };

function baseProps(overrides: Partial<Parameters<typeof PrintableReport>[0]> = {}) {
  return {
    projectInfo,
    client,
    profile: null as InlineProfile | null,
    solution,
    loads: [load],
    topology: 'HighVoltage' as const,
    selectedBatteryModel: 'TP-HS3.6',
    gridType: 'singlePhase_220' as const,
    peakW: 5500,
    dailyKwh: 5.5,
    userStockItems: [] as UserStockItem[],
    whiteTariff: null,
    batteryCatalog: [] as BatteryCatalogOption[],
    ...overrides,
  };
}

describe('PrintableReport: header', () => {
  it('falls back to the SolaX brand name when there is no company profile', () => {
    render(<PrintableReport {...baseProps()} />);
    expect(screen.getByText('SolaX Power Brasil')).toBeInTheDocument();
  });

  it('shows the company name, address and logo when a profile is given', () => {
    render(
      <PrintableReport
        {...baseProps({
          profile: {
            id: 'u1',
            email: 'a@b.com',
            fullName: '',
            phone: '',
            role: 'user',
            companyName: 'Integradora XPTO',
            companyAddress: 'Av. Principal, 100',
            companyLogoUrl: 'https://cdn.example.com/logo.png',
          },
        })}
      />
    );
    expect(screen.getByText('Integradora XPTO')).toBeInTheDocument();
    expect(screen.getByText('Av. Principal, 100')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Integradora XPTO' })).toHaveAttribute('src', 'https://cdn.example.com/logo.png');
  });
});

describe('PrintableReport: project and client info', () => {
  it('shows project and client details, and dashes when there is no client', () => {
    const { rerender } = render(<PrintableReport {...baseProps()} />);
    expect(screen.getByText('Casa de praia')).toBeInTheDocument();
    expect(screen.getByText('Fulano')).toBeInTheDocument();

    rerender(<PrintableReport {...baseProps({ client: null, projectInfo: { ...projectInfo, name: '', address: '' } })} />);
    expect(screen.getAllByText('-').length).toBeGreaterThan(0);
  });

  it('only shows the "Observações" row when there are notes', () => {
    const { rerender } = render(<PrintableReport {...baseProps()} />);
    expect(screen.queryByText('Observações')).not.toBeInTheDocument();

    rerender(<PrintableReport {...baseProps({ projectInfo: { ...projectInfo, notes: 'Cliente prefere contato por WhatsApp.' } })} />);
    expect(screen.getByText('Cliente prefere contato por WhatsApp.')).toBeInTheDocument();
  });
});

describe('PrintableReport: recommended products', () => {
  it('lists the inverter and battery with their quantities', () => {
    render(<PrintableReport {...baseProps()} />);
    expect(screen.getByText('X1-Hybrid-5.0kW-G4')).toBeInTheDocument();
    expect(screen.getAllByText('TP-HS3.6').length).toBeGreaterThan(0);
    expect(screen.getByText('5000 VA nominal')).toBeInTheDocument();
    expect(screen.getByText('3.20 kWh disponíveis')).toBeInTheDocument();
  });

  it('shows the PV row only when pvPowerKw is not null', () => {
    const { rerender } = render(<PrintableReport {...baseProps({ solution: { ...solution, pvPowerKw: null } })} />);
    expect(screen.queryByText('Potência FV recomendada')).not.toBeInTheDocument();

    rerender(<PrintableReport {...baseProps({ solution: { ...solution, pvPowerKw: 6.5 } })} />);
    expect(screen.getByText('Potência FV recomendada')).toBeInTheDocument();
    expect(screen.getByText('6.50 kWp')).toBeInTheDocument();
  });

  it('lists each accessory as its own row', () => {
    render(<PrintableReport {...baseProps({ solution: { ...solution, accessories: ['Smart Meter', 'X1-Matebox'] } })} />);
    expect(screen.getByText('Smart Meter')).toBeInTheDocument();
    expect(screen.getByText('X1-Matebox')).toBeInTheDocument();
  });

  it('breaks down the battery model into Master + expansion units when the catalog defines one', () => {
    const batteryCatalog: BatteryCatalogOption[] = [
      {
        id: 'b1',
        model: 'T58 V2 Master',
        capacityKwh: 5.8,
        topology: 'HV',
        standardPowerKw: 2.88,
        peakPowerKw: 4.032,
        minSocPercent: 10,
        expansionModel: 'T58 Slave',
        imageUrl: null,
        documents: [],
      },
    ];
    render(
      <PrintableReport
        {...baseProps({
          solution: { ...solution, batteryModel: 'T58 V2 Master', batteryQty: 3 },
          batteryCatalog,
        })}
      />
    );
    expect(screen.getByText('1× T58 V2 Master + 2× T58 Slave')).toBeInTheDocument();
    expect(screen.queryByText('T58 V2 Master', { selector: 'td' })).not.toBeInTheDocument();
  });
});

describe('PrintableReport: loads table', () => {
  it('computes peak and daily energy per load row', () => {
    render(<PrintableReport {...baseProps({ loads: [{ id: 'l1', name: 'Chuveiro', powerW: 5500, hoursPerDay: 2, qty: 2 }] })} />);
    expect(screen.getByText('11000 VA')).toBeInTheDocument(); // peak = 5500 * 2
    expect(screen.getByText('22.00 kWh/dia')).toBeInTheDocument(); // energy = 5500*2*2/1000
  });
});

describe('PrintableReport: economic analysis section', () => {
  it('is hidden when there is no pricing and no white tariff', () => {
    render(<PrintableReport {...baseProps()} />);
    expect(screen.queryByText('Análise econômica')).not.toBeInTheDocument();
  });

  it('shows system cost when stock items are priced', () => {
    render(
      <PrintableReport
        {...baseProps({
          userStockItems: [
            { id: 's1', productType: 'inverter', productModel: 'X1-Hybrid-5.0kW-G4', unitValue: 10000, createdAt: '', updatedAt: '' },
          ],
        })}
      />
    );
    expect(screen.getByText('Análise econômica')).toBeInTheDocument();
    expect(screen.getByText(/parcial: 1 de 2 itens/)).toBeInTheDocument();
  });

  it('shows white tariff savings when configured', () => {
    render(
      <PrintableReport
        {...baseProps({
          whiteTariff: { requiredPowerW: 1000, requiredEnergyWh: 2000, includeBackupReserve: false, tariffSpreadPerKwh: 0.5 },
        })}
      />
    );
    expect(screen.getByText('Economia estimada com Tarifa Branca')).toBeInTheDocument();
  });
});

describe('PrintableReport: comments and footer', () => {
  it('lists comments only when present', () => {
    const { rerender } = render(<PrintableReport {...baseProps()} />);
    expect(screen.queryByText('Observações', { selector: 'h2' })).not.toBeInTheDocument();

    rerender(<PrintableReport {...baseProps({ solution: { ...solution, comments: ['Opcional: kit de paralelo.'] } })} />);
    expect(screen.getByText('Opcional: kit de paralelo.')).toBeInTheDocument();
  });

  it('shows the solution code in the footer, or a fallback', () => {
    const { rerender } = render(<PrintableReport {...baseProps({ solution: { ...solution, solutionCode: 'code-123' } })} />);
    expect(screen.getByText('Código: code-123')).toBeInTheDocument();

    rerender(<PrintableReport {...baseProps({ solution: { ...solution, solutionCode: undefined } })} />);
    expect(document.querySelector('footer')).toHaveTextContent('Calculadora SolaX');
  });
});
