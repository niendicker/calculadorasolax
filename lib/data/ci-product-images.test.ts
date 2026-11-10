import { describe, expect, it, vi } from 'vitest';
import { fetchCiProductImages } from './ci-product-images';

describe('fetchCiProductImages', () => {
  it('returns an empty map when given no items', async () => {
    const result = await fetchCiProductImages([]);
    expect(result).toEqual({});
  });

  it('queries tables and maps found image URLs by both id and model', async () => {
    const mockFrom = vi.fn((table: string) => ({
      select: () => ({
        in: vi.fn((column: string, values: string[]) => {
          if (table === 'ci_bess_products' && (values.includes('bess-1') || values.includes('BESS Modelo A'))) {
            return Promise.resolve({
              data: [{ id: 'bess-1', model: 'BESS Modelo A', image_url: 'https://cdn.example.com/bess-a.png' }],
              error: null,
            });
          }
          if (table === 'ci_accessories' && (values.includes('acc-1') || values.includes('Controlador EMS'))) {
            return Promise.resolve({
              data: [{ id: 'acc-1', model: 'Controlador EMS', image_url: 'https://cdn.example.com/ems.png' }],
              error: null,
            });
          }
          return Promise.resolve({ data: [], error: null });
        }),
      }),
    }));

    const mockClient = { from: mockFrom } as unknown as Parameters<typeof fetchCiProductImages>[1];

    const result = await fetchCiProductImages(
      [
        { productId: 'bess-1', model: 'BESS Modelo A' },
        { productId: 'acc-1', model: 'Controlador EMS' },
        { productId: 'missing-id', model: 'Produto Sem Imagem' },
      ],
      mockClient
    );

    expect(result['bess-1']).toBe('https://cdn.example.com/bess-a.png');
    expect(result['BESS Modelo A']).toBe('https://cdn.example.com/bess-a.png');
    expect(result['acc-1']).toBe('https://cdn.example.com/ems.png');
    expect(result['Controlador EMS']).toBe('https://cdn.example.com/ems.png');
    expect(result['missing-id']).toBeUndefined();
  });

  it('handles client errors gracefully without throwing', async () => {
    const mockFrom = vi.fn(() => {
      throw new Error('Database connection failed');
    });
    const mockClient = { from: mockFrom } as unknown as Parameters<typeof fetchCiProductImages>[1];

    const result = await fetchCiProductImages([{ productId: '1', model: 'Teste' }], mockClient);
    expect(result).toEqual({});
  });
});
