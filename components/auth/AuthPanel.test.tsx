// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSupabaseMock } from '@/lib/test-helpers/supabase-mock';
import { AuthPanel } from './AuthPanel';

const { createClientMock, routerMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  routerMock: { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() },
}));
vi.mock('@/lib/supabase/client', () => ({ createClient: createClientMock }));
vi.mock('next/navigation', () => ({ useRouter: () => routerMock }));

function setup() {
  return render(<AuthPanel locale="pt" redirectTo="/pt" />);
}

beforeEach(() => {
  createClientMock.mockReset();
  routerMock.push.mockReset();
  routerMock.replace.mockReset();
  routerMock.refresh.mockReset();
  vi.useRealTimers();
});

describe('AuthPanel: login', () => {
  it('signs in and redirects to the default page for a non-admin user', async () => {
    createClientMock.mockReturnValue(
      createSupabaseMock({ tableResults: { profiles: { data: { role: 'user' }, error: null } } })
    );
    setup();

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'user@x.com' } });
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'segredo123' } });
    fireEvent.click(screen.getByRole('button', { name: /Login/ }));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Login realizado com sucesso'));
    await waitFor(() => expect(routerMock.replace).toHaveBeenCalledWith('/pt'), { timeout: 2000 });
  });

  it('redirects an admin user to /admin instead of the default page', async () => {
    createClientMock.mockReturnValue(
      createSupabaseMock({ tableResults: { profiles: { data: { role: 'admin' }, error: null } } })
    );
    setup();

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'admin@x.com' } });
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'segredo123' } });
    fireEvent.click(screen.getByRole('button', { name: /Login/ }));

    await waitFor(() => expect(routerMock.replace).toHaveBeenCalledWith('/pt/admin'), { timeout: 2000 });
  });

  it('shows a generic error message on invalid credentials', async () => {
    createClientMock.mockReturnValue(
      createSupabaseMock({ auth: { signInWithPassword: vi.fn().mockResolvedValue({ error: { message: 'invalid' } }) } })
    );
    setup();

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'user@x.com' } });
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: /Login/ }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível entrar'));
    expect(routerMock.replace).not.toHaveBeenCalled();
  });

  it('switches to the signup and recovery modes and back', () => {
    setup();
    expect(screen.getByRole('heading', { name: /Seja bem vindo/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Criar Conta' }));
    expect(screen.getByRole('heading', { name: /Crie sua conta/ })).toBeInTheDocument();
    expect(screen.getByLabelText('Nome')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Voltar ao login' }));
    expect(screen.getByRole('heading', { name: /Seja bem vindo/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Esqueci a senha' }));
    expect(screen.getByRole('heading', { name: /Recupere seu acesso/ })).toBeInTheDocument();
    expect(screen.queryByLabelText('Senha')).not.toBeInTheDocument();
  });
});

describe('AuthPanel: signup', () => {
  function fillSignupForm() {
    fireEvent.click(screen.getByRole('button', { name: 'Criar Conta' }));
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Fulano' } });
    fireEvent.change(screen.getByLabelText('Telefone'), { target: { value: '11999999999' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'novo@x.com' } });
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'segredo123' } });
  }

  it('requires accepting the terms before submitting', () => {
    createClientMock.mockReturnValue(createSupabaseMock());
    setup();
    fillSignupForm();

    // The checkbox also carries the native `required` attribute, which would
    // block jsdom's own form validation before our handler ever runs — bypass
    // it here to exercise the app-level guard specifically.
    const form = screen.getByRole('button', { name: 'Cadastrar' }).closest('form') as HTMLFormElement;
    form.noValidate = true;
    fireEvent.submit(form);

    expect(screen.getByRole('alert')).toHaveTextContent('É preciso aceitar os Termos de Uso');
  });

  it('creates the account and shows a confirmation message when there is no session yet (email confirmation required)', async () => {
    const signUp = vi.fn().mockResolvedValue({ data: { user: { id: 'u1' }, session: null }, error: null });
    createClientMock.mockReturnValue(createSupabaseMock({ auth: { signUp } }));
    setup();
    fillSignupForm();
    fireEvent.click(screen.getByRole('checkbox'));

    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar' }));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Verifique seu email'));
    expect(signUp).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'novo@x.com',
        options: expect.objectContaining({ data: expect.objectContaining({ full_name: 'Fulano', phone: '11999999999' }) }),
      })
    );
    // Back to the login form once signup without an active session completes.
    await waitFor(() => expect(screen.getByRole('heading', { name: /Seja bem vindo/ })).toBeInTheDocument());
  });

  it('logs straight in and redirects when signup returns an active session', async () => {
    const signUp = vi.fn().mockResolvedValue({ data: { user: { id: 'u1' }, session: { access_token: 't' } }, error: null });
    createClientMock.mockReturnValue(
      createSupabaseMock({ auth: { signUp }, tableResults: { profiles: { data: { role: 'user' }, error: null } } })
    );
    setup();
    fillSignupForm();
    fireEvent.click(screen.getByRole('checkbox'));

    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar' }));

    await waitFor(() => expect(routerMock.replace).toHaveBeenCalledWith('/pt'));
  });

  it('shows the Supabase error message when signup fails', async () => {
    const signUp = vi.fn().mockResolvedValue({ data: { user: null, session: null }, error: { message: 'Email já cadastrado' } });
    createClientMock.mockReturnValue(createSupabaseMock({ auth: { signUp } }));
    setup();
    fillSignupForm();
    fireEvent.click(screen.getByRole('checkbox'));

    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Email já cadastrado'));
  });
});

describe('AuthPanel: password recovery', () => {
  it('sends a recovery email and shows a success message', async () => {
    const resetPasswordForEmail = vi.fn().mockResolvedValue({ error: null });
    createClientMock.mockReturnValue(createSupabaseMock({ auth: { resetPasswordForEmail } }));
    setup();

    fireEvent.click(screen.getByRole('button', { name: 'Esqueci a senha' }));
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'user@x.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar recuperação' }));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Enviamos um link de recuperação'));
    expect(resetPasswordForEmail).toHaveBeenCalledWith('user@x.com', expect.objectContaining({ redirectTo: expect.stringContaining('/pt/reset-password') }));
  });

  it('shows the Supabase error message when the recovery request fails', async () => {
    const resetPasswordForEmail = vi.fn().mockResolvedValue({ error: { message: 'Muitas tentativas' } });
    createClientMock.mockReturnValue(createSupabaseMock({ auth: { resetPasswordForEmail } }));
    setup();

    fireEvent.click(screen.getByRole('button', { name: 'Esqueci a senha' }));
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'user@x.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar recuperação' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Muitas tentativas'));
  });
});

describe('AuthPanel: password visibility toggle', () => {
  it('toggles the password field between hidden and visible', () => {
    setup();
    const passwordInput = screen.getByLabelText('Senha');
    expect(passwordInput).toHaveAttribute('type', 'password');

    fireEvent.click(screen.getByRole('button', { name: 'Mostrar senha' }));
    expect(passwordInput).toHaveAttribute('type', 'text');

    fireEvent.click(screen.getByRole('button', { name: 'Ocultar senha' }));
    expect(passwordInput).toHaveAttribute('type', 'password');
  });
});
