const REQUEST_ID_PATTERN = /^[a-zA-Z0-9._:-]{1,128}$/;

export function getRequestId(request: Request): string {
  const incoming = request.headers.get('x-request-id')?.trim();
  return incoming && REQUEST_ID_PATTERN.test(incoming) ? incoming : crypto.randomUUID();
}

export function logExternalFailure(operation: string, requestId: string, error: unknown) {
  const message = error instanceof Error ? error.message : 'unknown_error';
  console.error(JSON.stringify({ event: 'external_integration_failed', operation, requestId, error: message }));
}

export function requestIdHeaders(requestId: string): HeadersInit {
  return { 'x-request-id': requestId };
}
