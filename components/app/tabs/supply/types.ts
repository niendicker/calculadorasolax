export type Cart = Record<string, number>;

export interface Order {
  id: string;
  supplier_id: string;
  created_at: string;
  request_type: string;
  status: string;
  currency: string;
  subtotal: number;
  total_amount: number | null;
  external_order_id: string | null;
  suppliers: { name: string };
  purchase_order_items: {
    id: string;
    product_model: string;
    supplier_sku: string;
    quantity: number;
    unit_price: number;
    line_total: number;
  }[];
}

export interface Supplier {
  id: string;
  name: string;
  description: string | null;
  order_mode: string;
  is_default_for_all: boolean;
  supports_partner_orders: boolean;
}

export interface DeliveryForm {
  name: string;
  postal_code: string;
  address: string;
  number: string;
  complement: string;
  district: string;
  city: string;
  state: string;
}

export const emptyDelivery: DeliveryForm = {
  name: '',
  postal_code: '',
  address: '',
  number: '',
  complement: '',
  district: '',
  city: '',
  state: '',
};

export const money = (value: number, currency = 'BRL') =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(value);

export const orderModeLabels: Record<string, string> = {
  quote: 'Cotação',
  direct: 'Pedido direto',
  both: 'Cotação e pedido direto',
};
