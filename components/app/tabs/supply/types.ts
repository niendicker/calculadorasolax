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
  /** Collected at checkout (optional there — see `nonEmptyDeliveryFields`) so
   * the supplier already has it when the order reaches them, whichever path
   * that ends up being (partner push or email). `{}` when the customer
   * skipped it. */
  delivery_address: Partial<DeliveryForm> | null;
  /** Set when this order was created from "Importar itens do projeto" in the
   *  cart, so a project's own purchase history is traceable afterward — null
   *  for orders built from offers added to the cart with no project context. */
  project_id: string | null;
  projects: { name: string } | null;
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
  email: string | null;
  logo_url: string | null;
  website_url: string | null;
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

/** Drops blank/whitespace-only fields before sending to the server — the
 * checkout address is optional, so a half-filled or entirely empty form
 * should collapse to `{}` (the column's own default) rather than a payload
 * full of empty strings. */
export function nonEmptyDeliveryFields(form: DeliveryForm): Partial<DeliveryForm> {
  const entries = Object.entries(form).filter(([, value]) => value.trim() !== '');
  return Object.fromEntries(entries) as Partial<DeliveryForm>;
}

export const money = (value: number, currency = 'BRL') =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(value);

export const orderModeLabels: Record<string, string> = {
  quote: 'Cotação',
  direct: 'Pedido direto',
  both: 'Cotação e pedido direto',
};
