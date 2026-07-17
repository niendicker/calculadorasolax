'use client';

import { useState } from 'react';
import { Calculator, FolderOpen, Plus, Save, Users, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDeleteButton } from '@/components/ui/confirm-delete-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import type { BatteryTopology, Client, ProjectInfo, ResidentialGridType, SavedProject } from '@/lib/types';
import { Metric, ProjectListSkeleton, Requirement, SearchInput } from '../shared-ui';
import { gridLabels, topologyLabels } from '../types';

export function ProjectTab({
  projectInfo,
  projectDetailsVisible,
  currentProjectId,
  savedProjects,
  clients,
  initialLoading,
  projectStatus,
  topology,
  batteryModel,
  gridType,
  loadsCount,
  peakW,
  dailyKwh,
  hasSolution,
  setProjectInfo,
  onSave,
  onNew,
  onCancelNew,
  onOpen,
  onOpenSizing,
  onRemove,
  onManageClients,
}: {
  projectInfo: ProjectInfo;
  projectDetailsVisible: boolean;
  currentProjectId: string | null;
  savedProjects: SavedProject[];
  clients: Client[];
  initialLoading: boolean;
  projectStatus: string | null;
  topology: BatteryTopology | null;
  batteryModel: string | null;
  gridType: ResidentialGridType | null;
  loadsCount: number;
  peakW: number;
  dailyKwh: number;
  hasSolution: boolean;
  setProjectInfo: (partial: Partial<ProjectInfo>) => void;
  onSave: () => void;
  onNew: () => void;
  onCancelNew: () => void;
  onOpen: (id: string) => void;
  onOpenSizing: (id: string) => void;
  onRemove: (id: string) => void;
  onManageClients: () => void;
}) {
  const [search, setSearch] = useState('');

  const normalizedSearch = search.trim().toLowerCase();
  const filteredProjects = savedProjects.filter((project) => {
    const clientName = clients.find((client) => client.id === project.clientId)?.name ?? '';
    return (
      project.name.toLowerCase().includes(normalizedSearch) || clientName.toLowerCase().includes(normalizedSearch)
    );
  });

  return (
    <div className="space-y-4">
      <div className="sticky top-0 z-20 -mx-4 flex flex-col gap-3 border-b bg-background/95 px-4 py-3 backdrop-blur lg:-mx-6 lg:flex-row lg:items-end lg:justify-between lg:px-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Projeto</h1>
          <p className="text-sm text-muted-foreground">
            Escolha um cliente cadastrado e salve a configuração para reutilizar depois.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={onSave}>
            <Save className="h-4 w-4" />
            Salvar projeto
          </Button>
        </div>
      </div>

      {projectStatus && (
        <p role="status" className="rounded-lg border border-primary/30 px-3 py-2 text-sm text-primary">
          {projectStatus}
        </p>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle>Projetos salvos</CardTitle>
              {!projectDetailsVisible && (
                <Button variant="outline" size="sm" onClick={onNew}>
                  <Plus className="h-4 w-4" />
                  Novo projeto
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              {initialLoading ? (
                <ProjectListSkeleton />
              ) : (
                <>
                  {savedProjects.length > 0 && (
                    <div className="max-w-xs">
                      <SearchInput value={search} onChange={setSearch} placeholder="Pesquisar projeto..." />
                    </div>
                  )}

                  {!projectDetailsVisible && savedProjects.length === 0 ? (
                    <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                      Nenhum projeto salvo ainda. Clique em &quot;Novo projeto&quot; para começar.
                    </div>
                  ) : !projectDetailsVisible && filteredProjects.length === 0 ? (
                    <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                      Nenhum projeto encontrado para essa pesquisa.
                    </div>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {projectDetailsVisible && (
                        <ProjectDraftCard
                          projectInfo={projectInfo}
                          clients={clients}
                          isNew={!currentProjectId}
                          setProjectInfo={setProjectInfo}
                          onManageClients={onManageClients}
                          onSave={onSave}
                          onCancel={onCancelNew}
                        />
                      )}
                      {filteredProjects
                        .filter((project) => project.id !== currentProjectId)
                        .map((project) => (
                          <ProjectCard
                            key={project.id}
                            project={project}
                            clientName={clients.find((client) => client.id === project.clientId)?.name}
                            onOpen={() => onOpen(project.id)}
                            onOpenSizing={() => onOpenSizing(project.id)}
                            onRemove={() => onRemove(project.id)}
                          />
                        ))}
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="xl:sticky xl:top-5 xl:self-start">
          <CardHeader>
            <CardTitle>Configuração salva junto</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Metric label="Pico" value={`${(peakW / 1000).toFixed(2)} kVA`} />
              <Metric label="Consumo" value={`${dailyKwh.toFixed(2)} kWh/dia`} />
            </div>
            <Separator />
            <ul className="space-y-2 text-sm">
              <Requirement done={Boolean(topology)} label={topology ? topologyLabels[topology] : 'Topologia da bateria'} />
              <Requirement done={Boolean(batteryModel)} label={batteryModel || 'Modelo da bateria'} />
              <Requirement done={Boolean(gridType)} label={gridType ? gridLabels[gridType] : 'Tipo de rede'} />
              <Requirement done={loadsCount > 0} label={`${loadsCount} carga(s) cadastrada(s)`} />
              <Requirement done={hasSolution} label={hasSolution ? 'Solução calculada' : 'Solução ainda não calculada'} />
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

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

function ProjectDraftCard({
  projectInfo,
  clients,
  isNew,
  setProjectInfo,
  onManageClients,
  onSave,
  onCancel,
}: {
  projectInfo: ProjectInfo;
  clients: Client[];
  isNew: boolean;
  setProjectInfo: (partial: Partial<ProjectInfo>) => void;
  onManageClients: () => void;
  onSave: () => void;
  onCancel: () => void;
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
          />
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
        <div className="flex justify-end gap-2 md:col-span-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            <X className="h-4 w-4" />
            Cancelar
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

function ProjectCard({
  project,
  clientName,
  onOpen,
  onOpenSizing,
  onRemove,
}: {
  project: SavedProject;
  clientName: string | undefined;
  onOpen: () => void;
  onOpenSizing: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="relative flex h-full flex-col gap-3 rounded-lg border bg-card p-4">
      <div className="absolute right-2 top-2">
        <ConfirmDeleteButton
          ariaLabel={`Remover projeto ${project.name}`}
          title="Remover projeto?"
          description="O projeto salvo e sua configuração serão removidos deste navegador."
          confirmLabel="Remover"
          onConfirm={onRemove}
        />
      </div>
      <div className="min-w-0 pr-8">
        <p className="font-medium">{project.name}</p>
        <p className="text-xs text-muted-foreground">
          {clientName || 'Cliente não informado'} · Atualizado em{' '}
          {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(
            new Date(project.updatedAt)
          )}
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Badge variant="outline">
            {project.residentialOptions.topology
              ? topologyLabels[project.residentialOptions.topology]
              : 'Sem topologia'}
          </Badge>
          <Badge variant="outline">{project.residentialOptions.batteryModel || 'Sem bateria'}</Badge>
          <Badge variant="outline">
            {project.residentialOptions.gridType ? gridLabels[project.residentialOptions.gridType] : 'Sem rede'}
          </Badge>
          <Badge variant="outline">{project.residentialOptions.loads.length} carga(s)</Badge>
        </div>
      </div>
      <div className="mt-auto flex gap-2 pt-1">
        <Button variant="outline" size="sm" className="flex-1" onClick={onOpen}>
          <FolderOpen className="h-4 w-4" />
          Abrir
        </Button>
        <Button variant="outline" size="sm" className="flex-1" onClick={onOpenSizing}>
          <Calculator className="h-4 w-4" />
          Dimensionamento
        </Button>
      </div>
    </div>
  );
}
