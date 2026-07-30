type JsonRecord = Record<string, unknown>;

function atPath(value: unknown, path: string): unknown {
  return path.split('.').filter(Boolean).reduce<unknown>((current, key) => {
    if (!current || typeof current !== 'object') return undefined;
    return (current as JsonRecord)[key];
  }, value);
}

export interface NormalizedSupplierItem {
  sku: string;
  price: number;
  stock: number | null;
  leadDays: number | null;
}

export function normalizeSupplierPayload(payload: unknown, mapping: JsonRecord): NormalizedSupplierItem[] {
  const source = atPath(payload, String(mapping.items ?? 'items'));
  if (!Array.isArray(source)) throw new Error('A resposta não contém a lista configurada de produtos.');
  const output: NormalizedSupplierItem[] = [];
  for (const raw of source) {
    const sku = String(atPath(raw, String(mapping.sku ?? 'sku')) ?? '').trim();
    const price = Number(atPath(raw, String(mapping.price ?? 'price')));
    const rawStock = atPath(raw, String(mapping.stock ?? 'stock'));
    const rawLead = atPath(raw, String(mapping.lead_days ?? 'lead_days'));
    if (!sku || !Number.isFinite(price) || price < 0) continue;
    const stock = rawStock == null || rawStock === '' ? null : Number(rawStock);
    const leadDays = rawLead == null || rawLead === '' ? null : Number(rawLead);
    output.push({
      sku,
      price,
      stock: stock !== null && Number.isInteger(stock) && stock >= 0 ? stock : null,
      leadDays: leadDays !== null && Number.isInteger(leadDays) && leadDays >= 0 ? leadDays : null,
    });
  }
  return output;
}

export function buildSupplierUrl(baseUrl: string, productsPath: string) {
  const url = new URL(productsPath || '', baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
  if (url.protocol !== 'https:') throw new Error('A integração exige HTTPS.');
  const host = url.hostname.toLowerCase();
  if (host === 'localhost' || host === '0.0.0.0' || host === '::1' || /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host)) {
    throw new Error('O endereço da integração não pode apontar para uma rede privada.');
  }
  return url;
}

