'use client';

import { AlertTriangle, CheckCircle2, LogOut, Save, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { InfoLabel } from '@/components/ui/tooltip';
import { AddressFields } from '../address-fields';
import { formatDocument } from '../helpers';
import { PageHeader } from '../shell/slots';
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
  const companyAddressComplete = ['postalCode', 'street', 'number', 'district', 'city', 'state'].every((field) =>
    profile.companyAddress[field as keyof typeof profile.companyAddress].trim()
  );
  const companyDataComplete = Boolean(profile.companyDocument.trim() && companyAddressComplete);

  return (
    <div className="mx-auto max-w-5xl space-y-4 py-4">
      <PageHeader>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Perfil</h1>
          <p className="text-sm text-muted-foreground">Edite seus dados de cadastro.</p>
        </div>
      </PageHeader>

      <form onSubmit={saveProfile} className="space-y-4">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_17rem] lg:items-start">
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Dados pessoais</CardTitle>
                <p className="text-sm text-muted-foreground">Informações usadas para identificar seu acesso.</p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5"><Label htmlFor="inlineProfileEmail">Email</Label><Input id="inlineProfileEmail" value={profile.email} disabled /></div>
                  <div className="space-y-1.5"><Label htmlFor="inlineProfileRole">Tipo de acesso</Label><Input id="inlineProfileRole" value={profile.role === 'admin' ? 'Administrador' : 'Usuário comum'} disabled /></div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5"><Label htmlFor="inlineProfileName">Nome</Label><Input id="inlineProfileName" value={profile.fullName} onChange={(event) => setProfile({ ...profile, fullName: event.target.value })} required /></div>
                  <div className="space-y-1.5"><Label htmlFor="inlineProfilePhone">Telefone</Label><Input id="inlineProfilePhone" value={profile.phone} onChange={(event) => setProfile({ ...profile, phone: event.target.value })} required /></div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <CardTitle>Dados da empresa</CardTitle>
                    <p className="mt-1 text-sm text-muted-foreground">Informações exibidas nos relatórios e enviadas aos fornecedores.</p>
                  </div>
                  <div className={companyDataComplete ? 'flex items-center gap-1.5 text-xs font-medium text-primary' : 'flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-300'}>
                    {companyDataComplete ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> : <AlertTriangle className="h-4 w-4" aria-hidden="true" />}
                    {companyDataComplete ? 'Pronto para cotação' : 'Dados incompletos'}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5"><Label htmlFor="inlineCompanyName">Nome da empresa</Label><Input id="inlineCompanyName" value={profile.companyName} onChange={(event) => setProfile({ ...profile, companyName: event.target.value })} placeholder="Nome que aparecerá no relatório" /></div>
                  <div className="space-y-1.5"><Label htmlFor="inlineCompanyDocument"><InfoLabel label="CNPJ da empresa" tip="Enviado aos fornecedores nas solicitações de orçamento." /></Label><Input id="inlineCompanyDocument" value={profile.companyDocument} onChange={(event) => setProfile({ ...profile, companyDocument: formatDocument(event.target.value) })} placeholder="00.000.000/0000-00" /></div>
                </div>
                <div className="space-y-2">
                  <Label><InfoLabel label="Endereço da empresa" tip="Usado para identificar sua empresa na cotação e no relatório." /></Label>
                  <AddressFields address={profile.companyAddress} onChange={(partial) => setProfile({ ...profile, companyAddress: { ...profile.companyAddress, ...partial } })} idPrefix="inlineCompanyAddress" />
                </div>
                <div className="grid gap-4 border-t pt-4 lg:grid-cols-[minmax(0,1fr)_12rem] lg:items-start">
                  <div className="space-y-1.5"><Label htmlFor="inlineCompanyLogo"><InfoLabel label="Logomarca" tip="Aparece nos relatórios quando cadastrada." /></Label><Input id="inlineCompanyLogo" value={profile.companyLogoUrl} onChange={(event) => setProfile({ ...profile, companyLogoUrl: event.target.value })} placeholder="URL da logomarca (opcional)" /><Input type="file" accept="image/*" onChange={(event) => uploadCompanyLogo(event.target.files?.[0])} /></div>
                  {profile.companyLogoUrl && <div className="flex min-h-24 items-center justify-center rounded-lg border bg-muted/20 p-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={profile.companyLogoUrl} alt="Logomarca da empresa" className="max-h-20 max-w-full object-contain" />
                  </div>}
                </div>
              </CardContent>
            </Card>
          </div>

          <aside className="space-y-4 lg:sticky lg:top-4">
            <Card><CardHeader><CardTitle className="text-base">Ações do perfil</CardTitle></CardHeader><CardContent className="space-y-2"><Button type="submit" className="w-full" disabled={profileSaving}><Save className="h-4 w-4" />{profileSaving ? 'Salvando...' : 'Salvar perfil'}</Button><Button type="button" variant="outline" className="w-full" onClick={signOut}><LogOut className="h-4 w-4" />Sair</Button></CardContent></Card>
            <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground"><p className="font-medium text-foreground">Cotação ao fornecedor</p><p className="mt-1">O CNPJ e o endereço completo da empresa são necessários para enviar uma solicitação.</p></div>
          </aside>
        </div>

        {(profileMessage || profileError) && <div className="space-y-2">{profileMessage && <p role="status" className="rounded-lg border border-primary/30 px-3 py-2 text-sm text-primary">{profileMessage}</p>}{profileError && <p role="alert" className="rounded-lg border border-destructive/40 px-3 py-2 text-sm text-destructive">{profileError}</p>}</div>}

        <Card className="border-destructive/30 bg-destructive/5"><CardHeader><CardTitle className="text-base text-destructive">Zona de perigo</CardTitle></CardHeader><CardContent className="space-y-3"><p className="text-xs leading-5 text-muted-foreground">Esta ação exclui permanentemente sua conta e os dados pessoais associados, incluindo perfil, clientes, projetos, cargas e presets, produtos e serviços personalizados, preferências de fornecedores, cotações compartilhadas e arquivos da empresa. Pedidos já enviados podem permanecer no sistema sem vínculo com sua conta. A exclusão não pode ser desfeita.</p>{!deleteAccountOpen ? <Button type="button" variant="destructive" size="sm" onClick={() => setDeleteAccountOpen(true)}><Trash2 className="h-4 w-4" />Excluir minha conta</Button> : <div className="max-w-xl space-y-2"><Label htmlFor="deleteConfirmText">Digite <span className="font-semibold">EXCLUIR</span> para confirmar</Label><Input id="deleteConfirmText" value={deleteConfirmText} onChange={(event) => setDeleteConfirmText(event.target.value)} placeholder="EXCLUIR" />{deleteAccountError && <p role="alert" className="text-xs text-destructive">{deleteAccountError}</p>}<div className="flex gap-2"><Button type="button" variant="ghost" size="sm" onClick={() => { setDeleteAccountOpen(false); setDeleteConfirmText(''); setDeleteAccountError(null); }}>Cancelar</Button><Button type="button" variant="destructive" size="sm" disabled={deleteConfirmText !== 'EXCLUIR' || deletingAccount} onClick={deleteAccount}>{deletingAccount ? 'Excluindo...' : 'Confirmar exclusão definitiva'}</Button></div></div>}</CardContent></Card>
      </form>
    </div>
  );
}
