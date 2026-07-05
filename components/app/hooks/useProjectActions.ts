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
  loadProject,
  removeProject,
  setActiveTab,
}: {
  profile: InlineProfile | null;
  router: ReturnType<typeof useRouter>;
  locale: string;
  saveCurrentProject: () => Promise<SavedProject>;
  newProjectDraft: () => void;
  loadProject: (id: string) => void;
  removeProject: (id: string) => Promise<void>;
  setActiveTab: (tab: 'project' | 'sizing' | 'myLoads' | 'catalog' | 'clients') => void;
}) {
  const [projectStatus, setProjectStatus] = useState<string | null>(null);

  async function saveProject() {
    if (!profile) {
      router.push(`/${locale}/login?redirect=/${locale}`);
      return;
    }
    try {
      const project = await saveCurrentProject();
      setProjectStatus(`Projeto "${project.name}" salvo com configuração, rede, bateria e cargas.`);
    } catch {
      setProjectStatus('Não foi possível salvar o projeto. Tente novamente.');
    }
  }

  function startNewProject() {
    newProjectDraft();
    setProjectStatus('Novo projeto iniciado.');
  }

  function openProject(id: string) {
    loadProject(id);
    setActiveTab('sizing');
    setProjectStatus('Projeto carregado.');
  }

  async function deleteProject(id: string) {
    try {
      await removeProject(id);
      setProjectStatus('Projeto removido.');
    } catch {
      setProjectStatus('Não foi possível remover o projeto.');
    }
  }

  return { projectStatus, saveProject, startNewProject, openProject, deleteProject };
}
