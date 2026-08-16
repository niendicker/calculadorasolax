import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getUserMock, rpcMock, storageFromMock, createServerClientMock } = vi.hoisted(() => {
  const getUserMock = vi.fn();
  const rpcMock = vi.fn();
  const storageFromMock = vi.fn();
  return {
    getUserMock,
    rpcMock,
    storageFromMock,
    createServerClientMock: vi.fn(() => ({
      auth: { getUser: getUserMock },
      rpc: rpcMock,
      storage: { from: storageFromMock },
    })),
  };
});

vi.mock('@/lib/supabase/server', () => ({ createClient: createServerClientMock }));

async function importRoute() {
  const mod = await import('./route');
  return mod.POST;
}

function mockStorage({
  list = { data: [], error: null },
  remove = { data: null, error: null },
}: {
  list?: { data: unknown; error: unknown };
  remove?: { data: unknown; error: unknown };
} = {}) {
  storageFromMock.mockReturnValue({
    list: vi.fn().mockResolvedValue(list),
    remove: vi.fn().mockResolvedValue(remove),
  });
}

describe('POST /api/account/delete', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when there is no authenticated user', async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const POST = await importRoute();

    const response = await POST();

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Não autenticado.' });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('deletes the user and returns success when there are no logo files to clean up', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    mockStorage();
    rpcMock.mockResolvedValue({ error: null });
    const POST = await importRoute();

    const response = await POST();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(rpcMock).toHaveBeenCalledWith('delete_own_account');
  });

  it('removes every logo file before deleting the user', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    const removeMock = vi.fn().mockResolvedValue({ data: null, error: null });
    storageFromMock.mockReturnValue({
      list: vi.fn().mockResolvedValue({ data: [{ name: 'a.png' }, { name: 'b.png' }], error: null }),
      remove: removeMock,
    });
    rpcMock.mockResolvedValue({ error: null });
    const POST = await importRoute();

    const response = await POST();

    expect(response.status).toBe(200);
    expect(removeMock).toHaveBeenCalledWith(['user-1/logo/a.png', 'user-1/logo/b.png']);
    expect(rpcMock).toHaveBeenCalledWith('delete_own_account');
  });

  it('returns 500 with the Supabase error message when delete_own_account fails', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    mockStorage();
    rpcMock.mockResolvedValue({ error: { message: 'rpc unavailable' } });
    const POST = await importRoute();

    const response = await POST();

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'rpc unavailable' });
  });

  it('still deletes the user when the best-effort logo cleanup fails to list', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    mockStorage({ list: { data: null, error: { message: 'storage down' } } });
    rpcMock.mockResolvedValue({ error: null });
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const POST = await importRoute();

    const response = await POST();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(consoleErrorSpy).toHaveBeenCalledWith({ message: 'storage down' });
    consoleErrorSpy.mockRestore();
  });

  it('returns a generic 500 instead of crashing when an unexpected error is thrown', async () => {
    getUserMock.mockRejectedValue(new Error('network blip'));
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const POST = await importRoute();

    const response = await POST();

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Não foi possível excluir a conta. Tente novamente.' });
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });
});
