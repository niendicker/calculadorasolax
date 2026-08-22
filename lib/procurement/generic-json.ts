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
  /** The supplier's own catalog identifier for this item, if the mapping
   *  configures one — required to place an order through a supplier whose
   *  Partner API identifies products by id rather than by sku (see
   *  supports_partner_orders). Absent for suppliers that don't expose one. */
  externalId: string | null;
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
    const rawExternalId = atPath(raw, String(mapping.catalog_id ?? 'id'));
    if (!sku || !Number.isFinite(price) || price < 0) continue;
    const stock = rawStock == null || rawStock === '' ? null : Number(rawStock);
    const leadDays = rawLead == null || rawLead === '' ? null : Number(rawLead);
    output.push({
      sku,
      price,
      stock: stock !== null && Number.isInteger(stock) && stock >= 0 ? stock : null,
      leadDays: leadDays !== null && Number.isInteger(leadDays) && leadDays >= 0 ? leadDays : null,
      externalId: rawExternalId == null || rawExternalId === '' ? null : String(rawExternalId),
    });
  }
  return output;
}

export function buildSupplierUrl(baseUrl: string, productsPath: string) {
  const url = new URL(productsPath || '', baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
  if (url.protocol !== 'https:') throw new Error('A integração exige HTTPS.');
  if (url.username || url.password) throw new Error('A URL da integração não pode conter credenciais.');

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  const octets = host.split('.').map(Number);
  const isIpv4 = octets.length === 4 && octets.every((part) => Number.isInteger(part) && part >= 0 && part <= 255);
  const isPrivateIpv4 = isIpv4 && (
    octets[0] === 0 ||
    octets[0] === 10 ||
    octets[0] === 127 ||
    (octets[0] === 100 && octets[1] >= 64 && octets[1] <= 127) ||
    (octets[0] === 169 && octets[1] === 254) ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
    (octets[0] === 192 && octets[1] === 0 && octets[2] === 0) ||
    (octets[0] === 192 && octets[1] === 168) ||
    (octets[0] === 198 && octets[1] >= 18 && octets[1] <= 19)
  );
  const normalizedIpv6 = host.replace(/^0:0:0:0:0:ffff:/, '::ffff:');
  const isPrivateIpv6 = normalizedIpv6 === '::1' || /^(fc|fd)[0-9a-f]{2}:/.test(normalizedIpv6) || /^fe80:/.test(normalizedIpv6);
  const mappedIpv4 = normalizedIpv6.match(/^::ffff:(?:(\d+)\.(\d+)\.(\d+)\.(\d+)|([0-9a-f]{1,4}):([0-9a-f]{1,4}))$/);
  const mappedIpv4Octets = mappedIpv4
    ? mappedIpv4[1]
      ? mappedIpv4.slice(1, 5).map(Number)
      : [parseInt(mappedIpv4[5], 16) >> 8, parseInt(mappedIpv4[5], 16) & 255, parseInt(mappedIpv4[6], 16) >> 8, parseInt(mappedIpv4[6], 16) & 255]
    : null;
  const isPrivateMappedIpv4 = mappedIpv4Octets
    ? mappedIpv4Octets[0] === 10 || mappedIpv4Octets[0] === 127 ||
      (mappedIpv4Octets[0] === 172 && mappedIpv4Octets[1] >= 16 && mappedIpv4Octets[1] <= 31) ||
      (mappedIpv4Octets[0] === 192 && mappedIpv4Octets[1] === 168)
    : false;
  if (host === 'localhost' || host === '0.0.0.0' || isPrivateIpv4 || isPrivateIpv6 || isPrivateMappedIpv4) {
    throw new Error('O endereço da integração não pode apontar para uma rede privada.');
  }
  return url;
}

/** Reads an external JSON response with a real byte limit. Checking only the
 * content-length header is insufficient because chunked responses may omit it. */
export async function readJsonResponse(response: Response, maxBytes: number): Promise<unknown> {
  const declaredLength = Number(response.headers.get('content-length') ?? 0);
  if (declaredLength > maxBytes) throw new Error(`Resposta maior que o limite de ${maxBytes} bytes.`);
  if (!response.body) {
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > maxBytes) throw new Error(`Resposta maior que o limite de ${maxBytes} bytes.`);
    return JSON.parse(text);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let totalBytes = 0;
  let text = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > maxBytes) {
      await reader.cancel();
      throw new Error(`Resposta maior que o limite de ${maxBytes} bytes.`);
    }
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();
  return JSON.parse(text);
}
