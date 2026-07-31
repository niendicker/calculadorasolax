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

const load = { id: 'l1', name: 'Chuveiro', powerW: 5500, qty: 1 };

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
    operationHours: 4,
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
            accessories: [
              { model: 'Smart Meter - M1-40', qty: 1, optional: false, appliesTo: 'system', comment: null, bundled: false },
            ],
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

  it('shows PV monthly generation next to the recommended power', () => {
    const { rerender } = render(
      <PrintableReport
        {...baseProps({
          solution: { ...solution, pvPowerKw: 3, pvMonthlyGenerationKwh: 450 },
        })}
      />
    );
    expect(screen.getByText('450 kWh/mês estimados')).toBeInTheDocument();

    rerender(
      <PrintableReport
        {...baseProps({
          solution: { ...solution, pvPowerKw: 3, pvMonthlyGenerationKwh: null },
        })}
      />
    );
    expect(screen.queryByText(/kWh\/mês estimados/)).not.toBeInTheDocument();
  });

  it('lists each accessory as its own row with its real quantity, status and comment', () => {
    render(
      <PrintableReport
        {...baseProps({
          solution: {
            ...solution,
            accessories: [
              { model: 'Smart Meter', qty: 2, optional: false, appliesTo: 'system', comment: null, bundled: false },
              {
                model: 'X1-Matebox',
                qty: 1,
                optional: true,
                appliesTo: 'inverter',
                comment: 'Instalar próximo ao quadro.',
                bundled: false,
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

  it('shows a bundled accessory as included with the inverter/battery instead of "Acessório obrigatório"', () => {
    render(
      <PrintableReport
        {...baseProps({
          solution: {
            ...solution,
            accessories: [
              { model: 'WiFi Dongle', qty: 1, optional: false, appliesTo: 'inverter', comment: null, bundled: true },
              { model: 'CT Clamp', qty: 2, optional: false, appliesTo: 'battery', comment: null, bundled: true },
              { model: 'Disjuntor CA', qty: 1, optional: false, appliesTo: 'system', comment: null, bundled: false },
            ],
          },
        })}
      />
    );
    expect(screen.getByText('Incluso no inversor')).toBeInTheDocument();
    expect(screen.getByText('Incluso na bateria')).toBeInTheDocument();
    // The still-not-bundled accessory keeps its "obrigatório" alert — only the
    // bundled ones are exempt from it.
    expect(screen.getByText('Acessório obrigatório')).toBeInTheDocument();
    expect(screen.queryAllByText('Acessório obrigatório')).toHaveLength(1);
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

describe('PrintableReport: services', () => {
  it('is hidden when the project has no services', () => {
    render(<PrintableReport {...baseProps()} />);
    expect(screen.queryByText('Serviços')).not.toBeInTheDocument();
  });

  it('lists each service line with its price, and unresolved ones as "sem preço"', () => {
    render(
      <PrintableReport
        {...baseProps({
          services: [
            { serviceId: 's1', name: 'Instalação', qty: 1 },
            { serviceId: 's2', name: 'Frete', qty: 2 },
            { serviceId: 'gone', name: 'Serviço removido', qty: 1 },
          ],
          userServices: [
            { id: 's1', name: 'Instalação', unitValue: 800, createdAt: '', updatedAt: '' },
            { id: 's2', name: 'Frete', unitValue: 150, createdAt: '', updatedAt: '' },
          ],
        })}
      />
    );
    expect(screen.getByText('Serviços')).toBeInTheDocument();
    expect(screen.getByText('Instalação')).toBeInTheDocument();
    expect(screen.getByText(/R\$\s*800,00/)).toBeInTheDocument();
    expect(screen.getByText('Frete × 2')).toBeInTheDocument();
    expect(screen.getByText(/R\$\s*300,00/)).toBeInTheDocument();
    expect(screen.getByText('Serviço removido')).toBeInTheDocument();
    expect(screen.getByText('sem preço')).toBeInTheDocument();
  });

  it('includes the services cost in "Custo total do sistema"', () => {
    render(
      <PrintableReport
        {...baseProps({
          userStockItems: [
            { id: 'st1', productType: 'inverter', productModel: 'X1-Hybrid-5.0kW-G4', unitValue: 5000, createdAt: '', updatedAt: '' },
            { id: 'st2', productType: 'battery', productModel: 'TP-HS3.6', unitValue: 2000, createdAt: '', updatedAt: '' },
          ],
          services: [{ serviceId: 's1', name: 'Instalação', qty: 1 }],
          userServices: [{ id: 's1', name: 'Instalação', unitValue: 500, createdAt: '', updatedAt: '' }],
        })}
      />
    );
    // 5000 (inverter) + 2000 (battery) + 500 (service) = 7500
    expect(screen.getByText(/R\$\s*7\.500,00/)).toBeInTheDocument();
  });

  it('does not duplicate the services cost onto the secondary (comparison) products table', () => {
    const secondarySolution: Solution = { ...solution, batteryModel: 'TP-HS7.2' };
    render(
      <PrintableReport
        {...baseProps({
          secondarySolution,
          secondaryBatteryModel: 'TP-HS7.2',
          services: [{ serviceId: 's1', name: 'Instalação', qty: 1 }],
          userServices: [{ id: 's1', name: 'Instalação', unitValue: 500, createdAt: '', updatedAt: '' }],
        })}
      />
    );
    // Only the primary table's "Serviços" block should render.
    expect(screen.getAllByText('Serviços')).toHaveLength(1);
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
          whiteTariff: {
            requiredPowerW: 3000,
            pontaEnergyWh: 6000,
            intermediateEnergyWh: 2000,
            includeBackupReserve: true,
            pontaTariffPerKwh: 1.6,
            intermediateTariffPerKwh: 1.0,
            foraPontaTariffPerKwh: 0.8,
          },
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
    // The energy/tariff figures are wrapped in their own <span> for a light
    // highlight, so the full sentence is split across multiple elements —
    // match on the paragraph's full textContent instead of a single text node.
    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName === 'P' &&
          /Potência 3.00 kW · energia ponta 6.00 kWh · energia intermediária 2.00 kWh · com reserva de backup · tarifa ponta R\$\s*1,60\/kWh · tarifa intermediária R\$\s*1,00\/kWh · tarifa fora ponta R\$\s*0,80\/kWh/.test(
            element?.textContent ?? ''
          )
      )
    ).toBeInTheDocument();
    expect(screen.getByText('Microrrede')).toBeInTheDocument();
    expect(
      screen.getByText(/Rede existente 220V · 3F · 5.0 kW · margem de potência 20%/)
    ).toBeInTheDocument();
    expect(screen.getByText('Gerador')).toBeInTheDocument();
    expect(screen.getByText(/Gerador 220V · 1F · 8.0 kVA · FP 0.80 · margem 20% · chave ATS própria confirmada · foto anexada/)).toBeInTheDocument();
    expect(screen.getByText('Backup Total')).toBeInTheDocument();
    expect(screen.getByText(/Uso para backup completo confirmado · foto anexada/)).toBeInTheDocument();
  });

  it('skips a feature id no longer recognized (e.g. a renamed one saved on an older project) instead of crashing', () => {
    render(
      <PrintableReport
        {...baseProps({
          // 'no_pv' predates the 'pv' rename — an older saved project can still have it.
          desiredFeatures: ['backup', 'no_pv' as unknown as 'pv'],
        })}
      />
    );
    expect(screen.getByText('Funcionalidades selecionadas')).toBeInTheDocument();
    expect(screen.getByText('Backup')).toBeInTheDocument();
  });
});

describe('PrintableReport: loads table', () => {
  it('keeps a short loads table together on one printed page', () => {
    render(<PrintableReport {...baseProps()} />);
    expect(screen.getByRole('table').parentElement).toHaveClass('print-table-whole');
  });

  it('allows a long table to paginate between rows', () => {
    const loads = Array.from({ length: 11 }, (_, index) => ({
      id: `l${index}`,
      name: `Carga ${index + 1}`,
      powerW: 100,
      qty: 1,
    }));
    render(<PrintableReport {...baseProps({ loads })} />);
    expect(screen.getByRole('table').parentElement).not.toHaveClass('print-table-whole');
  });

  it('computes peak and daily energy per load row', () => {
    render(
      <PrintableReport
        {...baseProps({ operationHours: 2, loads: [{ id: 'l1', name: 'Chuveiro', powerW: 5500, qty: 2 }] })}
      />
    );
    expect(screen.getAllByText('11000 VA')).toHaveLength(2); // load row + total
    expect(screen.getAllByText('22.00 kWh')).toHaveLength(2); // load row + total
  });

  it('scales daily energy by usageFactor instead of assuming the load runs the whole time', () => {
    render(
      <PrintableReport
        {...baseProps({
          operationHours: 4,
          loads: [{ id: 'l1', name: 'Geladeira', powerW: 200, qty: 1, usageFactor: 0.5 }],
        })}
      />
    );
    // 200 W x 1 x (4h x 0.5) / 1000 = 0.40 kWh, not 0.80 kWh.
    expect(screen.getAllByText('0.40 kWh')).toHaveLength(2);
  });

  it('uses fixedHours instead of the shared operationHours when usageMode is fixed', () => {
    render(
      <PrintableReport
        {...baseProps({
          operationHours: 10,
          loads: [{ id: 'l1', name: 'Bomba', powerW: 1000, qty: 1, usageMode: 'fixed', fixedHours: 2 }],
        })}
      />
    );
    // 1000 W x 1 x 2h / 1000 = 2.00 kWh, ignoring the shared 10h.
    expect(screen.getAllByText('2.00 kWh')).toHaveLength(2);
  });
});

describe('PrintableReport: economic analysis section', () => {
  it('is hidden when there is no white tariff', () => {
    render(<PrintableReport {...baseProps()} />);
    expect(screen.queryByText('Análise econômica')).not.toBeInTheDocument();
  });

  it('shows a partial investment in the economic section even without white tariff', () => {
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
    expect(screen.getByText('Investimento parcial')).toBeInTheDocument();
    expect(screen.getByText(/Falta precificar: TP-HS3.6/)).toBeInTheDocument();
  });

  it('shows white tariff savings when configured', () => {
    render(
      <PrintableReport
        {...baseProps({
          whiteTariff: {
            requiredPowerW: 1000,
            pontaEnergyWh: 2000,
            intermediateEnergyWh: 0,
            includeBackupReserve: false,
            pontaTariffPerKwh: 1.3,
            intermediateTariffPerKwh: 0.95,
            foraPontaTariffPerKwh: 0.8,
          },
        })}
      />
    );
    expect(screen.getByText('Ganho estimado com SolaX')).toBeInTheDocument();
  });

  it('explains invalid tariff ordering instead of presenting misleading savings', () => {
    render(
      <PrintableReport
        {...baseProps({
          whiteTariff: {
            requiredPowerW: 1000,
            pontaEnergyWh: 2000,
            intermediateEnergyWh: 1000,
            includeBackupReserve: false,
            pontaTariffPerKwh: 0.7,
            intermediateTariffPerKwh: 0.75,
            foraPontaTariffPerKwh: 0.8,
          },
        })}
      />
    );
    expect(screen.queryByText('Ganho estimado com SolaX')).not.toBeInTheDocument();
    expect(screen.getByText(/Economia e retorno indisponíveis/)).toBeInTheDocument();
  });

  it('formats a payback shorter than one year using months only', () => {
    render(
      <PrintableReport
        {...baseProps({
          userStockItems: [
            { id: 's1', productType: 'inverter', productModel: 'X1-Hybrid-5.0kW-G4', unitValue: 50, createdAt: '', updatedAt: '' },
            { id: 's2', productType: 'battery', productModel: 'TP-HS3.6', unitValue: 50, createdAt: '', updatedAt: '' },
          ],
          whiteTariff: {
            requiredPowerW: 1000,
            pontaEnergyWh: 2000,
            intermediateEnergyWh: 0,
            includeBackupReserve: false,
            pontaTariffPerKwh: 1.3,
            intermediateTariffPerKwh: 0.95,
            foraPontaTariffPerKwh: 0.8,
          },
        })}
      />
    );
    expect(screen.getByText('Retorno simples estimado')).toBeInTheDocument();
    expect(screen.getByText(/^\d+ meses$/)).toBeInTheDocument();
  });

  it('shows the absolute sem/com SolaX monthly costs when pv total consumption makes the breakdown consistent', () => {
    render(
      <PrintableReport
        {...baseProps({
          whiteTariff: {
            requiredPowerW: 1000,
            pontaEnergyWh: 4000,
            intermediateEnergyWh: 0,
            includeBackupReserve: false,
            pontaTariffPerKwh: 1.2,
            intermediateTariffPerKwh: 0.95,
            foraPontaTariffPerKwh: 0.8,
          },
          pv: { monthlyConsumptionKwh: 400, hsp: 4.5 },
        })}
      />
    );
    expect(screen.getByText('Custo estimado sem SolaX')).toBeInTheDocument();
    expect(screen.getByText('Custo estimado com SolaX')).toBeInTheDocument();
  });

  it('omits the absolute sem/com SolaX costs when there is no pv (or an inconsistent) total consumption', () => {
    render(
      <PrintableReport
        {...baseProps({
          whiteTariff: {
            requiredPowerW: 1000,
            pontaEnergyWh: 2000,
            intermediateEnergyWh: 0,
            includeBackupReserve: false,
            pontaTariffPerKwh: 1.3,
            intermediateTariffPerKwh: 0.95,
            foraPontaTariffPerKwh: 0.8,
          },
        })}
      />
    );
    expect(screen.queryByText('Custo estimado sem SolaX')).not.toBeInTheDocument();
    expect(screen.queryByText('Custo estimado com SolaX')).not.toBeInTheDocument();
  });

  it('folds the PV generation gain into the combined SolaX figure, noting the solar-only portion', () => {
    render(
      <PrintableReport
        {...baseProps({
          whiteTariff: {
            requiredPowerW: 1000,
            // No ponta/intermediária need, so all PV generation is valued at the fora ponta rate.
            pontaEnergyWh: 0,
            intermediateEnergyWh: 0,
            includeBackupReserve: false,
            pontaTariffPerKwh: 1.3,
            intermediateTariffPerKwh: 0.95,
            foraPontaTariffPerKwh: 0.8,
          },
          solution: { ...solution, pvMonthlyGenerationKwh: 450 },
        })}
      />
    );
    expect(screen.getByText('Ganho estimado com SolaX')).toBeInTheDocument();
    expect(screen.getByText(/de geração solar/)).toBeInTheDocument();
  });

  it('omits the "de geração solar" note when there is no PV estimate', () => {
    render(<PrintableReport {...baseProps({ solution: { ...solution, pvMonthlyGenerationKwh: null } })} />);
    expect(screen.queryByText('Ganho estimado com SolaX')).not.toBeInTheDocument();
    expect(screen.queryByText(/de geração solar/)).not.toBeInTheDocument();
  });
});

describe('PrintableReport: comments and footer', () => {
  it('lists comments only when present', () => {
    const { rerender } = render(<PrintableReport {...baseProps()} />);
    expect(screen.queryByText('Observações', { selector: 'h2' })).not.toBeInTheDocument();

    rerender(<PrintableReport {...baseProps({ solution: { ...solution, comments: ['Opcional: kit de paralelo.'] } })} />);
    expect(screen.getByText('Opcional: kit de paralelo.')).toBeInTheDocument();
  });

  it('keeps the full solution code in a technical appendix and uses a short reference in the footer', () => {
    const { rerender } = render(<PrintableReport {...baseProps({ solution: { ...solution, solutionCode: 'code-123' } })} />);
    expect(screen.getByText('code-123')).not.toHaveClass('print-document-footer');
    expect(screen.getByText('Referência técnica')).toBeInTheDocument();
    expect(document.querySelector('footer')).toHaveTextContent(/^SolaX Power Brasil · Casa de praia · Ref\. SOL-[A-F0-9]{8}$/);
    expect(document.querySelector('footer')).toHaveClass('print-document-footer');
    expect(document.querySelector('footer')).not.toHaveClass('print-page-footer');

    rerender(<PrintableReport {...baseProps({ solution: { ...solution, solutionCode: undefined } })} />);
    expect(screen.queryByText('Referência técnica')).not.toBeInTheDocument();
    expect(document.querySelector('footer')).toHaveTextContent('SolaX Power Brasil · Casa de praia');
  });
});
