import { lookup } from 'node:dns/promises';
import https from 'node:https';
import { readJsonResponse } from './generic-json';
import { isPrivateNetworkAddress } from './network-safety';

export const EXTERNAL_REQUEST_TIMEOUT_MS = 20_000;
export const SUPPLIER_CATALOG_RESPONSE_LIMIT = 5_000_000;
export const SUPPLIER_ORDER_RESPONSE_LIMIT = 1_000_000;

type ResolvedPublicAddress = { address: string; family: number };

async function resolvePublicAddress(input: URL | string): Promise<ResolvedPublicAddress> {
  const url = input instanceof URL ? input : new URL(input);
  const addresses = await lookup(url.hostname, { all: true, verbatim: true });
  const publicAddress = addresses.find(({ address }) => !isPrivateNetworkAddress(address));
  if (!publicAddress || addresses.some(({ address }) => isPrivateNetworkAddress(address))) {
    throw new Error('O endereço resolvido da integração não pode apontar para uma rede privada.');
  }
  return publicAddress;
}

/** Validates the addresses returned by DNS immediately before a request. This
 * closes the common DNS-rebinding gap where the configured hostname is public
 * during URL validation but resolves to a private address at request time. */
export async function assertResolvedHostIsPublic(input: URL | string): Promise<void> {
  await resolvePublicAddress(input);
}

function requestBody(body: RequestInit['body']): string | Uint8Array | undefined {
  if (body == null) return undefined;
  if (typeof body === 'string' || body instanceof Uint8Array) return body;
  throw new Error('O corpo da integração possui um formato não suportado.');
}

async function pinnedHttpsRequest(url: URL, init: RequestInit, address: ResolvedPublicAddress): Promise<Response> {
  const headers = new Headers(init.headers);
  if (!headers.has('host')) headers.set('host', url.host);
  const body = requestBody(init.body);

  return new Promise((resolve, reject) => {
    const request = https.request({
      hostname: address.address,
      port: url.port || '443',
      path: `${url.pathname}${url.search}`,
      method: init.method ?? 'GET',
      headers: Object.fromEntries(headers.entries()),
      family: address.family,
      servername: url.hostname,
      rejectUnauthorized: true,
    }, (response) => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer | string) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      response.on('end', () => {
        const responseHeaders = new Headers();
        for (const [name, value] of Object.entries(response.headers)) {
          if (value !== undefined) responseHeaders.set(name, Array.isArray(value) ? value.join(', ') : value);
        }
        resolve(new Response(Buffer.concat(chunks), {
          status: response.statusCode ?? 502,
          statusText: response.statusMessage,
          headers: responseHeaders,
        }));
      });
      response.on('error', reject);
    });

    const timeout = init.signal?.aborted ? 0 : EXTERNAL_REQUEST_TIMEOUT_MS;
    request.setTimeout(timeout, () => request.destroy(new Error('A integração excedeu o tempo limite.')));
    const abort = () => request.destroy(new Error('A requisição da integração foi cancelada.'));
    if (init.signal) init.signal.addEventListener('abort', abort, { once: true });
    request.once('close', () => init.signal?.removeEventListener('abort', abort));
    request.on('error', reject);
    if (body) request.write(body);
    request.end();
  });
}

/** Shared boundary for supplier HTTP calls. It applies one timeout policy and
 * reads streamed responses through the byte-limited JSON reader. Callers keep
 * ownership of HTTP status handling because each supplier workflow exposes a
 * different business error contract. */
export async function fetchExternalJson(
  input: URL | string,
  init: RequestInit,
  maxBytes: number
): Promise<{ response: Response; payload: unknown }> {
  const url = input instanceof URL ? input : new URL(input);
  let address: ResolvedPublicAddress;
  try {
    address = await resolvePublicAddress(url);
  } catch (cause) {
    if (cause instanceof Error && cause.message.includes('não pode apontar')) throw cause;
    throw new Error('Não foi possível validar o endereço da integração antes da conexão.', { cause });
  }
  const response = await pinnedHttpsRequest(url, init, address);
  const payload = await readJsonResponse(response, maxBytes).catch(() => null);
  return { response, payload };
}
