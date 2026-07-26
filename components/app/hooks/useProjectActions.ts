import { useState } from 'react';
import type { useRouter } from 'next/navigation';
import type { SavedProject } from '@/lib/types';
import type { InlineProfile } from '../types';

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
  setActiveTab: (tab: 'project' | 'sizing' | 'catalog' | 'clients') => void;
}) {
  const [projectStatus, setProjectStatus] = useState<string | null>(null);
  // Bumped on every new status message (even repeats of the same text) so the
  // popup can key off it and restart its dismiss countdown reliably.
  const [statusId, setStatusId] = useState(0);

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
      report(
        error instanceof Error && error.message.startsWith('Limite de')
          ? error.message
          : 'Não foi possível salvar o projeto. Tente novamente.'
      );
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
      report(
        error instanceof Error && error.message.startsWith('Limite de')
          ? error.message
          : 'Não foi possível duplicar o projeto. Tente novamente.'
      );
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
  };
}
