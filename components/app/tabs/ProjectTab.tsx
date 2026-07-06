'use client';

import { useState } from 'react';
import { Calculator, FilePlus2, FolderOpen, Save, Users } from 'lucide-react';
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
  onOpen,
  onOpenSizing,
  onRemove,
  onManageClients,
}: {
  projectInfo: ProjectInfo;
  projectDetailsVisible: boolean;
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
            <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium">Novo projeto</p>
                <p className="text-sm text-muted-foreground">Comece um projeto do zero, limpando os dados atuais.</p>
              </div>
              <Button variant="outline" onClick={onNew}>
                <FilePlus2 className="h-4 w-4" />
                Novo projeto
              </Button>
            </CardContent>
          </Card>

          {projectDetailsVisible && (
            <Card>
              <CardHeader>
                <CardTitle>Dados do projeto</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <ProjectField label="Nome do projeto" id="projectName">
                  <Input
                    id="projectName"
                    value={projectInfo.name}
                    onChange={(event) => setProjectInfo({ name: event.target.value })}
                    placeholder="Ex: Residência Silva"
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
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Projetos salvos</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {initialLoading ? (
                <ProjectListSkeleton />
              ) : savedProjects.length === 0 ? (
                <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                  Nenhum projeto salvo ainda. Preencha os dados, configure o dimensionamento e clique em salvar.
                </div>
              ) : (
                <>
                  <div className="max-w-xs">
                    <SearchInput value={search} onChange={setSearch} placeholder="Pesquisar projeto..." />
                  </div>
                  {filteredProjects.length === 0 ? (
                    <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                      Nenhum projeto encontrado para essa pesquisa.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {filteredProjects.map((project) => (
                        <div
                          key={project.id}
                          className="flex flex-col gap-3 rounded-lg border bg-background p-3 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div className="min-w-0">
                            <p className="font-medium">{project.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {clients.find((client) => client.id === project.clientId)?.name ||
                                'Cliente não informado'}{' '}
                              · Atualizado em{' '}
                              {new Intl.DateTimeFormat('pt-BR', {
                                dateStyle: 'short',
                                timeStyle: 'short',
                              }).format(new Date(project.updatedAt))}
                            </p>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              <Badge variant="outline">
                                {project.residentialOptions.topology
                                  ? topologyLabels[project.residentialOptions.topology]
                                  : 'Sem topologia'}
                              </Badge>
                              <Badge variant="outline">
                                {project.residentialOptions.batteryModel || 'Sem bateria'}
                              </Badge>
                              <Badge variant="outline">
                                {project.residentialOptions.gridType
                                  ? gridLabels[project.residentialOptions.gridType]
                                  : 'Sem rede'}
                              </Badge>
                              <Badge variant="outline">{project.residentialOptions.loads.length} carga(s)</Badge>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Button variant="outline" onClick={() => onOpen(project.id)}>
                              <FolderOpen className="h-4 w-4" />
                              Abrir
                            </Button>
                            <Button variant="outline" onClick={() => onOpenSizing(project.id)}>
                              <Calculator className="h-4 w-4" />
                              Dimensionamento
                            </Button>
                            <ConfirmDeleteButton
                              ariaLabel={`Remover projeto ${project.name}`}
                              title="Remover projeto?"
                              description="O projeto salvo e sua configuração serão removidos deste navegador."
                              confirmLabel="Remover"
                              onConfirm={() => onRemove(project.id)}
                            />
                          </div>
                        </div>
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
