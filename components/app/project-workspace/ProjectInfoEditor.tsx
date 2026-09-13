'use client';

// Generic "edit project identification" form — extracted out of
// ProjectWorkspace.tsx (same reasoning as ProjectWorkspaceShell) because it
// only touches ProjectInfo/Client, nothing residential-specific, so the C&I
// workspace (docs/CI-MODULE-PLAN.md Fase 6) can reuse it as-is instead of
// duplicating the form. Pure extraction: markup and classes are unchanged.

import { ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import type { Client, ProjectInfo } from '@/lib/types';
import { AddressFields } from '../address-fields';

type ProjectInfoEditorProps = {
  projectInfo: ProjectInfo;
  clients: Client[];
  onChange?: (partial: Partial<ProjectInfo>) => void;
  onSave?: () => void;
  onCancel?: () => void;
};

function ProjectInfoFields({ projectInfo, clients, onChange, onSave, onCancel }: ProjectInfoEditorProps) {
  const nameError = !projectInfo.name.trim();

  return (
    <div className="space-y-5">
      <section className="space-y-3" aria-labelledby="project-info-identification-title">
        <div>
          <h3 id="project-info-identification-title" className="text-sm font-semibold">Identificação</h3>
          <p className="mt-1 text-xs text-muted-foreground">Defina como esta instalação será apresentada no projeto.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="workspaceProjectName">Nome do projeto</Label>
            <Input id="workspaceProjectName" value={projectInfo.name} onChange={(event) => onChange?.({ name: event.target.value })} aria-invalid={nameError} />
            {nameError && <p className="text-xs text-destructive" role="alert">Informe um nome para o projeto.</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="workspaceProjectClient">Cliente</Label>
            <Select id="workspaceProjectClient" value={projectInfo.clientId ?? ''} onChange={(event) => onChange?.({ clientId: event.target.value || null })}>
              <option value="">Sem cliente selecionado</option>
              {clients.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </Select>
          </div>
        </div>
      </section>

      <section className="space-y-3 border-t pt-5" aria-labelledby="project-info-address-title">
        <div>
          <h3 id="project-info-address-title" className="text-sm font-semibold">Endereço da instalação</h3>
          <p className="mt-1 text-xs text-muted-foreground">Use o CEP para preencher automaticamente os dados disponíveis.</p>
        </div>
        <AddressFields address={projectInfo.address} onChange={(partial) => onChange?.({ address: { ...projectInfo.address, ...partial } })} idPrefix="workspaceProjectAddress" />
      </section>

      <section className="space-y-1.5 border-t pt-5" aria-labelledby="project-info-notes-title">
        <div>
          <h3 id="project-info-notes-title" className="text-sm font-semibold">Observações</h3>
          <p className="mt-1 text-xs text-muted-foreground">Registre informações comerciais ou restrições da instalação.</p>
        </div>
        <textarea id="workspaceProjectNotes" className="min-h-24 w-full rounded-lg border border-input bg-background px-3 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm" value={projectInfo.notes} onChange={(event) => onChange?.({ notes: event.target.value })} placeholder="Ex.: acesso restrito, preferência do cliente..." />
      </section>

      <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end">
        {onCancel && <Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button>}
        {onSave && <Button type="button" onClick={onSave} disabled={nameError}>Salvar alterações</Button>}
      </div>
    </div>
  );
}

export function ProjectInfoEditor({
  projectInfo,
  clients,
  onChange,
  onSave,
  onCancel,
}: {
  projectInfo: ProjectInfo;
  clients: Client[];
  onChange?: (partial: Partial<ProjectInfo>) => void;
  onSave?: () => void;
  onCancel?: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Editar projeto</h2>
          <p className="text-sm text-muted-foreground">Atualize as informações gerais sem sair do Workspace.</p>
        </div>
        {onCancel && <Button type="button" variant="outline" size="sm" onClick={onCancel}><ChevronLeft className="h-4 w-4" aria-hidden="true" />Voltar para Visão geral</Button>}
      </div>
      <Card>
        <CardContent className="p-5">
          <ProjectInfoFields projectInfo={projectInfo} clients={clients} onChange={onChange} onSave={onSave} onCancel={onCancel} />
        </CardContent>
      </Card>
    </div>
  );
}
