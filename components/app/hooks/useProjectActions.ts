import { useState } from 'react';
import type { useRouter } from 'next/navigation';
import { isLimitError } from '@/lib/limits';
import type { ProjectStatus, SavedProject } from '@/lib/types';
import type { InlineProfile } from '../types';
import { projectStatusLabels } from '../types';

export function useProjectActions({
  profile,
  router,
  locale,
  saveCurrentProject,
  newProjectDraft,
  cancelProjectDraft,
  loadProject,
  removeProject,
  duplicateProject,
  refreshProjectSolution,
  updateProjectStatus,
  setActiveTab,
}: {
  profile: InlineProfile | null;
  router: ReturnType<typeof useRouter>;
  locale: string;
  saveCurrentProject: () => Promise<SavedProject>;
  newProjectDraft: () => void;
  cancelProjectDraft: () => void;
  loadProject: (id: string, options?: { showDetails?: boolean }) => void;
  removeProject: (id: string) => Promise<void>;
  duplicateProject: (id: string) => Promise<SavedProject>;
  refreshProjectSolution: (id: string) => Promise<SavedProject>;
  updateProjectStatus: (id: string, status: ProjectStatus) => Promise<SavedProject>;
  setActiveTab: (tab: 'project' | 'sizing' | 'catalog' | 'clients') => void;
}) {
  const [projectStatus, setProjectStatus] = useState<string | null>(null);
  // Bumped on every new status message (even repeats of the same text) so the
  // popup can key off it and restart its dismiss countdown reliably.
  const [statusId, setStatusId] = useState(0);
  const [refreshingProjectId, setRefreshingProjectId] = useState<string | null>(null);

  function report(message: string | null) {
    setProjectStatus(message);
    setStatusId((id) => id + 1);
  }

  function dismissProjectStatus() {
    setProjectStatus(null);
  }

  async function saveProject() {
    if (!profile) {
      router.push(`/${locale}/login?redirect=/${locale}`);
      return;
    }
    try {
      const project = await saveCurrentProject();
      report(`Projeto "${project.name}" salvo com configuração, rede, bateria e cargas.`);
    } catch (error) {
      report(isLimitError(error) ? error.message : 'Não foi possível salvar o projeto. Tente novamente.');
    }
  }

  function startNewProject() {
    newProjectDraft();
    report(null);
  }

  function cancelNewProject() {
    cancelProjectDraft();
    report(null);
  }

  function openProject(id: string) {
    loadProject(id);
    report('Projeto carregado.');
  }

  function openProjectSizing(id: string) {
    // showDetails: false — jumping to Dimensionamento shouldn't leave the
    // project sitting in edit mode back on the Projeto tab (only "Editar"
    // should do that).
    loadProject(id, { showDetails: false });
    setActiveTab('sizing');
    report('Projeto carregado.');
  }

  async function deleteProject(id: string) {
    try {
      await removeProject(id);
      report('Projeto removido.');
    } catch {
      report('Não foi possível remover o projeto.');
    }
  }

  async function duplicateExistingProject(id: string) {
    try {
      const project = await duplicateProject(id);
      report(`Projeto duplicado como "${project.name}".`);
    } catch (error) {
      report(isLimitError(error) ? error.message : 'Não foi possível duplicar o projeto. Tente novamente.');
    }
  }

  async function refreshSolution(id: string) {
    setRefreshingProjectId(id);
    try {
      await refreshProjectSolution(id);
      report('Solução recalculada.');
    } catch (error) {
      // Internal-only codes (not meant to reach the user as-is) get a
      // friendly message; anything else is already a specific, user-facing
      // message from calculateResidentialSolution or a Supabase error.
      if (error instanceof Error && error.message === 'project_not_found') {
        report('Projeto não encontrado. Atualize a lista e tente novamente.');
      } else if (error instanceof Error && error.message === 'missing_battery_model') {
        report('Este projeto não tem uma bateria selecionada. Abra-o no Dimensionamento antes de recalcular.');
      } else if (error instanceof Error && error.message) {
        report(error.message);
      } else {
        report('Não foi possível recalcular a solução. Tente novamente.');
      }
    } finally {
      setRefreshingProjectId(null);
    }
  }

  async function updateStatus(id: string, status: ProjectStatus) {
    try {
      await updateProjectStatus(id, status);
      report(`Cotação marcada como "${projectStatusLabels[status]}".`);
    } catch {
      report('Não foi possível atualizar o status da cotação. Tente novamente.');
    }
  }

  return {
    projectStatus,
    statusId,
    dismissProjectStatus,
    saveProject,
    startNewProject,
    cancelNewProject,
    openProject,
    openProjectSizing,
    deleteProject,
    duplicateProject: duplicateExistingProject,
    refreshProjectSolution: refreshSolution,
    updateProjectStatus: updateStatus,
    refreshingProjectId,
  };
}
