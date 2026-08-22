import { readJsonResponse } from './generic-json';

export const EXTERNAL_REQUEST_TIMEOUT_MS = 20_000;
export const SUPPLIER_CATALOG_RESPONSE_LIMIT = 5_000_000;
export const SUPPLIER_ORDER_RESPONSE_LIMIT = 1_000_000;

/** Shared boundary for supplier HTTP calls. It applies one timeout policy and
 * reads streamed responses through the byte-limited JSON reader. Callers keep
 * ownership of HTTP status handling because each supplier workflow exposes a
 * different business error contract. */
export async function fetchExternalJson(
  input: URL | string,
  init: RequestInit,
  maxBytes: number
): Promise<{ response: Response; payload: unknown }> {
  const response = await fetch(input, {
    ...init,
    signal: init.signal ?? AbortSignal.timeout(EXTERNAL_REQUEST_TIMEOUT_MS),
  });
  const payload = await readJsonResponse(response, maxBytes).catch(() => null);
  return { response, payload };
}
