import { describe, expect, it } from 'vitest';
import { emptyAddress } from '@/lib/address';
import {
  clientFromRow,
  projectFromRow,
  residentialOptionsFromJson,
  userLoadFromRow,
  userLoadPresetFromRow,
  userServiceFromRow,
  userStockItemFromRow,
} from './row-mappers';

describe('clientFromRow', () => {
  it('maps every field from a full row', () => {
    expect(
      clientFromRow({
        id: 'c1',
        name: 'Ana',
        email: 'ana@example.com',
        phone: '11999999999',
        document: '123',
        notes: 'nota',
        created_at: '2026-01-01',
        updated_at: '2026-01-02',
      })
    ).toEqual({
      id: 'c1',
      name: 'Ana',
      email: 'ana@example.com',
      phone: '11999999999',
      document: '123',
      notes: 'nota',
      createdAt: '2026-01-01',
      updatedAt: '2026-01-02',
    });
  });

  it('defaults nullable string fields when absent', () => {
    expect(clientFromRow({ id: 'c1' })).toEqual({
      id: 'c1',
      name: '',
      email: '',
      phone: '',
      document: '',
      notes: '',
      createdAt: undefined,
      updatedAt: undefined,
    });
  });
});

describe('userLoadFromRow', () => {
  it('maps every field from a full row', () => {
    expect(
      userLoadFromRow({
        id: 'u1',
        name: 'Chuveiro',
        power_w: 5500,
        ip_in_ratio: 2,
        created_at: '2026-01-01',
        updated_at: '2026-01-02',
      })
    ).toEqual({
      id: 'u1',
      name: 'Chuveiro',
      powerW: 5500,
      ipInRatio: 2,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-02',
    });
  });

  it('defaults name, powerW and ipInRatio when absent/invalid', () => {
    expect(userLoadFromRow({ id: 'u1' })).toEqual({
      id: 'u1',
      name: '',
      powerW: 0,
      ipInRatio: 1,
      createdAt: undefined,
      updatedAt: undefined,
    });
  });

  it('falls back powerW to 0 when the value is not a finite number', () => {
    expect(userLoadFromRow({ id: 'u1', power_w: 'not-a-number' }).powerW).toBe(0);
  });
});

describe('userLoadPresetFromRow', () => {
  it('maps every field from a full row', () => {
    expect(
      userLoadPresetFromRow({ id: 'p1', name: 'Preset', description: 'Desc', loads: [{ id: 'l1' }] })
    ).toEqual({ id: 'p1', name: 'Preset', description: 'Desc', loads: [{ id: 'l1' }] });
  });

  it('defaults name, description and loads when absent', () => {
    expect(userLoadPresetFromRow({ id: 'p1' })).toEqual({ id: 'p1', name: '', description: '', loads: [] });
  });

  it('defaults loads to [] when the column is explicitly null', () => {
    expect(userLoadPresetFromRow({ id: 'p1', loads: null }).loads).toEqual([]);
  });
});

describe('userStockItemFromRow', () => {
  it('maps every field from a full row', () => {
    expect(
      userStockItemFromRow({
        id: 's1',
        product_type: 'inverter',
        product_model: 'X1',
        unit_value: 1000,
        created_at: '2026-01-01',
        updated_at: '2026-01-02',
      })
    ).toEqual({
      id: 's1',
      productType: 'inverter',
      productModel: 'X1',
      unitValue: 1000,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-02',
    });
  });

  it('defaults productModel and unitValue when absent/invalid', () => {
    expect(userStockItemFromRow({ id: 's1', product_type: 'battery' })).toEqual({
      id: 's1',
      productType: 'battery',
      productModel: '',
      unitValue: 0,
      createdAt: undefined,
      updatedAt: undefined,
    });
  });
});

describe('projectFromRow', () => {
  it('maps every field from a full row, treating a legacy plain-text address as a bare street line', () => {
    expect(
      projectFromRow({
        id: 'pr1',
        name: 'Projeto',
        client_id: 'c1',
        address: 'Rua 1',
        notes: 'nota',
        updated_at: '2026-01-01',
        status: 'sent',
        residential_options: { topology: 'HighVoltage' },
        solution: { batteryModel: 'X' },
        services: [{ serviceId: 's1', name: 'Serviço', qty: 1 }],
      })
    ).toEqual({
      id: 'pr1',
      name: 'Projeto',
      clientId: 'c1',
      address: { ...emptyAddress(), street: 'Rua 1' },
      notes: 'nota',
      updatedAt: '2026-01-01',
      status: 'sent',
      residentialOptions: expect.objectContaining({ topology: 'HighVoltage' }),
      solution: { batteryModel: 'X' },
      services: [{ serviceId: 's1', name: 'Serviço', qty: 1 }],
    });
  });

  it('maps a structured jsonb address unchanged', () => {
    const address = { ...emptyAddress(), postalCode: '01310-930', street: 'Av. Paulista', city: 'São Paulo', state: 'SP' };
    expect(projectFromRow({ id: 'pr1', residential_options: {}, address }).address).toEqual(address);
  });

  it('defaults clientId, address, notes, status, solution and services when absent', () => {
    const result = projectFromRow({ id: 'pr1', residential_options: {} });
    expect(result.clientId).toBeNull();
    expect(result.address).toEqual(emptyAddress());
    expect(result.notes).toBe('');
    expect(result.status).toBe('draft');
    expect(result.solution).toBeNull();
    expect(result.services).toEqual([]);
  });

  it('defaults services to [] when the column is not an array', () => {
    expect(projectFromRow({ id: 'pr1', residential_options: {}, services: 'not-an-array' }).services).toEqual([]);
  });

  it('normalizes malformed or legacy residential JSONB before it reaches the store', () => {
    const options = residentialOptionsFromJson({
      topology: 'HighVoltage',
      desiredFeatures: ['backup', 'legacy_feature'],
      loads: [{ powerW: 1000, qty: 2, ipInRatio: 3 }, { powerW: 'invalid', qty: 1 }, null],
    });

    expect(options.topology).toBe('HighVoltage');
    expect(options.desiredFeatures).toEqual(['backup']);
    expect(options.loads).toEqual([{ powerW: 1000, qty: 2, ipInRatio: 3 }]);
    expect(options.whiteTariff).toBeNull();
    expect(options.operationHours).toBe(0);
  });
});

describe('userServiceFromRow', () => {
  it('maps every field from a full row', () => {
    expect(
      userServiceFromRow({
        id: 'sv1',
        name: 'Instalação',
        unit_value: 500,
        created_at: '2026-01-01',
        updated_at: '2026-01-02',
      })
    ).toEqual({
      id: 'sv1',
      name: 'Instalação',
      unitValue: 500,
      pricingUnit: 'project',
      createdAt: '2026-01-01',
      updatedAt: '2026-01-02',
    });
  });

  it('defaults name and unitValue when absent/invalid', () => {
    expect(userServiceFromRow({ id: 'sv1' })).toEqual({
      id: 'sv1',
      name: '',
      unitValue: 0,
      pricingUnit: 'project',
      createdAt: undefined,
      updatedAt: undefined,
    });
  });
});
