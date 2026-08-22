import { describe, expect, it, vi } from 'vitest';
import { getRequestId, logExternalFailure, requestIdHeaders } from './request-context';

describe('request context', () => {
  it('preserves a safe incoming request id', () => {
    expect(getRequestId(new Request('http://localhost', { headers: { 'x-request-id': 'trace-123' } }))).toBe('trace-123');
  });

  it('replaces malformed or oversized request ids', () => {
    const request = new Request('http://localhost', { headers: { 'x-request-id': '<script>alert(1)</script>' } });
    const id = getRequestId(request);
    expect(id).not.toContain('<');
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('logs structured external integration failures without exposing the error object', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    logExternalFailure('supplier_sync', 'trace-123', new Error('timeout'));
    expect(spy).toHaveBeenCalledWith(JSON.stringify({
      event: 'external_integration_failed',
      operation: 'supplier_sync',
      requestId: 'trace-123',
      error: 'timeout',
    }));
    spy.mockRestore();
  });

  it('returns a response header for correlation', () => {
    expect(requestIdHeaders('trace-123')).toEqual({ 'x-request-id': 'trace-123' });
  });
});
