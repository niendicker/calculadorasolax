'use client';

import { Building2, LogOut, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { InlineProfile } from '../types';

function initials(name: string, email: string) {
  const source = name.trim() || email.split('@')[0] || '?';
  const parts = source.split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? `${parts[0][0]}${parts.at(-1)?.[0] ?? ''}` : source.slice(0, 2)).toUpperCase();
}

export function SessionCard({
  profile,
  userEmail,
  onOpenProfile,
  onSignOut,
  signingOut,
  signOutError,
}: {
  profile: InlineProfile | null;
  userEmail: string | null;
  onOpenProfile: () => void;
  onSignOut: () => void;
  signingOut: boolean;
  signOutError: string | null;
}) {
  const displayEmail = userEmail || profile?.email || '';

  if (!displayEmail) {
    return (
      <div className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
        <p className="font-medium text-foreground">Acesso restrito</p>
        <p className="mt-1">Entre para editar perfil e catálogo.</p>
      </div>
    );
  }

  const displayName = profile?.fullName.trim() || displayEmail;
  const roleLabel = profile?.role === 'admin' ? 'Administrador' : 'Usuário';

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={onOpenProfile}
        className="flex w-full items-center gap-3 rounded-lg border bg-muted/40 p-3 text-left transition-colors hover:border-primary/30 hover:bg-primary/5"
        aria-label="Abrir perfil da conta"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
          {initials(profile?.fullName ?? '', displayEmail)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-semibold text-foreground">{displayName}</span>
          {profile?.companyName.trim() && (
            <span className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-muted-foreground">
              <Building2 className="h-3 w-3 shrink-0" aria-hidden="true" />
              {profile.companyName}
            </span>
          )}
          <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{displayEmail}</span>
          <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-background px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            <UserRound className="h-3 w-3" aria-hidden="true" />
            {roleLabel}
          </span>
        </span>
      </button>
      {signOutError && <p className="text-xs text-destructive" role="alert">{signOutError}</p>}
      <Button variant="outline" className="w-full justify-start" onClick={onSignOut} disabled={signingOut}>
        <LogOut className="h-4 w-4" />
        {signingOut ? 'Saindo...' : 'Sair'}
      </Button>
    </div>
  );
}
