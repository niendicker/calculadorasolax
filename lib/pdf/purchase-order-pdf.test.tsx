import { describe, expect, it } from 'vitest';
import { renderPurchaseOrderPdf } from './purchase-order-pdf';

describe('renderPurchaseOrderPdf', () => {
  it('renders a non-empty base64 PDF', async () => {
    const base64 = await renderPurchaseOrderPdf({
      supplierName: 'Fornecedor A',
      customerName: 'Integradora XPTO',
      customerEmail: 'contato@xpto.com',
      customerPhone: '11999999999',
      currency: 'BRL',
      items: [
        { product_model: 'X1-Hybrid-5.0kW-G4', supplier_sku: 'SKU-1', quantity: 1, unit_price: 5000, line_total: 5000 },
        { product_model: 'T-BAT-SYS-HV-5.8', supplier_sku: 'SKU-2', quantity: 2, unit_price: 8000, line_total: 16000 },
      ],
      subtotal: 21000,
      message: 'Poderiam nos enviar uma cotação?',
    });

    expect(typeof base64).toBe('string');
    expect(base64.length).toBeGreaterThan(100);
    // A PDF file always starts with "%PDF-" once base64-decoded.
    expect(Buffer.from(base64, 'base64').toString('latin1', 0, 5)).toBe('%PDF-');
  });

  it('falls back to a plain currency string when the currency code is invalid', async () => {
    const base64 = await renderPurchaseOrderPdf({
      supplierName: 'Fornecedor A',
      customerName: 'Cliente',
      customerEmail: 'a@b.com',
      customerPhone: null,
      currency: 'XX',
      items: [{ product_model: 'Modelo', supplier_sku: 'SKU', quantity: 1, unit_price: 10, line_total: 10 }],
      subtotal: 10,
      message: 'Mensagem',
    });

    expect(base64.length).toBeGreaterThan(100);
  });

  it('renders a valid PDF when a delivery address is provided', async () => {
    const base64 = await renderPurchaseOrderPdf({
      supplierName: 'Fornecedor A',
      customerName: 'Integradora XPTO',
      customerEmail: 'contato@xpto.com',
      customerPhone: '11999999999',
      currency: 'BRL',
      items: [{ product_model: 'X1-Hybrid-5.0kW-G4', supplier_sku: 'SKU-1', quantity: 1, unit_price: 5000, line_total: 5000 }],
      subtotal: 5000,
      message: 'Poderiam nos enviar uma cotação?',
      deliveryAddress: {
        name: 'Almoxarifado',
        postal_code: '01310-930',
        address: 'Av. Paulista',
        number: '1000',
        complement: 'Galpão 2',
        district: 'Bela Vista',
        city: 'São Paulo',
        state: 'SP',
      },
    });

    expect(Buffer.from(base64, 'base64').toString('latin1', 0, 5)).toBe('%PDF-');
  });

  it('renders a valid PDF when the delivery address is entirely empty (checkout left it blank)', async () => {
    const base64 = await renderPurchaseOrderPdf({
      supplierName: 'Fornecedor A',
      customerName: 'Cliente',
      customerEmail: 'a@b.com',
      customerPhone: null,
      currency: 'BRL',
      items: [{ product_model: 'Modelo', supplier_sku: 'SKU', quantity: 1, unit_price: 10, line_total: 10 }],
      subtotal: 10,
      message: 'Mensagem',
      deliveryAddress: {},
    });

    expect(Buffer.from(base64, 'base64').toString('latin1', 0, 5)).toBe('%PDF-');
  });
});
