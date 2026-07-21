'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Eye, EyeOff, LogIn, Mail, Phone, User, X, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

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
          ? 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-100'
          : 'border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-800 dark:bg-rose-950/80 dark:text-rose-100'
      )}
    >
      {isSuccess
        ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
        : <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600 dark:text-rose-400" />
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

    if (!acceptedTerms) {
      setToast({ message: 'É preciso aceitar os Termos de Uso e a Política de Privacidade.', type: 'error' });
      return;
    }

    setLoading(true);
    setToast(null);

    const origin = window.location.origin;
    const { data, error: authError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: `${origin}/${locale}/auth/callback?next=${encodeURIComponent(redirectTo)}`,
        data: {
          full_name: fullName.trim(),
          phone: phone.trim(),
          role: 'user',
        },
      },
    });

    if (authError) {
      setLoading(false);
      setToast({ message: authError.message, type: 'error' });
      return;
    }

    if (data.user) {
      await supabase.from('profiles').upsert({
        id: data.user.id,
        email: email.trim(),
        full_name: fullName.trim(),
        phone: phone.trim(),
        role: 'user',
        terms_accepted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }

    setLoading(false);
    setToast({
      message: data.session
        ? 'Cadastro criado. Redirecionando…'
        : 'Cadastro criado. Verifique seu email para confirmar o acesso.',
      type: 'success',
    });

    if (data.session) {
      const next = await resolveRedirect(redirectTo);
      router.replace(next);
      router.refresh();
    } else {
      setMode('login');
    }
  }

  async function recoverPassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setToast(null);

    const origin = window.location.origin;
    const { error: recoveryError } = await supabase.auth.resetPasswordForEmail(
      email.trim(),
      {
        redirectTo: `${origin}/${locale}/reset-password`,
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
    <main className="min-h-screen bg-background">
      <section className="grid min-h-screen grid-rows-[1fr_auto] px-6 py-5 sm:px-10 lg:grid-cols-[minmax(0,1fr)_420px] lg:px-20 xl:px-28">
        <div className="hidden lg:block" />

        <div className="flex w-full items-center justify-center py-14 lg:justify-end">
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
                      className="h-11 md:h-11 border-primary/80 bg-background pl-8 md:pl-8"
                      placeholder="Nome completo"
                      value={fullName}
                      onChange={(event) => setFullName(event.target.value)}
                      required
                    />
                  </FieldIcon>
                  <FieldIcon id="phone" label="Telefone" icon={<Phone className="h-4 w-4" />}>
                    <Input
                      id="phone"
                      className="h-11 md:h-11 border-primary/80 bg-background pl-8 md:pl-8"
                      placeholder="Telefone"
                      value={phone}
                      onChange={(event) => setPhone(event.target.value)}
                      required
                    />
                  </FieldIcon>
                </>
              )}

              <FieldIcon id="email" label="Email" icon={<Mail className="h-4 w-4" />}>
                <Input
                  id="email"
                  className="h-11 md:h-11 border-primary/80 bg-background pl-8 md:pl-8"
                  type="email"
                  placeholder="ex: example@email.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </FieldIcon>

              {mode !== 'recovery' && (
                <FieldIcon id="password" label="Senha">
                  <PasswordInput
                    id="password"
                    value={password}
                    showPassword={showPassword}
                    setShowPassword={setShowPassword}
                    onChange={setPassword}
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

              <Button className="h-11 md:h-11 w-full border-border bg-background text-foreground hover:border-primary hover:bg-background hover:text-primary" variant="outline" type="submit" disabled={loading}>
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

        <footer className="col-span-full flex flex-col gap-2 py-2 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span>© 2026 SolaX Power Brasil.</span>
          <span>Versão: 1.1.0</span>
        </footer>
      </section>

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
}: {
  id: string;
  value: string;
  showPassword: boolean;
  setShowPassword: (show: boolean) => void;
  onChange: (value: string) => void;
}) {
  return (
    <div className="relative">
      <Input
        id={id}
        className="h-11 md:h-11 border-transparent bg-muted pr-10 md:pr-10"
        type={showPassword ? 'text' : 'password'}
        placeholder="Senha"
        value={value}
        onChange={(event) => onChange(event.target.value)}
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
