import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { lookupMock, requestMock } = vi.hoisted(() => ({
  lookupMock: vi.fn(),
  requestMock: vi.fn(),
}));

vi.mock('node:dns/promises', () => ({ lookup: lookupMock }));
vi.mock('node:https', () => ({ default: { request: requestMock } }));

function makeRequestMock() {
  const request = new EventEmitter() as EventEmitter & {
    setTimeout: ReturnType<typeof vi.fn>;
    write: ReturnType<typeof vi.fn>;
    end: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
  };
  request.setTimeout = vi.fn();
  request.write = vi.fn();
  request.destroy = vi.fn();
  request.end = vi.fn();
  return request;
}

beforeEach(() => {
  vi.clearAllMocks();
  lookupMock.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
});

describe('pinned supplier HTTP client', () => {
  it('connects to the validated IP while preserving the original TLS hostname and Host header', async () => {
    const request = makeRequestMock();
    requestMock.mockImplementation((options: Record<string, unknown>, callback: (response: EventEmitter) => void) => {
      const response = new EventEmitter() as EventEmitter & {
        statusCode: number;
        statusMessage: string;
        headers: Record<string, string>;
      };
      response.statusCode = 200;
      response.statusMessage = 'OK';
      response.headers = { 'content-type': 'application/json' };
      queueMicrotask(() => {
        callback(response);
        response.emit('data', Buffer.from('{"items":[{"sku":"BAT-1"}]}'));
        response.emit('end');
      });
      return request;
    });

    const { fetchExternalJson } = await import('./http-client');
    const result = await fetchExternalJson(
      'https://supplier.example/api/products?active=true',
      { method: 'POST', headers: { authorization: 'Bearer secret' }, body: '{"page":1}' },
      10_000
    );

    expect(result.response.status).toBe(200);
    expect(result.payload).toEqual({ items: [{ sku: 'BAT-1' }] });
    expect(requestMock).toHaveBeenCalledWith(expect.objectContaining({
      hostname: '93.184.216.34',
      family: 4,
      servername: 'supplier.example',
      path: '/api/products?active=true',
      headers: expect.objectContaining({ host: 'supplier.example', authorization: 'Bearer secret' }),
    }), expect.any(Function));
    expect(request.write).toHaveBeenCalledWith('{"page":1}');
  });

  it('fails closed without opening a connection when any resolved address is private', async () => {
    lookupMock.mockResolvedValue([
      { address: '93.184.216.34', family: 4 },
      { address: '127.0.0.1', family: 4 },
    ]);

    const { fetchExternalJson } = await import('./http-client');

    await expect(fetchExternalJson('https://supplier.example/products', {}, 1000)).rejects.toThrow(/rede privada/);
    expect(requestMock).not.toHaveBeenCalled();
  });
});
