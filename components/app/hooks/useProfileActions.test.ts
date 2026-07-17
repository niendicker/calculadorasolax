// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InlineProfile } from '../types';
import { useProfileActions } from './useProfileActions';

const fakeProfile: InlineProfile = {
  id: 'user-1',
  email: 'a@b.com',
  fullName: 'Fulano',
  phone: '',
  role: 'user',
  companyName: '',
  companyAddress: '',
  companyLogoUrl: '',
};

function makeSupabase({
  upsertError = null as { message: string } | null,
  uploadError = null as { message: string } | null,
  publicUrl = 'https://cdn.example.com/logo.png',
} = {}) {
  return {
    from: vi.fn(() => ({ upsert: vi.fn().mockResolvedValue({ error: upsertError }) })),
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn().mockResolvedValue({ error: uploadError }),
        getPublicUrl: vi.fn(() => ({ data: { publicUrl } })),
      })),
    },
    auth: { signOut: vi.fn().mockResolvedValue({ error: null }) },
  };
}

function setup(overrides: Record<string, unknown> = {}) {
  const router = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() };
  const supabase = makeSupabase();
  const props = {
    supabase,
    profile: fakeProfile,
    setProfile: vi.fn(),
    router,
    locale: 'pt',
    clearUserData: vi.fn(),
    setActiveTab: vi.fn(),
    ...overrides,
  } as unknown as Parameters<typeof useProfileActions>[0];
  const { result } = renderHook(() => useProfileActions(props));
  return { result, props: props as unknown as typeof props & { supabase: ReturnType<typeof makeSupabase> }, router };
}

function formEvent() {
  return { preventDefault: vi.fn() } as unknown as React.FormEvent<HTMLFormElement>;
}

describe('useProfileActions: openProfile', () => {
  it('redirects to login when there is no profile', () => {
    const { result, router } = setup({ profile: null });
    act(() => result.current.openProfile());
    expect(router.push).toHaveBeenCalledWith('/pt/login?redirect=/pt');
  });

  it('switches to the profile tab when logged in', () => {
    const { result, props } = setup();
    act(() => result.current.openProfile());
    expect(props.setActiveTab).toHaveBeenCalledWith('profile');
  });
});

describe('useProfileActions: saveProfile', () => {
  it('is a no-op when there is no profile', async () => {
    const { result } = setup({ profile: null });
    await act(async () => {
      await result.current.saveProfile(formEvent());
    });
    expect(result.current.profileMessage).toBeNull();
  });

  it('sets a success message when the upsert succeeds', async () => {
    const { result } = setup();
    await act(async () => {
      await result.current.saveProfile(formEvent());
    });
    expect(result.current.profileMessage).toBe('Perfil atualizado.');
    expect(result.current.profileSaving).toBe(false);
  });

  it('sets the Supabase error message when the upsert fails', async () => {
    const supabase = makeSupabase({ upsertError: { message: 'coluna inválida' } });
    const { result } = setup({ supabase });
    await act(async () => {
      await result.current.saveProfile(formEvent());
    });
    expect(result.current.profileError).toBe('coluna inválida');
    expect(result.current.profileMessage).toBeNull();
  });
});

describe('useProfileActions: uploadCompanyLogo', () => {
  it('is a no-op without a file', async () => {
    const { result, props } = setup();
    await act(async () => {
      await result.current.uploadCompanyLogo(undefined);
    });
    expect(props.setProfile).not.toHaveBeenCalled();
  });

  it('uploads the file and updates the profile logo url on success', async () => {
    const { result, props } = setup();
    const file = new File(['x'], 'logo.png', { type: 'image/png' });

    await act(async () => {
      await result.current.uploadCompanyLogo(file);
    });

    expect(props.setProfile).toHaveBeenCalledWith({ ...fakeProfile, companyLogoUrl: 'https://cdn.example.com/logo.png' });
    expect(result.current.profileMessage).toContain('Logomarca carregada');
  });

  it('sets the Supabase error message when the upload fails', async () => {
    const supabase = makeSupabase({ uploadError: { message: 'arquivo muito grande' } });
    const { result, props } = setup({ supabase });
    const file = new File(['x'], 'logo.png', { type: 'image/png' });

    await act(async () => {
      await result.current.uploadCompanyLogo(file);
    });

    expect(result.current.profileError).toBe('arquivo muito grande');
    expect(props.setProfile).not.toHaveBeenCalled();
  });
});

describe('useProfileActions: deleteAccount', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('signs out, clears data and redirects to login on success', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });
    const { result, props, router } = setup();

    await act(async () => {
      await result.current.deleteAccount();
    });

    expect(props.supabase.auth.signOut).toHaveBeenCalled();
    expect(props.clearUserData).toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledWith('/pt/login');
  });

  it('surfaces the server error message and does not sign out when the request fails', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'não autorizado' }),
    });
    const { result, props } = setup();

    await act(async () => {
      await result.current.deleteAccount();
    });

    expect(result.current.deleteAccountError).toBe('não autorizado');
    expect(result.current.deletingAccount).toBe(false);
    expect(props.supabase.auth.signOut).not.toHaveBeenCalled();
  });

  it('sets a generic error message when the request itself throws', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('network down'));
    const { result } = setup();

    await act(async () => {
      await result.current.deleteAccount();
    });

    expect(result.current.deleteAccountError).toBe('Não foi possível excluir a conta. Tente novamente.');
  });
});
