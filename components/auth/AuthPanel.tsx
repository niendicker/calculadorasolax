'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { CheckCircle2, Eye, EyeOff, Lock, LogIn, Mail, Phone, User, X, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { LoginIllustration } from './LoginIllustration';

interface ToastState {
  message: string;
  type: 'success' | 'error';
}

function Toast({ toast, onDismiss }: { toast: ToastState; onDismiss: () => void }) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Gates the createPortal call below until after client mount — document
    // doesn't exist during SSR, so this can't be a lazy useState initializer
    // without causing a hydration mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
    const showTimer = setTimeout(() => setVisible(true), 10);
    const hideTimer = setTimeout(() => {
      setVisible(false);
      setTimeout(onDismiss, 350);
    }, 5000);
    return () => { clearTimeout(showTimer); clearTimeout(hideTimer); };
  }, [onDismiss]);

  function dismiss() {
    setVisible(false);
    setTimeout(onDismiss, 350);
  }

  if (!mounted) return null;

  const isSuccess = toast.type === 'success';

  return createPortal(
    <div
      role={isSuccess ? 'status' : 'alert'}
      aria-live="polite"
      className={cn(
        'fixed top-5 right-5 z-[9999] flex w-80 max-w-[calc(100vw-2.5rem)] items-start gap-3 rounded-lg border p-4 shadow-xl transition-all duration-300 ease-out',
        visible ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0',
        isSuccess
          ? 'border-success/30 bg-success/10 text-success'
          : 'border-destructive/30 bg-destructive/10 text-destructive'
      )}
    >
      {isSuccess
        ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
        : <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
      }
      <p className="min-w-0 flex-1 text-sm font-medium leading-snug">{toast.message}</p>
      <button
        type="button"
        aria-label="Fechar"
        onClick={dismiss}
        className="shrink-0 rounded-md p-0.5 opacity-60 hover:opacity-100"
      >
        <X className="h-4 w-4" />
      </button>
    </div>,
    document.body
  );
}

type Mode = 'login' | 'signup' | 'recovery';

export function AuthPanel({
  locale,
  redirectTo,
}: {
  locale: string;
  redirectTo: string;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [mode, setMode] = useState<Mode>('login');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);

  async function resolveRedirect(defaultRedirect: string) {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return defaultRedirect;

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userData.user.id)
      .maybeSingle();

    if (profile?.role === 'admin' && defaultRedirect === `/${locale}`) {
      return `/${locale}/admin`;
    }

    return defaultRedirect;
  }

  async function login(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setToast(null);

    const { error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    setLoading(false);

    if (authError) {
      setToast({ message: 'Não foi possível entrar. Verifique email e senha.', type: 'error' });
      return;
    }

    const next = await resolveRedirect(redirectTo);
    setToast({ message: 'Login realizado com sucesso. Redirecionando…', type: 'success' });
    window.setTimeout(() => {
      router.replace(next);
      router.refresh();
    }, 1200);
  }

  async function signup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (password !== confirmPassword) {
      setToast({ message: 'As senhas não coincidem.', type: 'error' });
      return;
    }

    if (!acceptedTerms) {
      setToast({ message: 'É preciso aceitar os Termos de Uso e a Política de Privacidade.', type: 'error' });
      return;
    }

    setLoading(true);
    setToast(null);

    // Account creation + the confirmation email both happen server-side now
    // (see app/api/auth/signup) — Supabase Admin's generateLink creates the
    // user (same handle_new_user trigger, same raw_user_meta_data columns
    // this used to send straight to signUp()) and Resend sends the
    // confirmation email from its own template instead of GoTrue's built-in
    // one. This never returns a session: the user always has to confirm
    // their email before they can log in.
    let response: Response;
    try {
      response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          password,
          name: fullName.trim(),
          phone: phone.trim(),
          termsAccepted: acceptedTerms,
          locale,
          redirectTo,
        }),
      });
    } catch {
      setLoading(false);
      setToast({ message: 'Falha de conexão. Verifique sua internet e tente novamente.', type: 'error' });
      return;
    }

    const result = await response.json().catch(() => null);
    setLoading(false);

    if (!response.ok) {
      setToast({ message: result?.error || 'Não foi possível concluir o cadastro. Tente novamente.', type: 'error' });
      return;
    }

    setToast({
      message: 'Cadastro realizado. Enviamos um e-mail de confirmação para o endereço informado.',
      type: 'success',
    });
    setMode('login');
  }

  async function recoverPassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setToast(null);

    const origin = window.location.origin;
    // Through /auth/callback (not straight to /reset-password) so its
    // exchangeCodeForSession(code) runs first — the recovery link uses the
    // same PKCE code flow as login/signup confirmation, and
    // ResetPasswordPanel's updateUser() has no session to update without
    // that exchange happening somewhere first (was failing with "Auth
    // session missing!").
    const { error: recoveryError } = await supabase.auth.resetPasswordForEmail(
      email.trim(),
      {
        redirectTo: `${origin}/${locale}/auth/callback?next=${encodeURIComponent(`/${locale}/reset-password`)}`,
      }
    );

    setLoading(false);

    if (recoveryError) {
      setToast({ message: recoveryError.message, type: 'error' });
      return;
    }

    setToast({ message: 'Enviamos um link de recuperação para o email informado.', type: 'success' });
  }

  return (
    <main className="relative isolate overflow-hidden">
      <Image
        src="/images/login/solax-logo.png"
        alt="SolaX"
        width={256}
        height={88}
        priority
        className="absolute left-6 top-6 z-20 h-auto w-32 sm:left-10 sm:top-8"
      />

      <div className="login-page">
        <div className="login-image relative flex items-center justify-center" aria-hidden="true">
          <div className="relative z-10">
            <LoginIllustration />
          </div>
        </div>

        <div className="login-form bg-card px-6 py-14 sm:px-10 lg:px-20 xl:px-28">
          <div className="w-full max-w-[420px]">
            <div className="mb-14 text-center lg:text-left">
              <h1 className="text-3xl font-bold uppercase leading-tight text-primary sm:text-4xl">
                {mode === 'login' && 'Seja bem vindo ao futuro da energia'}
                {mode === 'signup' && 'Crie sua conta SolaX'}
                {mode === 'recovery' && 'Recupere seu acesso'}
              </h1>
            </div>

            <form
              onSubmit={
                mode === 'login'
                  ? login
                  : mode === 'signup'
                    ? signup
                    : recoverPassword
              }
              className="space-y-6"
            >
              {mode === 'signup' && (
                <>
                  <FieldIcon id="fullName" label="Nome" icon={<User className="h-4 w-4" />}>
                    <Input
                      id="fullName"
                      className="h-11 md:h-11 border-primary/80 pl-8 md:pl-8"
                      placeholder="Nome completo"
                      value={fullName}
                      onChange={(event) => setFullName(event.target.value)}
                      autoComplete="name"
                      required
                    />
                  </FieldIcon>
                  <FieldIcon id="phone" label="Telefone" icon={<Phone className="h-4 w-4" />}>
                    <Input
                      id="phone"
                      className="h-11 md:h-11 border-primary/80 pl-8 md:pl-8"
                      placeholder="Telefone"
                      value={phone}
                      onChange={(event) => setPhone(event.target.value)}
                      autoComplete="tel"
                      required
                    />
                  </FieldIcon>
                </>
              )}

              <FieldIcon id="email" label="Email" icon={<Mail className="h-4 w-4" />}>
                <Input
                  id="email"
                  className="h-11 md:h-11 border-primary/80 pl-8 md:pl-8"
                  type="email"
                  placeholder="ex: example@email.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="email"
                  required
                />
              </FieldIcon>

              {mode !== 'recovery' && (
                <FieldIcon id="password" label="Senha" icon={<Lock className="h-4 w-4" />}>
                  <PasswordInput
                    id="password"
                    value={password}
                    showPassword={showPassword}
                    setShowPassword={setShowPassword}
                    onChange={setPassword}
                    autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  />
                </FieldIcon>
              )}

              {mode === 'signup' && (
                <FieldIcon id="confirmPassword" label="Confirmar senha" icon={<Lock className="h-4 w-4" />}>
                  <PasswordInput
                    id="confirmPassword"
                    value={confirmPassword}
                    showPassword={showPassword}
                    setShowPassword={setShowPassword}
                    onChange={setConfirmPassword}
                    autoComplete="new-password"
                  />
                </FieldIcon>
              )}

              {mode === 'signup' && (
                <label className="flex items-start gap-2 text-sm text-muted-foreground">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 shrink-0"
                    checked={acceptedTerms}
                    onChange={(event) => setAcceptedTerms(event.target.checked)}
                    required
                  />
                  <span>
                    Li e aceito os{' '}
                    <a href={`/${locale}/termos`} target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:underline">
                      Termos de Uso
                    </a>{' '}
                    e a{' '}
                    <a href={`/${locale}/privacidade`} target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:underline">
                      Política de Privacidade
                    </a>
                    .
                  </span>
                </label>
              )}

              <Button className="h-11 md:h-11 w-full" type="submit" disabled={loading}>
                {loading && 'Processando...'}
                {!loading && mode === 'login' && (
                  <>
                    <LogIn className="h-4 w-4" />
                    Login
                  </>
                )}
                {!loading && mode === 'signup' && 'Cadastrar'}
                {!loading && mode === 'recovery' && 'Enviar recuperação'}
              </Button>
            </form>

            {mode === 'login' ? (
              <div className="mt-8 space-y-7 text-center text-sm">
                <p className="text-muted-foreground">
                  Não possui cadastro?{' '}
                  <button
                    type="button"
                    className="font-medium text-primary hover:underline"
                    onClick={() => setMode('signup')}
                  >
                    Criar Conta
                  </button>
                </p>
                <button
                  type="button"
                  className="text-primary hover:underline"
                  onClick={() => setMode('recovery')}
                >
                  Esqueci a senha
                </button>
              </div>
            ) : (
              <div className="mt-8 text-center text-sm">
                <button
                  type="button"
                  className="font-medium text-primary hover:underline"
                  onClick={() => setMode('login')}
                >
                  Voltar ao login
                </button>
              </div>
            )}

          </div>
        </div>
      </div>

      <footer className="absolute inset-x-0 bottom-0 z-20 flex flex-col gap-2 py-2 pl-6 pr-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:pl-10 sm:pr-10 lg:pr-20 xl:pr-28">
        <span>© 2026 SolaX Power Brasil.</span>
        <span>Versão: 1.1.0</span>
      </footer>

      {toast && <Toast toast={toast} onDismiss={() => setToast(null)} />}
    </main>
  );
}

function FieldIcon({
  id,
  label,
  icon,
  children,
}: {
  id: string;
  label: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {label}
      </Label>
      <div className="relative">
        {icon && (
          <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground">
            {icon}
          </span>
        )}
        {children}
      </div>
    </div>
  );
}

function PasswordInput({
  id,
  value,
  showPassword,
  setShowPassword,
  onChange,
  autoComplete,
}: {
  id: string;
  value: string;
  showPassword: boolean;
  setShowPassword: (show: boolean) => void;
  onChange: (value: string) => void;
  autoComplete?: string;
}) {
  return (
    <div className="relative">
      <Input
        id={id}
        className="h-11 md:h-11 border-transparent pl-8 pr-10 md:pl-8 md:pr-10"
        type={showPassword ? 'text' : 'password'}
        placeholder="Senha"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete={autoComplete}
        minLength={6}
        required
      />
      <button
        type="button"
        className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-background hover:text-foreground"
        aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
        onClick={() => setShowPassword(!showPassword)}
      >
        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}
