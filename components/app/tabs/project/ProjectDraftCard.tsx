'use client';

import { Plus, Save, Users, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Client, ProjectInfo, ProjectServiceLine, UserServiceItem } from '@/lib/types';
import { formatCurrencyBRL } from '../../helpers';

function ProjectField({
  label,
  id,
  children,
}: {
  label: string;
  id: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

export function ProjectDraftCard({
  projectInfo,
  clients,
  isNew,
  setProjectInfo,
  onManageClients,
  onSave,
  onCancel,
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
  setProjectInfo: (partial: Partial<ProjectInfo>) => void;
  onManageClients: () => void;
  onSave: () => void;
  onCancel: () => void;
  nameError: boolean;
  userServices: UserServiceItem[];
  services: ProjectServiceLine[];
  onAddService: (serviceId: string) => void;
  onRemoveService: (serviceId: string) => void;
  onUpdateServiceQty: (serviceId: string, qty: number) => void;
}) {
  return (
    <Card className="border-primary/40 bg-primary/5 sm:col-span-2">
      <CardHeader>
        <CardTitle className="text-base">{isNew ? 'Novo projeto' : 'Editando projeto'}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2">
        <ProjectField label="Nome do projeto" id="projectName">
          <Input
            id="projectName"
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
          <Label htmlFor="clientId">Cliente</Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <select
              id="clientId"
              className="flex h-10 min-w-0 flex-1 rounded-lg border border-input bg-background px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:h-9 md:px-2.5 md:text-sm"
              value={projectInfo.clientId ?? ''}
              onChange={(event) => setProjectInfo({ clientId: event.target.value || null })}
            >
              <option value="">Sem cliente selecionado</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </select>
            <Button type="button" variant="outline" className="shrink-0" onClick={onManageClients}>
              <Users className="h-4 w-4" />
              Gerenciar clientes
            </Button>
          </div>
        </div>
        <ProjectField label="Endereço" id="clientAddress">
          <Input
            id="clientAddress"
            value={projectInfo.address}
            onChange={(event) => setProjectInfo({ address: event.target.value })}
            placeholder="Endereço da instalação"
          />
        </ProjectField>
        <div className="md:col-span-2">
          <ProjectField label="Observações" id="projectNotes">
            <textarea
              id="projectNotes"
              className="min-h-24 w-full rounded-lg border border-input bg-background px-3 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:px-2.5 md:text-sm"
              value={projectInfo.notes}
              onChange={(event) => setProjectInfo({ notes: event.target.value })}
              placeholder="Informações comerciais, restrições da instalação ou preferências do cliente."
            />
          </ProjectField>
        </div>
        <div className="space-y-1.5 md:col-span-2">
          <Label>Serviços</Label>
          {userServices.length === 0 ? (
            <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
              Cadastre serviços (instalação, frete...) em Meu Catálogo para adicioná-los ao projeto.
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
          <Button type="button" variant="outline" onClick={onCancel}>
            <X className="h-4 w-4" />
            Fechar
          </Button>
          <Button type="button" onClick={onSave}>
            <Save className="h-4 w-4" />
            Salvar projeto
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
