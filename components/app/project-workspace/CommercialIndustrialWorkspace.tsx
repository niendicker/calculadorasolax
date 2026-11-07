'use client';

// C&I workspace — docs/CI-MODULE-PLAN.md Fase 6 "fatia estreita" grown into
// the full set of section 8.1 panels: identification (Visão geral), BESS
// product/sizing (item 2), load curve (item 3), tariff (item 4), strategy
// (item 5) and results (item 7 — item 6 "Dimensionamento" lives inside the
// BESS panel, plan section 4.3's own framing of quantity as part of product
// configuration). Memorial (item 8, the PDF) is the one piece of Fase 6 left.
// This only wires the already-built C&I store slice
// (lib/store/slices/commercial-industrial-slice.ts) to something visible.
// Reuses ProjectWorkspaceShell from the residential workspace (generic,
// ProjectInfo/Client only); "Visão geral" itself lives in
// ./ci/CiOverviewPanel.tsx, which in turn reuses ProjectInfoEditor and
// ProjectInfoModal — nothing here touches SavedProject or residential state.

import { useState } from 'react';
import { getCiConfigurationStatus } from './ci/ci-configuration-status';
import { AlertTriangle, BarChart3, BatteryCharging, ClipboardList, LineChart, Receipt, SlidersHorizontal } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import type { Client, ProjectInfo } from '@/lib/types';
import type { CommercialIndustrialOptions, CommercialIndustrialResult } from '@/supabase/functions/_shared/commercial-industrial/types';
import type { CiApplication } from './ci/CiApplicationModal';
import { CiConfigurationPanel } from './ci/CiConfigurationPanel';
import { CiLoadCurvePanel } from './ci/CiLoadCurvePanel';
import { CiOverviewPanel } from './ci/CiOverviewPanel';
import { CiResultsPanel, type CiCalculationSnapshot } from './ci/CiResultsPanel';
import { CiStrategyPanel } from './ci/CiStrategyPanel';
import { CiTariffPanel } from './ci/CiTariffPanel';
import { ProjectWorkspaceShell, type WorkspaceNavItem } from './ProjectWorkspaceShell';
import type { AutosaveStatus } from '../hooks/useAutosave';
import type { InlineProfile } from '../types';

export type CiWorkspaceSection = 'overview' | 'bess' | 'solar' | 'curve' | 'tariff' | 'strategy' | 'backup' | 'results';

const navigation: WorkspaceNavItem[] = [
  { id: 'overview', label: 'Visão geral', icon: ClipboardList },
  { id: 'bess', label: 'Configuração BESS', icon: BatteryCharging },
  { id: 'curve', label: 'Curvas e aplicações', icon: LineChart },
  { id: 'tariff', label: 'Tarifa', icon: Receipt },
  { id: 'strategy', label: 'Estratégia', icon: SlidersHorizontal },
  { id: 'results', label: 'Resultados', icon: BarChart3 },
];

function getNavigationWithStatus(ciOptions: CommercialIndustrialOptions, canAccessCiBackup: boolean): WorkspaceNavItem[] {
  const filteredNav = navigation;
  const configuredBySection: Record<string, boolean> = getCiConfigurationStatus(ciOptions);

  return filteredNav.map((item) => {
    const configured=item.id==='curve'?configuredBySection.curve&&configuredBySection.solar&&(!canAccessCiBackup||configuredBySection.backup):configuredBySection[item.id];
    if (configured !== false) return item;

    return {
      ...item,
      notification: {
        label: 'Pendente',
        ariaLabel: `Faltam valores na aba ${item.label}`,
        icon: AlertTriangle,
      },
    };
  });
}

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
  onFlushSave,
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
  /** Persists the live ciOptions immediately, bypassing autosave's debounce
   * — see CiResultsPanel.tsx's header comment for why "Calcular" needs it. */
  onFlushSave: () => Promise<unknown>;
  autosaveStatus: AutosaveStatus;
  autosaveLastSavedAt: Date | null;
}) {
  const [curveApplication,setCurveApplication]=useState<CiApplication|null>(null);
  const [section, setSectionState] = useState<CiWorkspaceSection>('overview');
  const [calculation, setCalculation] = useState<{ projectId: string | null; snapshot: CiCalculationSnapshot } | null>(null);
  const snapshot = calculation?.projectId === currentCiProjectId ? calculation.snapshot : null;
  const client = clients.find((item) => item.id === projectInfo.clientId) ?? null;
  const canAccessCiBackup = profile?.role === 'admin' || Boolean(profile?.featureFlags?.includes('ci_backup'));
  const effectiveSection = !canAccessCiBackup && section === 'backup' ? 'overview' : section;
  const navigate=(next:CiWorkspaceSection)=>{
    if(next==='solar'||next==='backup'){setCurveApplication(next==='solar'||canAccessCiBackup?next:null);setSectionState('curve');}
    else {setCurveApplication(null);setSectionState(next);}
  };
  const workspaceNavigation = getNavigationWithStatus(ciOptions, canAccessCiBackup);

  return (
    <ProjectWorkspaceShell
      title={projectInfo.name || 'Projeto C&I sem nome'}
      autosaveStatus={autosaveStatus}
      autosaveLastSavedAt={autosaveLastSavedAt}
      navigation={workspaceNavigation}
      wrapNavigationLabels
      activeSection={effectiveSection}
      onSectionChange={(id) => navigate(id as CiWorkspaceSection)}
      subtitle={<p className="text-sm text-muted-foreground">Projeto Comercial &amp; Industrial (BESS)</p>}
    >
      {effectiveSection === 'overview' && (
        <CiOverviewPanel
          projectInfo={projectInfo}
          clients={clients}
          client={client}
          onUpdateProjectInfo={onUpdateProjectInfo}
          onSaveProject={onSaveProject}
          onBackToProjects={onBackToProjects}
          isSaved={currentCiProjectId !== null}
          ciOptions={ciOptions}
          calculationResult={snapshot?.result ?? calculationResult}
          isResultStale={Boolean(snapshot && snapshot.optionsFingerprint !== JSON.stringify(ciOptions))}
          canAccessCiBackup={canAccessCiBackup}
          onNavigateToSection={navigate}
        />
      )}

      {effectiveSection === 'bess' && (
        <Card className="border-0 ring-0">
          <CardContent className="pt-6">
            <CiConfigurationPanel
              ciOptions={ciOptions}
              onChange={onUpdateCiOptions}
              onNavigatePrev={() => setSectionState('overview')}
              onNavigateNext={() => navigate('curve')}
            />
          </CardContent>
        </Card>
      )}

      {effectiveSection === 'curve' && (
        <Card className="border-0 ring-0">
          <CardContent className="pt-6">
            <CiLoadCurvePanel
              ciOptions={ciOptions}
              onChange={onUpdateCiOptions}
              canAccessCiBackup={canAccessCiBackup}
              initialApplication={curveApplication}
              onApplicationClose={()=>setCurveApplication(null)}
              onNavigatePrev={() => navigate('bess')}
              onNavigateNext={() => setSectionState('tariff')}
            />
          </CardContent>
        </Card>
      )}

      {effectiveSection === 'tariff' && (
        <Card className="border-0 ring-0">
          <CardContent className="pt-6">
            <CiTariffPanel
              ciOptions={ciOptions}
              onChange={onUpdateCiOptions}
              onNavigatePrev={() => setSectionState('curve')}
              onNavigateNext={() => setSectionState('strategy')}
            />
          </CardContent>
        </Card>
      )}

      {effectiveSection === 'strategy' && (
        <Card className="border-0 ring-0">
          <CardContent className="pt-6">
            <CiStrategyPanel
              ciOptions={ciOptions}
              onChange={onUpdateCiOptions}
              onNavigatePrev={() => setSectionState('tariff')}
              nextSectionLabel="Resultados"
              onNavigateNext={() => navigate('results')}
            />
          </CardContent>
        </Card>
      )}

      {effectiveSection === 'results' && (
        <Card className="border-0 ring-0">
          <CardContent className="pt-6">
            <CiResultsPanel
              key={currentCiProjectId}
              projectId={currentCiProjectId}
              initialSnapshot={snapshot}
              onCalculated={(newSnapshot) => setCalculation({ projectId: currentCiProjectId, snapshot: newSnapshot })}
              onNavigateToSection={navigate}
              canAccessCiBackup={canAccessCiBackup}
              projectInfo={projectInfo}
              client={client}
              profile={profile}
              ciOptions={ciOptions}
              onFlushSave={onFlushSave}
              prevSectionLabel="Estratégia"
              onNavigatePrev={() => navigate('strategy')}
            />
          </CardContent>
        </Card>
      )}
    </ProjectWorkspaceShell>
  );
}
