'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createClient } from '@/lib/supabase/client';

interface Profile {
  id: string;
  email: string;
  full_name: string;
  phone: string;
  role: 'user' | 'admin';
}

export function ProfilePanel({
  locale,
  initialProfile,
}: {
  locale: string;
  initialProfile: Profile;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [profile, setProfile] = useState(initialProfile);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    setError(null);

    const { error: profileError } = await supabase.from('profiles').upsert({
      id: profile.id,
      email: profile.email,
      full_name: profile.full_name.trim(),
      phone: profile.phone.trim(),
      updated_at: new Date().toISOString(),
    });

    setSaving(false);

    if (profileError) {
      setError(profileError.message);
      return;
    }

    setMessage('Perfil atualizado.');
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.replace(`/${locale}/login`);
    router.refresh();
  }

  return (
    <main className="min-h-screen bg-muted/30 px-4 py-8">
      <div className="mx-auto w-full max-w-xl space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Meu perfil</h1>
            <p className="text-sm text-muted-foreground">Edite seus dados de cadastro.</p>
          </div>
          <Button variant="outline" onClick={signOut}>
            <LogOut className="h-4 w-4" />
            Sair
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Dados pessoais</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={saveProfile} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="profileEmail">Email</Label>
                <Input id="profileEmail" value={profile.email} disabled />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="profileRole">Tipo de acesso</Label>
                <Input
                  id="profileRole"
                  value={profile.role === 'admin' ? 'Administrador' : 'Usuário comum'}
                  disabled
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="profileName">Nome</Label>
                <Input
                  id="profileName"
                  value={profile.full_name}
                  onChange={(event) => setProfile({ ...profile, full_name: event.target.value })}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="profilePhone">Telefone</Label>
                <Input
                  id="profilePhone"
                  value={profile.phone}
                  onChange={(event) => setProfile({ ...profile, phone: event.target.value })}
                  required
                />
              </div>
              <Button type="submit" disabled={saving}>
                <Save className="h-4 w-4" />
                {saving ? 'Salvando...' : 'Salvar perfil'}
              </Button>
            </form>
          </CardContent>
        </Card>

        {message && <p className="rounded-lg border border-emerald-300 bg-background px-3 py-2 text-sm text-emerald-700">{message}</p>}
        {error && <p className="rounded-lg border border-destructive/40 bg-background px-3 py-2 text-sm text-destructive">{error}</p>}
      </div>
    </main>
  );
}
