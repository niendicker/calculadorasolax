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
import { AlertTriangle, BarChart3, BatteryCharging, ClipboardList, LineChart, Receipt, ShieldAlert, SlidersHorizontal, Sun } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import type { Client, ProjectInfo } from '@/lib/types';
import type { CommercialIndustrialOptions, CommercialIndustrialResult } from '@/supabase/functions/_shared/commercial-industrial/types';
import { CiBackupPanel } from './ci/CiBackupPanel';
import { CiConfigurationPanel } from './ci/CiConfigurationPanel';
import { CiLoadCurvePanel } from './ci/CiLoadCurvePanel';
import { CiOverviewPanel } from './ci/CiOverviewPanel';
import { CiResultsPanel } from './ci/CiResultsPanel';
import { CiSolarPanel } from './ci/CiSolarPanel';
import { CiStrategyPanel } from './ci/CiStrategyPanel';
import { CiTariffPanel } from './ci/CiTariffPanel';
import { ProjectWorkspaceShell, type WorkspaceNavItem } from './ProjectWorkspaceShell';
import type { AutosaveStatus } from '../hooks/useAutosave';
import type { InlineProfile } from '../types';

export type CiWorkspaceSection = 'overview' | 'bess' | 'solar' | 'curve' | 'tariff' | 'strategy' | 'backup' | 'results';

const navigation: WorkspaceNavItem[] = [
  { id: 'overview', label: 'Visão geral', icon: ClipboardList },
  { id: 'bess', label: 'Configuração BESS', icon: BatteryCharging },
  { id: 'solar', label: 'Solar FV', icon: Sun },
  { id: 'curve', label: 'Curva de carga', icon: LineChart },
  { id: 'tariff', label: 'Tarifa', icon: Receipt },
  { id: 'strategy', label: 'Estratégia', icon: SlidersHorizontal },
  { id: 'backup', label: 'Falta de rede', icon: ShieldAlert },
  { id: 'results', label: 'Resultados', icon: BarChart3 },
];

function getNavigationWithStatus(ciOptions: CommercialIndustrialOptions, canAccessCiBackup: boolean): WorkspaceNavItem[] {
  const filteredNav = canAccessCiBackup ? navigation : navigation.filter((item) => item.id !== 'backup');
  const bessConfigured =
    ciOptions.bessProductId !== null &&
    (ciOptions.sizing.mode === 'fixed'
      ? ciOptions.sizing.moduleCount !== null
      : ciOptions.sizing.minModules !== null && ciOptions.sizing.maxModules !== null);
  const curveConfigured = ciOptions.loadCurve !== null && ciOptions.loadCurve.points.length > 0;
  const tariffConfigured = ciOptions.tariff !== null;
  const backupConfigured =
    !ciOptions.backup?.enabled ||
    (ciOptions.backup.inputMode === 'detailed'
      ? ciOptions.backup.loads.length > 0
      : ciOptions.backup.targetPowerKw > 0);

  const configuredBySection: Record<string, boolean> = {
    bess: bessConfigured,
    curve: curveConfigured,
    tariff: tariffConfigured,
    backup: backupConfigured,
  };

  return filteredNav.map((item) => {
    if (configuredBySection[item.id] !== false) return item;

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
  const [section, setSectionState] = useState<CiWorkspaceSection>('overview');
  const client = clients.find((item) => item.id === projectInfo.clientId) ?? null;
  const canAccessCiBackup = profile?.role === 'admin' || Boolean(profile?.featureFlags?.includes('ci_backup'));
  const effectiveSection = !canAccessCiBackup && section === 'backup' ? 'overview' : section;
  const workspaceNavigation = getNavigationWithStatus(ciOptions, canAccessCiBackup);

  return (
    <ProjectWorkspaceShell
      title={projectInfo.name || 'Projeto C&I sem nome'}
      autosaveStatus={autosaveStatus}
      autosaveLastSavedAt={autosaveLastSavedAt}
      navigation={workspaceNavigation}
      activeSection={effectiveSection}
      onSectionChange={(id) => setSectionState(id as CiWorkspaceSection)}
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
          calculationResult={calculationResult}
          canAccessCiBackup={canAccessCiBackup}
          onNavigateToSection={setSectionState}
        />
      )}

      {effectiveSection === 'bess' && (
        <Card className="border-0 ring-0">
          <CardContent className="pt-6">
            <CiConfigurationPanel
              ciOptions={ciOptions}
              onChange={onUpdateCiOptions}
              onNavigatePrev={() => setSectionState('overview')}
              onNavigateNext={() => setSectionState('solar')}
            />
          </CardContent>
        </Card>
      )}

      {effectiveSection === 'solar' && (
        <Card className="border-0 ring-0">
          <CardContent className="pt-6">
            <CiSolarPanel
              ciOptions={ciOptions}
              onChange={onUpdateCiOptions}
              onNavigatePrev={() => setSectionState('bess')}
              onNavigateNext={() => setSectionState('curve')}
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
              onNavigatePrev={() => setSectionState('solar')}
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
              onNavigateNext={() => setSectionState(canAccessCiBackup ? 'backup' : 'results')}
            />
          </CardContent>
        </Card>
      )}

      {effectiveSection === 'backup' && canAccessCiBackup && (
        <Card className="border-0 ring-0">
          <CardContent className="pt-6">
            <CiBackupPanel
              ciOptions={ciOptions}
              onChange={onUpdateCiOptions}
              onNavigatePrev={() => setSectionState('strategy')}
              onNavigateNext={() => setSectionState('results')}
            />
          </CardContent>
        </Card>
      )}

      {effectiveSection === 'results' && (
        <Card className="border-0 ring-0">
          <CardContent className="pt-6">
            <CiResultsPanel
              projectId={currentCiProjectId}
              projectInfo={projectInfo}
              client={client}
              profile={profile}
              ciOptions={ciOptions}
              onFlushSave={onFlushSave}
              onNavigatePrev={() => setSectionState(canAccessCiBackup ? 'backup' : 'strategy')}
            />
          </CardContent>
        </Card>
      )}
    </ProjectWorkspaceShell>
  );
}
