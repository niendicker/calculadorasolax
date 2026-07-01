'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, KeyRound, Mail, Phone, ShieldCheck, Sparkles, Sun, User, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createClient } from '@/lib/supabase/client';

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
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function clearFeedback() {
    setError(null);
    setMessage(null);
  }

  async function login(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    clearFeedback();

    const { error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    setLoading(false);

    if (authError) {
      setError(authError.message);
      return;
    }

    router.replace(redirectTo);
    router.refresh();
  }

  async function signup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    clearFeedback();

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
      setError(authError.message);
      return;
    }

    if (data.user) {
      await supabase.from('profiles').upsert({
        id: data.user.id,
        email: email.trim(),
        full_name: fullName.trim(),
        phone: phone.trim(),
        role: 'user',
        updated_at: new Date().toISOString(),
      });
    }

    setLoading(false);
    setMessage(
      data.session
        ? 'Cadastro criado. Redirecionando...'
        : 'Cadastro criado. Verifique seu email para confirmar o acesso.'
    );

    if (data.session) {
      router.replace(redirectTo);
      router.refresh();
    } else {
      setMode('login');
    }
  }

  async function recoverPassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    clearFeedback();

    const origin = window.location.origin;
    const { error: recoveryError } = await supabase.auth.resetPasswordForEmail(
      email.trim(),
      {
        redirectTo: `${origin}/${locale}/reset-password`,
      }
    );

    setLoading(false);

    if (recoveryError) {
      setError(recoveryError.message);
      return;
    }

    setMessage('Enviamos um link de recuperação para o email informado.');
  }

  return (
    <main className="min-h-screen bg-background px-4 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto grid min-h-[calc(100vh-2.5rem)] w-full max-w-6xl overflow-hidden rounded-[8px] border bg-card shadow-sm lg:grid-cols-[1fr_460px]">
        <div className="relative hidden bg-primary p-8 text-primary-foreground lg:flex lg:flex-col">
          <div className="absolute inset-0 opacity-15 [background-image:linear-gradient(to_right,currentColor_1px,transparent_1px),linear-gradient(to_bottom,currentColor_1px,transparent_1px)] [background-size:44px_44px]" />
          <div className="relative z-10 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-[8px] bg-accent text-accent-foreground">
              <Sun className="h-5 w-5" />
            </div>
            <div>
              <p className="text-lg font-semibold leading-none">SolaX</p>
              <p className="mt-1 text-xs text-primary-foreground/70">Solution Studio</p>
            </div>
          </div>

          <div className="relative z-10 mt-auto max-w-xl">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-primary-foreground/20 px-3 py-1 text-xs text-primary-foreground/80">
              <Sparkles className="h-3.5 w-3.5 text-accent" />
              Plataforma de dimensionamento híbrido
            </div>
            <h1 className="text-5xl font-semibold leading-tight tracking-tight">
              Acesse, calcule e mantenha combinações aprovadas.
            </h1>
            <p className="mt-4 max-w-lg text-sm leading-6 text-primary-foreground/72">
              Usuários comuns calculam soluções e administradores mantêm catálogos,
              acessórios e regras de recomendação em uma experiência única.
            </p>

            <div className="mt-8 grid grid-cols-3 gap-3">
              <InfoTile icon={<Zap className="h-4 w-4" />} label="Cálculo" value="Rápido" />
              <InfoTile icon={<ShieldCheck className="h-4 w-4" />} label="Acesso" value="Seguro" />
              <InfoTile icon={<Sun className="h-4 w-4" />} label="Catálogo" value="Aprovado" />
            </div>
          </div>
        </div>

        <section className="flex min-h-full flex-col bg-card">
          <div className="h-1 bg-accent" />
          <div className="border-b px-5 py-4 lg:hidden">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-[8px] bg-primary text-primary-foreground">
                <Sun className="h-4 w-4" />
              </div>
              <div>
                <p className="font-semibold leading-none">SolaX</p>
                <p className="mt-1 text-xs text-muted-foreground">Solution Studio</p>
              </div>
            </div>
          </div>

          <div className="flex flex-1 items-start px-5 py-8 sm:px-8 lg:items-center">
            <div className="w-full">
              <div className="mb-7">
                <p className="text-sm font-medium text-muted-foreground">Acesso</p>
                <h2 className="mt-2 text-3xl font-semibold tracking-tight">
              {mode === 'login' && 'Entrar'}
              {mode === 'signup' && 'Criar conta'}
              {mode === 'recovery' && 'Recuperar senha'}
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  {mode === 'login' && 'Use email e senha cadastrados.'}
                  {mode === 'signup' && 'Usuários comuns podem se cadastrar por aqui.'}
                  {mode === 'recovery' && 'Informe o email para receber o link de recuperação.'}
                </p>
              </div>

            <div className="mb-6 grid grid-cols-3 rounded-[8px] border bg-muted p-1">
              <Button
                type="button"
                variant={mode === 'login' ? 'default' : 'ghost'}
                className="rounded-[6px]"
                onClick={() => setMode('login')}
              >
                Login
              </Button>
              <Button
                type="button"
                variant={mode === 'signup' ? 'default' : 'ghost'}
                className="rounded-[6px]"
                onClick={() => setMode('signup')}
              >
                Cadastro
              </Button>
              <Button
                type="button"
                variant={mode === 'recovery' ? 'default' : 'ghost'}
                className="rounded-[6px]"
                onClick={() => setMode('recovery')}
              >
                Senha
              </Button>
            </div>

            <form
              onSubmit={
                mode === 'login'
                  ? login
                  : mode === 'signup'
                    ? signup
                    : recoverPassword
              }
              className="space-y-4"
            >
              {mode === 'signup' && (
                <>
                  <FieldIcon id="fullName" label="Nome" icon={<User className="h-4 w-4" />}>
                    <Input
                      id="fullName"
                      className="pl-8"
                      value={fullName}
                      onChange={(event) => setFullName(event.target.value)}
                      required
                    />
                  </FieldIcon>
                  <FieldIcon id="phone" label="Telefone" icon={<Phone className="h-4 w-4" />}>
                    <Input
                      id="phone"
                      className="pl-8"
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
                  className="pl-8"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </FieldIcon>

              {mode !== 'recovery' && (
                <FieldIcon id="password" label="Senha" icon={<KeyRound className="h-4 w-4" />}>
                  <Input
                    id="password"
                    className="pl-8"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    minLength={6}
                    required
                  />
                </FieldIcon>
              )}

              <Button className="w-full" type="submit" disabled={loading}>
                {loading && 'Processando...'}
                {!loading && mode === 'login' && (
                  <>
                    Entrar
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
                {!loading && mode === 'signup' && 'Cadastrar'}
                {!loading && mode === 'recovery' && 'Enviar recuperação'}
              </Button>
            </form>

            {message && (
              <p className="rounded-lg border border-emerald-300 px-3 py-2 text-sm text-emerald-700">
                {message}
              </p>
            )}
            {error && (
              <p className="rounded-lg border border-destructive/40 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}
            <p className="mt-6 text-xs leading-5 text-muted-foreground">
              Administradores são definidos manualmente no Supabase. O cadastro público cria
              usuários comuns.
            </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function InfoTile({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[8px] border border-primary-foreground/15 bg-primary-foreground/8 p-3">
      <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-[6px] bg-primary-foreground/10 text-accent">
        {icon}
      </div>
      <p className="text-xs text-primary-foreground/58">{label}</p>
      <p className="mt-1 text-sm font-semibold">{value}</p>
    </div>
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
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <span className="pointer-events-none absolute left-2 top-2 text-muted-foreground">
          {icon}
        </span>
        {children}
      </div>
    </div>
  );
}
