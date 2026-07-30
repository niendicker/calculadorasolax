export type ProductKind = 'inverter' | 'battery' | 'accessory';
export type OrderMode = 'quote' | 'direct' | 'both';

export interface SupplierOfferView {
  id: string;
  supplier_id: string;
  unit_price: number;
  stock_quantity: number | null;
  lead_time_days: number | null;
  minimum_quantity: number;
  valid_until: string | null;
  supplier_product_mappings: {
    product_type: ProductKind;
    product_model: string;
    supplier_sku: string;
    pack_quantity: number;
  };
  suppliers: {
    name: string;
    currency: string;
    order_mode: OrderMode;
    minimum_order_value: number;
  };
}

export const orderStatusLabels: Record<string, string> = {
  requested: 'Solicitado', under_review: 'Em análise', quoted: 'Cotado', approved: 'Aprovado',
  submitted: 'Enviado ao fornecedor', confirmed: 'Confirmado', cancelled: 'Cancelado',
  rejected: 'Recusado', fulfilled: 'Concluído',
};

