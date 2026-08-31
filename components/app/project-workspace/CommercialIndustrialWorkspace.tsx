'use client';

// C&I workspace — docs/CI-MODULE-PLAN.md Fase 6 "fatia estreita" grown into
// the full set of section 8.1 panels: identification (Visão geral), BESS
// product/sizing (item 2), load curve (item 3), tariff (item 4), strategy
// (item 5) and results (item 7 — item 6 "Dimensionamento" lives inside the
// BESS panel, plan section 4.3's own framing of quantity as part of product
// configuration). Memorial (item 8, the PDF) is the one piece of Fase 6 left.
// This only wires the already-built C&I store slice
// (lib/store/slices/commercial-industrial-slice.ts) to something visible.
// Reuses ProjectWorkspaceShell and ProjectInfoEditor from the residential
// workspace — both are generic (ProjectInfo/Client only), nothing here
// touches SavedProject or residential state.

import { useState } from 'react';
import { BarChart3, BatteryCharging, ClipboardList, LineChart, Receipt, SlidersHorizontal } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import type { Client, ProjectInfo } from '@/lib/types';
import type { CommercialIndustrialOptions, CommercialIndustrialResult } from '@/supabase/functions/_shared/commercial-industrial/types';
import { CiConfigurationPanel } from './ci/CiConfigurationPanel';
import { CiLoadCurvePanel } from './ci/CiLoadCurvePanel';
import { CiOverviewPanel } from './ci/CiOverviewPanel';
import { CiResultsPanel } from './ci/CiResultsPanel';
import { CiStrategyPanel } from './ci/CiStrategyPanel';
import { CiTariffPanel } from './ci/CiTariffPanel';
import { ProjectInfoEditor } from './ProjectInfoEditor';
import { ProjectWorkspaceShell, type WorkspaceNavItem } from './ProjectWorkspaceShell';
import type { AutosaveStatus } from '../hooks/useAutosave';
import type { InlineProfile } from '../types';

export type CiWorkspaceSection = 'overview' | 'bess' | 'curve' | 'tariff' | 'strategy' | 'results';

const navigation: WorkspaceNavItem[] = [
  { id: 'overview', label: 'Visão geral', icon: ClipboardList },
  { id: 'bess', label: 'Configuração BESS', icon: BatteryCharging },
  { id: 'curve', label: 'Curva de carga', icon: LineChart },
  { id: 'tariff', label: 'Tarifa', icon: Receipt },
  { id: 'strategy', label: 'Estratégia', icon: SlidersHorizontal },
  { id: 'results', label: 'Resultados', icon: BarChart3 },
];

export function CommercialIndustrialWorkspace({
  projectInfo,
  clients,
  profile,
  onUpdateProjectInfo,
  onSaveProject,
  onBackToProjects,
  ciOptions,
  onUpdateCiOptions,
  currentCiProjectId,
  calculationResult,
  autosaveStatus,
  autosaveLastSavedAt,
}: {
  projectInfo: ProjectInfo;
  clients: Client[];
  profile: InlineProfile | null;
  onUpdateProjectInfo: (partial: Partial<ProjectInfo>) => void;
  onSaveProject: () => void;
  onBackToProjects: () => void;
  ciOptions: CommercialIndustrialOptions;
  onUpdateCiOptions: (partial: Partial<CommercialIndustrialOptions>) => void;
  currentCiProjectId: string | null;
  calculationResult: CommercialIndustrialResult | null;
  autosaveStatus: AutosaveStatus;
  autosaveLastSavedAt: Date | null;
}) {
  const [section, setSectionState] = useState<CiWorkspaceSection>('overview');
  const client = clients.find((item) => item.id === projectInfo.clientId) ?? null;

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
      {section === 'overview' && (
        <div className="space-y-6">
          <ProjectInfoEditor
            projectInfo={projectInfo}
            clients={clients}
            onChange={onUpdateProjectInfo}
            onSave={onSaveProject}
            onCancel={onBackToProjects}
          />
          <CiOverviewPanel ciOptions={ciOptions} calculationResult={calculationResult} onNavigateToSection={setSectionState} />
        </div>
      )}

      {section === 'bess' && (
        <Card className="border-0 ring-0">
          <CardContent className="pt-6">
            <CiConfigurationPanel ciOptions={ciOptions} onChange={onUpdateCiOptions} />
          </CardContent>
        </Card>
      )}

      {section === 'curve' && (
        <Card className="border-0 ring-0">
          <CardContent className="pt-6">
            <CiLoadCurvePanel ciOptions={ciOptions} onChange={onUpdateCiOptions} />
          </CardContent>
        </Card>
      )}

      {section === 'tariff' && (
        <Card className="border-0 ring-0">
          <CardContent className="pt-6">
            <CiTariffPanel ciOptions={ciOptions} onChange={onUpdateCiOptions} />
          </CardContent>
        </Card>
      )}

      {section === 'strategy' && (
        <Card className="border-0 ring-0">
          <CardContent className="pt-6">
            <CiStrategyPanel ciOptions={ciOptions} onChange={onUpdateCiOptions} />
          </CardContent>
        </Card>
      )}

      {section === 'results' && (
        <Card className="border-0 ring-0">
          <CardContent className="pt-6">
            <CiResultsPanel
              projectId={currentCiProjectId}
              projectInfo={projectInfo}
              client={client}
              profile={profile}
              ciOptions={ciOptions}
            />
          </CardContent>
        </Card>
      )}
    </ProjectWorkspaceShell>
  );
}
