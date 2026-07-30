import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getUserMock, createServerClientMock, storageFromMock, deleteUserMock, createServiceClientMock } = vi.hoisted(() => {
  const getUserMock = vi.fn();
  const deleteUserMock = vi.fn();
  const storageFromMock = vi.fn();
  return {
    getUserMock,
    deleteUserMock,
    storageFromMock,
    createServerClientMock: vi.fn(() => ({ auth: { getUser: getUserMock } })),
    createServiceClientMock: vi.fn(() => ({
      storage: { from: storageFromMock },
      auth: { admin: { deleteUser: deleteUserMock } },
    })),
  };
});

vi.mock('@/lib/supabase/server', () => ({ createClient: createServerClientMock }));
vi.mock('@supabase/supabase-js', () => ({ createClient: createServiceClientMock }));

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
    expect(createServiceClientMock).not.toHaveBeenCalled();
  });

  it('deletes the user and returns success when there are no logo files to clean up', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    mockStorage();
    deleteUserMock.mockResolvedValue({ error: null });
    const POST = await importRoute();

    const response = await POST();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(deleteUserMock).toHaveBeenCalledWith('user-1');
  });

  it('removes every logo file before deleting the user', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    const removeMock = vi.fn().mockResolvedValue({ data: null, error: null });
    storageFromMock.mockReturnValue({
      list: vi.fn().mockResolvedValue({ data: [{ name: 'a.png' }, { name: 'b.png' }], error: null }),
      remove: removeMock,
    });
    deleteUserMock.mockResolvedValue({ error: null });
    const POST = await importRoute();

    const response = await POST();

    expect(response.status).toBe(200);
    expect(removeMock).toHaveBeenCalledWith(['user-1/logo/a.png', 'user-1/logo/b.png']);
    expect(deleteUserMock).toHaveBeenCalledWith('user-1');
  });

  it('returns 500 with the Supabase error message when deleteUser fails', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    mockStorage();
    deleteUserMock.mockResolvedValue({ error: { message: 'admin API unavailable' } });
    const POST = await importRoute();

    const response = await POST();

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'admin API unavailable' });
  });

  it('still deletes the user when the best-effort logo cleanup fails to list', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    mockStorage({ list: { data: null, error: { message: 'storage down' } } });
    deleteUserMock.mockResolvedValue({ error: null });
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
