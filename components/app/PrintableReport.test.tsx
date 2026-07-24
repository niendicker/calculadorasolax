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
    nominalW: 3000,
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

  it('highlights the nickname as the primary name, with the model as a caption underneath', () => {
    render(
      <PrintableReport
        {...baseProps({
          solution: {
            ...solution,
            accessories: [{ model: 'Smart Meter - M1-40', qty: 1, optional: false, appliesTo: 'system', comment: null }],
          },
          productMedia: {
            'X1-Hybrid-5.0kW-G4': { model: 'X1-Hybrid-5.0kW-G4', nickname: 'Inversor Prime', imageUrl: null, documents: [] },
            'TP-HS3.6': { model: 'TP-HS3.6', nickname: 'Bateria Compacta', imageUrl: null, documents: [] },
            'Smart Meter - M1-40': { model: 'Smart Meter - M1-40', nickname: 'Medidor Inteligente', imageUrl: null, documents: [] },
          },
        })}
      />
    );
    expect(screen.getByText('Inversor Prime')).toBeInTheDocument();
    expect(screen.getByText('X1-Hybrid-5.0kW-G4')).toBeInTheDocument();
    // "Bateria Compacta" also appears in the top "Bateria selecionada" metric.
    expect(screen.getAllByText('Bateria Compacta').length).toBeGreaterThan(0);
    expect(screen.getByText('TP-HS3.6')).toBeInTheDocument();
    expect(screen.getByText('Medidor Inteligente')).toBeInTheDocument();
    expect(screen.getByText('Smart Meter - M1-40')).toBeInTheDocument();
  });

  it('falls back to the model alone when there is no nickname for it', () => {
    render(<PrintableReport {...baseProps()} />);
    expect(screen.getByText('X1-Hybrid-5.0kW-G4')).toBeInTheDocument();
    // Only the caption line duplicates the model text when a nickname exists —
    // with no nickname, the model appears exactly once, as the bold name.
    expect(screen.getAllByText('X1-Hybrid-5.0kW-G4')).toHaveLength(1);
  });

  it('shows the PV row only when pvPowerKw is not null', () => {
    const { rerender } = render(<PrintableReport {...baseProps({ solution: { ...solution, pvPowerKw: null } })} />);
    expect(screen.queryByText('Potência FV recomendada')).not.toBeInTheDocument();

    rerender(<PrintableReport {...baseProps({ solution: { ...solution, pvPowerKw: 6.5 } })} />);
    expect(screen.getByText('Potência FV recomendada')).toBeInTheDocument();
    expect(screen.getByText('6.50 kWp')).toBeInTheDocument();
  });

  it('lists each accessory as its own row with its real quantity, status and comment', () => {
    render(
      <PrintableReport
        {...baseProps({
          solution: {
            ...solution,
            accessories: [
              { model: 'Smart Meter', qty: 2, optional: false, appliesTo: 'system', comment: null },
              {
                model: 'X1-Matebox',
                qty: 1,
                optional: true,
                appliesTo: 'inverter',
                comment: 'Instalar próximo ao quadro.',
              },
            ],
          },
        })}
      />
    );
    expect(screen.getByText('Smart Meter')).toBeInTheDocument();
    expect(screen.getByText('X1-Matebox')).toBeInTheDocument();
    expect(screen.getByText('×2')).toBeInTheDocument();
    expect(screen.getByText('Acessório obrigatório')).toBeInTheDocument();
    expect(screen.getByText('Opcional — Instalar próximo ao quadro.')).toBeInTheDocument();
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
    expect(screen.getByText('Bateria')).toBeInTheDocument();
    expect(screen.getByText('T58 V2 Master')).toBeInTheDocument();
    expect(screen.getByText('Bateria (expansão)')).toBeInTheDocument();
    expect(screen.getByText('T58 Slave')).toBeInTheDocument();
    expect(screen.getByText('×2')).toBeInTheDocument();
  });
});

describe('PrintableReport: solution metrics and operating margins', () => {
  it('shows the nominal/peak/energy metrics and margin rows for the proposed solution', () => {
    render(
      <PrintableReport
        {...baseProps({
          solution: { ...solution, inverterPeakPowerW: 8000 },
          desiredFeatures: ['backup'],
          nominalW: 1000,
          peakW: 2000,
          dailyKwh: 2,
        })}
      />
    );
    expect(screen.getByText('Potência nominal')).toBeInTheDocument();
    expect(screen.getByText('5.00 kVA')).toBeInTheDocument();
    expect(screen.getByText('8.00 kVA')).toBeInTheDocument();
    expect(screen.getByText('Energia disponível')).toBeInTheDocument();
    expect(screen.getByText('3.20 kWh')).toBeInTheDocument();

    expect(screen.getByText('Margens operacionais')).toBeInTheDocument();
    expect(screen.getByText(/Necessário 1\.00 kVA · Solução oferece 5\.00 kVA/)).toBeInTheDocument();
    expect(screen.getByText(/Necessário 2\.00 kVA · Solução oferece 8\.00 kVA/)).toBeInTheDocument();
    expect(screen.getByText(/Necessário 2\.00 kWh · Solução oferece 3\.20 kWh/)).toBeInTheDocument();
  });

  it('zeroes the margin requirement when Backup is disabled, even with loads still registered — same gating as the Solução tab', () => {
    render(
      <PrintableReport
        {...baseProps({
          solution: { ...solution, inverterPeakPowerW: 8000 },
          desiredFeatures: [],
          nominalW: 1000,
          peakW: 2000,
          dailyKwh: 2,
        })}
      />
    );
    expect(screen.getByText(/Necessário 0\.00 kVA · Solução oferece 5\.00 kVA/)).toBeInTheDocument();
  });
});

describe('PrintableReport: secondary battery comparison', () => {
  it('does not show a second products table when there is no secondary solution', () => {
    render(<PrintableReport {...baseProps()} />);
    expect(screen.getByText('Produtos recomendados')).toBeInTheDocument();
    expect(screen.queryByText(/comparação/)).not.toBeInTheDocument();
  });

  it('shows both solution versions, one products table per battery', () => {
    const secondarySolution: Solution = {
      ...solution,
      batteryModel: 'TP-HS7.2',
      batteryQty: 2,
      inverterModel: 'X1-Hybrid-8.0kW-G4',
    };
    render(
      <PrintableReport
        {...baseProps({ secondarySolution, secondaryBatteryModel: 'TP-HS7.2' })}
      />
    );
    expect(screen.getByText('Produtos recomendados — Bateria TP-HS3.6')).toBeInTheDocument();
    expect(screen.getByText('Produtos recomendados — Bateria TP-HS7.2 (comparação)')).toBeInTheDocument();
    expect(screen.getByText('X1-Hybrid-8.0kW-G4')).toBeInTheDocument();
    expect(screen.getByText('TP-HS7.2')).toBeInTheDocument();
  });
});

describe('PrintableReport: funcionalidades selecionadas', () => {
  it('is hidden when there are no desired features', () => {
    render(<PrintableReport {...baseProps()} />);
    expect(screen.queryByText('Funcionalidades selecionadas')).not.toBeInTheDocument();
  });

  it('lists each selected feature with its configured values', () => {
    render(
      <PrintableReport
        {...baseProps({
          desiredFeatures: ['backup', 'white_tariff', 'microgrid', 'external_generator', 'external_ats'],
          whiteTariff: { requiredPowerW: 3000, requiredEnergyWh: 6000, includeBackupReserve: true, tariffSpreadPerKwh: 0.8 },
          microgrid: {
            voltageV: 220,
            onGridPhases: 3,
            onGridApparentPowerVA: 5000,
            isFundamentalRequirement: true,
            photoUrl: null,
            powerNoticeAcknowledged: true,
          },
          generator: {
            voltageV: 220,
            phases: 1,
            apparentPowerVA: 8000,
            photoUrl: 'https://cdn.example.com/gerador.png',
            ownAtsAcknowledged: true,
          },
          atsPhotoUrl: 'https://cdn.example.com/ats.png',
          atsBackupAcknowledged: true,
        })}
      />
    );

    expect(screen.getByText('Funcionalidades selecionadas')).toBeInTheDocument();
    expect(screen.getByText('Backup')).toBeInTheDocument();
    expect(screen.getByText('Todos os inversores híbridos suportam backup.')).toBeInTheDocument();
    expect(screen.getByText('Tarifa Branca')).toBeInTheDocument();
    expect(
      screen.getByText(/Potência 3.00 kVA · energia 6.00 kWh · com reserva de backup · diferença tarifária R\$ 0,80\/kWh/)
    ).toBeInTheDocument();
    expect(screen.getByText('Microrrede')).toBeInTheDocument();
    expect(
      screen.getByText(/Rede existente 220V · 3F · 5000 VA · requisito fundamental · aviso de potência confirmado/)
    ).toBeInTheDocument();
    expect(screen.getByText('Gerador Externo')).toBeInTheDocument();
    expect(screen.getByText(/Gerador 220V · 1F · 8000 VA · chave ATS própria confirmada · foto anexada/)).toBeInTheDocument();
    expect(screen.getByText('ATS Externo')).toBeInTheDocument();
    expect(screen.getByText(/Uso para backup completo confirmado · foto anexada/)).toBeInTheDocument();
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
  it('is hidden when there is no white tariff', () => {
    render(<PrintableReport {...baseProps()} />);
    expect(screen.queryByText('Análise econômica')).not.toBeInTheDocument();
  });

  it('shows the system cost inline under the products table when stock items are priced', () => {
    render(
      <PrintableReport
        {...baseProps({
          userStockItems: [
            { id: 's1', productType: 'inverter', productModel: 'X1-Hybrid-5.0kW-G4', unitValue: 10000, createdAt: '', updatedAt: '' },
          ],
        })}
      />
    );
    expect(screen.queryByText('Análise econômica')).not.toBeInTheDocument();
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
