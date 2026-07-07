'use client';

import { LogOut, Save, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import type { InlineProfile } from '../types';

export function ProfileTab({
  profile,
  setProfile,
  profileSaving,
  profileMessage,
  profileError,
  saveProfile,
  uploadCompanyLogo,
  signOut,
  deleteAccountOpen,
  setDeleteAccountOpen,
  deleteConfirmText,
  setDeleteConfirmText,
  deletingAccount,
  deleteAccountError,
  setDeleteAccountError,
  deleteAccount,
}: {
  profile: InlineProfile;
  setProfile: (profile: InlineProfile) => void;
  profileSaving: boolean;
  profileMessage: string | null;
  profileError: string | null;
  saveProfile: (event: React.FormEvent<HTMLFormElement>) => void;
  uploadCompanyLogo: (file: File | undefined) => void;
  signOut: () => void;
  deleteAccountOpen: boolean;
  setDeleteAccountOpen: (open: boolean) => void;
  deleteConfirmText: string;
  setDeleteConfirmText: (value: string) => void;
  deletingAccount: boolean;
  deleteAccountError: string | null;
  setDeleteAccountError: (error: string | null) => void;
  deleteAccount: () => void;
}) {
  return (
    <div className="mx-auto max-w-xl space-y-4 py-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Perfil</h1>
        <p className="text-sm text-muted-foreground">Edite seus dados de cadastro.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Dados pessoais</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={saveProfile} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="inlineProfileEmail">Email</Label>
                <Input id="inlineProfileEmail" value={profile.email} disabled />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="inlineProfileRole">Tipo de acesso</Label>
                <Input
                  id="inlineProfileRole"
                  value={profile.role === 'admin' ? 'Administrador' : 'Usuário comum'}
                  disabled
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inlineProfileName">Nome</Label>
              <Input
                id="inlineProfileName"
                value={profile.fullName}
                onChange={(event) => setProfile({ ...profile, fullName: event.target.value })}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inlineProfilePhone">Telefone</Label>
              <Input
                id="inlineProfilePhone"
                value={profile.phone}
                onChange={(event) => setProfile({ ...profile, phone: event.target.value })}
                required
              />
            </div>

            <Separator />

            <div>
              <p className="mb-3 text-sm font-medium">Empresa no relatório</p>
              <div className="grid gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="inlineCompanyName">Nome da empresa</Label>
                  <Input
                    id="inlineCompanyName"
                    value={profile.companyName}
                    onChange={(event) => setProfile({ ...profile, companyName: event.target.value })}
                    placeholder="Nome que aparecerá no relatório"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="inlineCompanyAddress">Endereço da empresa</Label>
                  <Input
                    id="inlineCompanyAddress"
                    value={profile.companyAddress}
                    onChange={(event) => setProfile({ ...profile, companyAddress: event.target.value })}
                    placeholder="Endereço comercial"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="inlineCompanyLogo">Logomarca</Label>
                  <Input
                    id="inlineCompanyLogo"
                    value={profile.companyLogoUrl}
                    onChange={(event) => setProfile({ ...profile, companyLogoUrl: event.target.value })}
                    placeholder="URL da logomarca"
                  />
                  <Input
                    type="file"
                    accept="image/*"
                    onChange={(event) => uploadCompanyLogo(event.target.files?.[0])}
                  />
                  {profile.companyLogoUrl && (
                    <div className="rounded-lg border bg-background p-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={profile.companyLogoUrl}
                        alt="Logomarca da empresa"
                        className="h-16 max-w-48 object-contain"
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>

            {profileMessage && (
              <p role="status" className="rounded-lg border border-primary/30 px-3 py-2 text-sm text-primary">
                {profileMessage}
              </p>
            )}
            {profileError && (
              <p role="alert" className="rounded-lg border border-destructive/40 px-3 py-2 text-sm text-destructive">
                {profileError}
              </p>
            )}

            <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
              <Button type="button" variant="outline" onClick={signOut}>
                <LogOut className="h-4 w-4" />
                Sair
              </Button>
              <Button type="submit" disabled={profileSaving}>
                <Save className="h-4 w-4" />
                {profileSaving ? 'Salvando...' : 'Salvar perfil'}
              </Button>
            </div>

            <Separator />

            <div className="space-y-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
              <div>
                <p className="text-sm font-medium text-destructive">Excluir conta</p>
                <p className="text-xs text-muted-foreground">
                  Remove definitivamente sua conta e os dados vinculados a ela (clientes, projetos e cargas
                  pessoais cadastradas). Essa ação não pode ser desfeita.
                </p>
              </div>

              {!deleteAccountOpen ? (
                <Button type="button" variant="destructive" size="sm" onClick={() => setDeleteAccountOpen(true)}>
                  <Trash2 className="h-4 w-4" />
                  Excluir minha conta
                </Button>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="deleteConfirmText">
                    Digite <span className="font-semibold">EXCLUIR</span> para confirmar
                  </Label>
                  <Input
                    id="deleteConfirmText"
                    value={deleteConfirmText}
                    onChange={(event) => setDeleteConfirmText(event.target.value)}
                    placeholder="EXCLUIR"
                  />
                  {deleteAccountError && (
                    <p role="alert" className="text-xs text-destructive">
                      {deleteAccountError}
                    </p>
                  )}
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setDeleteAccountOpen(false);
                        setDeleteConfirmText('');
                        setDeleteAccountError(null);
                      }}
                    >
                      Cancelar
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      disabled={deleteConfirmText !== 'EXCLUIR' || deletingAccount}
                      onClick={deleteAccount}
                    >
                      {deletingAccount ? 'Excluindo...' : 'Confirmar exclusão definitiva'}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
