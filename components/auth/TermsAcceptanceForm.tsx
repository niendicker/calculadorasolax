'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';

export function TermsAcceptanceForm({
  locale,
  redirectTo,
}: {
  locale: string;
  redirectTo: string;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [accepted, setAccepted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function acceptAndContinue() {
    setSaving(true);
    setError(null);

    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      router.replace(`/${locale}/login?redirect=${encodeURIComponent(redirectTo)}`);
      return;
    }

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ terms_accepted_at: new Date().toISOString() })
      .eq('id', userData.user.id);

    setSaving(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    router.replace(redirectTo);
    router.refresh();
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.replace(`/${locale}/login`);
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 py-12">
      <div className="w-full max-w-lg rounded-lg border bg-card p-6 shadow-lg">
        <h1 className="text-xl font-semibold tracking-tight">Atualizamos nossos termos</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Antes de continuar, precisamos que você revise e aceite os Termos de Uso e a Política de Privacidade
          da Calculadora SolaX.
        </p>

        <div className="mt-5 flex flex-col gap-2 text-sm">
          <a href={`/${locale}/termos`} target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:underline">
            Ler os Termos de Uso →
          </a>
          <a href={`/${locale}/privacidade`} target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:underline">
            Ler a Política de Privacidade →
          </a>
        </div>

        <label className="mt-5 flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 shrink-0"
            checked={accepted}
            onChange={(event) => setAccepted(event.target.checked)}
          />
          <span>Li e aceito os Termos de Uso e a Política de Privacidade.</span>
        </label>

        {error && (
          <p role="alert" className="mt-3 rounded-lg border border-destructive/40 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-between">
          <Button type="button" variant="outline" onClick={signOut}>
            <LogOut className="h-4 w-4" />
            Sair
          </Button>
          <Button type="button" disabled={!accepted || saving} onClick={acceptAndContinue}>
            {saving ? 'Salvando...' : 'Aceitar e continuar'}
          </Button>
        </div>
      </div>
    </main>
  );
}
