import { lookup } from 'node:dns/promises';
import { readJsonResponse } from './generic-json';
import { isPrivateNetworkAddress } from './network-safety';

export const EXTERNAL_REQUEST_TIMEOUT_MS = 20_000;
export const SUPPLIER_CATALOG_RESPONSE_LIMIT = 5_000_000;
export const SUPPLIER_ORDER_RESPONSE_LIMIT = 1_000_000;

/** Validates the addresses returned by DNS immediately before a request. This
 * closes the common DNS-rebinding gap where the configured hostname is public
 * during URL validation but resolves to a private address at request time. */
export async function assertResolvedHostIsPublic(input: URL | string): Promise<void> {
  const url = input instanceof URL ? input : new URL(input);
  const addresses = await lookup(url.hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => isPrivateNetworkAddress(address))) {
    throw new Error('O endereço resolvido da integração não pode apontar para uma rede privada.');
  }
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
  try {
    await assertResolvedHostIsPublic(input);
  } catch (cause) {
    if (cause instanceof Error && cause.message.includes('não pode apontar')) throw cause;
    throw new Error('Não foi possível validar o endereço da integração antes da conexão.', { cause });
  }
  const response = await fetch(input, {
    ...init,
    signal: init.signal ?? AbortSignal.timeout(EXTERNAL_REQUEST_TIMEOUT_MS),
  });
  const payload = await readJsonResponse(response, maxBytes).catch(() => null);
  return { response, payload };
}
