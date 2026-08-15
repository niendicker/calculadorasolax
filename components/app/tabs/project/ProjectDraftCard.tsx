'use client';

import { useState } from 'react';
import { Calculator, FileText, MapPin, Plus, Save, StickyNote, User, UserPlus, Users, Wrench, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDeleteButton } from '@/components/ui/confirm-delete-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import type { Client, ProjectInfo, ProjectServiceLine, UserServiceItem } from '@/lib/types';
import { AddressFields } from '../../address-fields';
import { formatCurrencyBRL } from '../../helpers';
import { QuickAddClientModal } from './QuickAddClientModal';

/** Small muted label + a left-aligned icon inside the field, same treatment
 * as the login form (see AuthPanel's FieldIcon) — the plain <Label> default
 * (text-sm font-medium) reads as too heavy for a form this dense with
 * fields, and this section had no icons at all unlike the rest of the app. */
function ProjectField({
  label,
  id,
  icon,
  children,
}: {
  label: string;
  id: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {label}
      </Label>
      <div className="relative">
        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground">
          {icon}
        </span>
        {children}
      </div>
    </div>
  );
}

/** Section label for a field group that isn't a single input (address block,
 * services picker) — same de-emphasized treatment as ProjectField's label,
 * with the icon inline instead of overlaid (there's no single field to
 * overlay it on). */
function SectionLabel({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Label className="gap-1.5 text-xs font-medium text-muted-foreground">
      {icon}
      {children}
    </Label>
  );
}

export function ProjectDraftCard({
  projectInfo,
  clients,
  isNew,
  isDirty,
  setProjectInfo,
  onManageClients,
  onAddClient,
  onSave,
  onCancel,
  onOpenSizing,
  nameError,
  userServices,
  services,
  onAddService,
  onRemoveService,
  onUpdateServiceQty,
}: {
  projectInfo: ProjectInfo;
  clients: Client[];
  isNew: boolean;
  /** Whether the draft differs from its starting point (blank for a new
   *  project, last-saved values for one being edited) — gates a discard
   *  confirmation on "Fechar" so a misclick can't silently lose input. */
  isDirty: boolean;
  setProjectInfo: (partial: Partial<ProjectInfo>) => void;
  onManageClients: () => void;
  onAddClient: (input: { name: string; email: string; phone: string; document: string; notes: string }) => Promise<Client>;
  onSave: () => void;
  onCancel: () => void;
  /** Jumps straight to Dimensionamento for this project — only offered once
   *  it's actually saved (isNew: false), since a brand-new draft has no id
   *  yet for the sizing tab to load. */
  onOpenSizing?: () => void;
  nameError: boolean;
  userServices: UserServiceItem[];
  services: ProjectServiceLine[];
  onAddService: (serviceId: string) => void;
  onRemoveService: (serviceId: string) => void;
  onUpdateServiceQty: (serviceId: string, qty: number) => void;
}) {
  const [quickAddOpen, setQuickAddOpen] = useState(false);

  return (
    <Card className="sm:col-span-2">
      <CardHeader>
        <CardTitle className="text-base">{isNew ? 'Novo projeto' : 'Editando projeto'}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2">
        <ProjectField label="Nome do projeto" id="projectName" icon={<FileText className="h-4 w-4" />}>
          <Input
            id="projectName"
            className="pl-8 md:pl-8"
            value={projectInfo.name}
            onChange={(event) => setProjectInfo({ name: event.target.value })}
            placeholder="Ex: Residência Silva"
            autoFocus
            aria-invalid={nameError}
            aria-describedby={nameError ? 'projectName-error' : undefined}
          />
          {nameError && (
            <p id="projectName-error" role="alert" className="text-sm text-destructive">
              Informe um nome para o projeto.
            </p>
          )}
        </ProjectField>
        <div className="space-y-1.5">
          <Label htmlFor="clientId" className="text-xs font-medium text-muted-foreground">
            Cliente
          </Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <User className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Select
                id="clientId"
                className="md:h-9 pl-8 md:pl-8"
                value={projectInfo.clientId ?? ''}
                onChange={(event) => setProjectInfo({ clientId: event.target.value || null })}
              >
                <option value="">Sem cliente selecionado</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </Select>
            </div>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="shrink-0"
              aria-label="Novo cliente"
              onClick={() => setQuickAddOpen(true)}
            >
              <UserPlus className="h-4 w-4" />
            </Button>
            <Button type="button" variant="outline" className="shrink-0" onClick={onManageClients}>
              <Users className="h-4 w-4" />
              Gerenciar clientes
            </Button>
          </div>
        </div>
        <div className="md:col-span-2">
          <SectionLabel icon={<MapPin className="h-4 w-4" />}>Endereço da instalação</SectionLabel>
          <div className="mt-1.5">
            <AddressFields
              address={projectInfo.address}
              onChange={(partial) => setProjectInfo({ address: { ...projectInfo.address, ...partial } })}
              idPrefix="projectAddress"
            />
          </div>
        </div>
        <div className="md:col-span-2 space-y-1.5">
          <Label htmlFor="projectNotes" className="text-xs font-medium text-muted-foreground">
            Observações
          </Label>
          {/* Icon sits at the top instead of vertically centered (ProjectField's
           * default) — a tall textarea would otherwise leave it floating in
           * empty space next to blank lines. */}
          <div className="relative">
            <StickyNote className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <textarea
              id="projectNotes"
              className="min-h-24 w-full rounded-lg border border-input bg-background py-2 pl-8 pr-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:pl-8 md:pr-2.5 md:text-sm"
              value={projectInfo.notes}
              onChange={(event) => setProjectInfo({ notes: event.target.value })}
              placeholder="Informações comerciais, restrições da instalação ou preferências do cliente."
            />
          </div>
        </div>
        <div className="space-y-1.5 md:col-span-2">
          <SectionLabel icon={<Wrench className="h-4 w-4" />}>Serviços</SectionLabel>
          {userServices.length === 0 ? (
            <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
              Cadastre serviços (instalação, frete...) em Portfólio para adicioná-los ao projeto.
            </p>
          ) : (
            <div className="space-y-2">
              {services.length > 0 && (
                <div className="space-y-1.5">
                  {services.map((line) => (
                    <div key={line.serviceId} className="flex items-center gap-2 rounded-md border bg-background px-2 py-1.5 text-sm">
                      <span className="min-w-0 flex-1 truncate">{line.name}</span>
                      <Input
                        type="number"
                        min={1}
                        value={line.qty}
                        aria-label={`Quantidade de ${line.name}`}
                        onChange={(event) => onUpdateServiceQty(line.serviceId, Number(event.target.value) || 1)}
                        className="h-8 w-16 text-xs"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Remover serviço ${line.name}`}
                        onClick={() => onRemoveService(line.serviceId)}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap gap-1.5">
                {userServices
                  .filter((service) => !services.some((line) => line.serviceId === service.id))
                  .map((service) => (
                    <button
                      key={service.id}
                      type="button"
                      onClick={() => onAddService(service.id)}
                      className="flex items-center gap-1 rounded-full border border-dashed px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/10 hover:text-foreground"
                    >
                      <Plus className="h-3 w-3" />
                      {service.name} · {formatCurrencyBRL(service.unitValue)}
                    </button>
                  ))}
              </div>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 md:col-span-2">
          {isDirty ? (
            <ConfirmDeleteButton
              ariaLabel="Descartar alterações do projeto"
              label="Fechar"
              icon={<X className="h-4 w-4" />}
              title="Descartar alterações?"
              description="Os dados preenchidos neste projeto serão perdidos."
              confirmLabel="Descartar"
              triggerVariant="outline"
              onConfirm={onCancel}
            />
          ) : (
            <Button type="button" variant="outline" onClick={onCancel}>
              <X className="h-4 w-4" />
              Fechar
            </Button>
          )}
          {!isNew && onOpenSizing && (
            <Button type="button" variant="outline" onClick={onOpenSizing}>
              <Calculator className="h-4 w-4" />
              Dimensionamento
            </Button>
          )}
          <Button type="button" onClick={onSave}>
            <Save className="h-4 w-4" />
            Salvar projeto
          </Button>
        </div>
      </CardContent>

      <QuickAddClientModal
        open={quickAddOpen}
        onClose={() => setQuickAddOpen(false)}
        onAdd={onAddClient}
        onCreated={(client) => {
          setProjectInfo({ clientId: client.id });
          setQuickAddOpen(false);
        }}
      />
    </Card>
  );
}
