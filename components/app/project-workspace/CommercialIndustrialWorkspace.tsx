'use client';

// C&I workspace — docs/CI-MODULE-PLAN.md Fase 6 "fatia estreita" grown by one
// section: identification (Visão geral) plus the BESS product/sizing panel
// (section 8.1 item 2). The load curve/tariff/estratégia/resultados panels
// are still separate, larger pieces of Fase 6 to come; this only wires the
// already-built C&I store slice (lib/store/slices/commercial-industrial-slice.ts)
// to something visible. Reuses ProjectWorkspaceShell and ProjectInfoEditor
// from the residential workspace — both are generic (ProjectInfo/Client
// only), nothing here touches SavedProject or residential state.

import { useState } from 'react';
import { BatteryCharging, ClipboardList, Layers3 } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import type { Client, ProjectInfo } from '@/lib/types';
import type { CommercialIndustrialOptions } from '@/supabase/functions/_shared/commercial-industrial/types';
import { CiConfigurationPanel } from './ci/CiConfigurationPanel';
import { ProjectInfoEditor } from './ProjectInfoEditor';
import { ProjectWorkspaceShell, type WorkspaceNavItem } from './ProjectWorkspaceShell';
import type { AutosaveStatus } from '../hooks/useAutosave';

type CiWorkspaceSection = 'overview' | 'bess';

const navigation: WorkspaceNavItem[] = [
  { id: 'overview', label: 'Visão geral', icon: ClipboardList },
  { id: 'bess', label: 'Configuração BESS', icon: BatteryCharging },
];

export function CommercialIndustrialWorkspace({
  projectInfo,
  clients,
  onUpdateProjectInfo,
  onSaveProject,
  onBackToProjects,
  ciOptions,
  onUpdateCiOptions,
  autosaveStatus,
  autosaveLastSavedAt,
}: {
  projectInfo: ProjectInfo;
  clients: Client[];
  onUpdateProjectInfo: (partial: Partial<ProjectInfo>) => void;
  onSaveProject: () => void;
  onBackToProjects: () => void;
  ciOptions: CommercialIndustrialOptions;
  onUpdateCiOptions: (partial: Partial<CommercialIndustrialOptions>) => void;
  autosaveStatus: AutosaveStatus;
  autosaveLastSavedAt: Date | null;
}) {
  const [section, setSectionState] = useState<CiWorkspaceSection>('overview');

  return (
    <ProjectWorkspaceShell
      title={projectInfo.name || 'Projeto C&I sem nome'}
      autosaveStatus={autosaveStatus}
      autosaveLastSavedAt={autosaveLastSavedAt}
      navigation={navigation}
      activeSection={section}
      onSectionChange={(id) => setSectionState(id as CiWorkspaceSection)}
      subtitle={<p className="text-sm text-muted-foreground">Projeto Comercial &amp; Industrial (BESS)</p>}
    >
      {section === 'overview' ? (
        <>
          <ProjectInfoEditor
            projectInfo={projectInfo}
            clients={clients}
            onChange={onUpdateProjectInfo}
            onSave={onSaveProject}
            onCancel={onBackToProjects}
          />

          <Card className="border-0 ring-0">
            <CardHeader className="flex flex-row items-center gap-3 pb-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Layers3 className="h-4 w-4" aria-hidden="true" />
              </span>
              <div>
                <h2 className="text-base font-semibold">Em breve</h2>
                <p className="text-xs text-muted-foreground">Curva de carga, tarifa, estratégia e resultados de simulação</p>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <p className="text-sm text-muted-foreground">
                As próximas seções deste workspace vão permitir importar a curva de carga, configurar a tarifa,
                escolher a estratégia de despacho e ver os resultados da simulação de dimensionamento.
              </p>
            </CardContent>
          </Card>
        </>
      ) : (
        <Card className="border-0 ring-0">
          <CardContent className="pt-6">
            <CiConfigurationPanel ciOptions={ciOptions} onChange={onUpdateCiOptions} />
          </CardContent>
        </Card>
      )}
    </ProjectWorkspaceShell>
  );
}
