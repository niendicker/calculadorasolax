import type { StateCreator } from 'zustand';
import type { Json } from '@/lib/database.types';
import { isAddressEmpty } from '@/lib/address';
import { ACCOUNT_LIMITS, limitReachedMessage } from '@/lib/limits';
import { calculateResidentialSolution } from '@/lib/calculate-residential';
import {
  deleteProjectRecord,
  getCurrentUserId,
  insertProjectEvent,
  listProjectRecords,
  saveProjectRecord,
  updateProjectSolutionRecord,
  updateProjectStatusRecord,
} from '@/lib/data/projects-repository';
import type { ProjectInfo, ProjectStatus, SavedProject } from '@/lib/types';
import { defaultProjectInfo, defaultResidential, sanitizeDesiredFeatures } from '../defaults';
import { projectFromRow } from '../row-mappers';
import { totalDailyKwh, totalPeakW } from '../wizard-calculations';
import type { WizardStore } from '../wizard-store';

export interface ProjectsSlice {
  projectInfo: ProjectInfo;
  currentProjectId: string | null;
  /** Whether the "Dados do projeto" card should be shown on the Projeto tab: only after
   *  starting a new draft or opening a saved project, not just from landing on the page. */
  projectDetailsVisible: boolean;
  savedProjects: SavedProject[];

  setProjectInfo: (partial: Partial<ProjectInfo>) => void;
  newProjectDraft: () => void;
  cancelProjectDraft: () => void;
  saveCurrentProject: () => Promise<SavedProject>;
  /** `showDetails` (default true) controls whether this also opens the
   * project-editing draft card — pass false for a "quiet" load that just
   * brings the project's data into the live wizard state (e.g. to generate
   * its PDF report) without switching the Projeto tab into edit mode. */
  loadProject: (id: string, options?: { showDetails?: boolean }) => void;
  removeProject: (id: string) => Promise<void>;
  /** Recalculates a saved project's solution from its own stored
   * residentialOptions (same calculate-residential call the Dimensionamento
   * tab's "Calcular" makes), then persists the refreshed solution — so a
   * project's card can catch up a solution that's gone stale after the loads
   * changed, without the user having to reopen it in Dimensionamento. */
  refreshProjectSolution: (id: string) => Promise<SavedProject>;
  updateProjectStatus: (id: string, status: ProjectStatus) => Promise<SavedProject>;
  fetchProjects: () => Promise<void>;
}

export const createProjectsSlice: StateCreator<WizardStore, [], [], ProjectsSlice> = (set, get) => ({
  projectInfo: defaultProjectInfo,
  currentProjectId: null,
  projectDetailsVisible: false,
  savedProjects: [],

  setProjectInfo: (partial) =>
    set((s) => ({
      projectInfo: { ...s.projectInfo, ...partial },
    })),

  newProjectDraft: () =>
    set({
      isDemo: false,
      demoId: null,
      demoSnapshot: null,
      projectInfo: defaultProjectInfo,
      currentProjectId: null,
      projectDetailsVisible: true,
      residentialOptions: defaultResidential,
      solution: null,
      secondarySolution: null,
      services: [],
    }),

  // Discards an in-progress "Dados do projeto" card without saving. For a
  // brand-new draft this just clears it back to blank; for a project that
  // was opened for editing, it reverts any unsaved edits back to the last
  // saved values so the card behind it doesn't show stale changes.
  cancelProjectDraft: () =>
    set((s) => {
      const project = s.currentProjectId
        ? s.savedProjects.find((item) => item.id === s.currentProjectId)
        : undefined;

      if (!project) {
        return {
          isDemo: false,
          demoId: null,
          demoSnapshot: null,
          projectInfo: defaultProjectInfo,
          currentProjectId: null,
          projectDetailsVisible: false,
          residentialOptions: defaultResidential,
          solution: null,
          secondarySolution: null,
          services: [],
        };
      }

      return {
        isDemo: false,
        demoId: null,
        demoSnapshot: null,
        projectDetailsVisible: false,
        services: project.services ?? [],
        projectInfo: {
          name: project.name,
          clientId: project.clientId,
          address: project.address,
          notes: project.notes,
        },
        residentialOptions: {
          ...defaultResidential,
          ...project.residentialOptions,
          loads: project.residentialOptions.loads.map((load) => ({ ...load })),
          desiredFeatures: sanitizeDesiredFeatures(project.residentialOptions.desiredFeatures),
        },
        solution: project.solution,
        secondarySolution: null,
      };
    }),

  saveCurrentProject: async () => {
    if (get().isDemo) throw new Error('demo_mode_save_blocked');
    const userId = await getCurrentUserId();

    const s = get();
    if (!s.currentProjectId && s.savedProjects.length >= ACCOUNT_LIMITS.projects) {
      throw new Error(limitReachedMessage('projetos salvos', ACCOUNT_LIMITS.projects));
    }

    const name = s.projectInfo.name.trim() || `Projeto ${new Date().toLocaleDateString('pt-BR')}`;
    const payload = {
      user_id: userId,
      client_id: s.projectInfo.clientId,
      name,
      address: (isAddressEmpty(s.projectInfo.address) ? null : s.projectInfo.address) as Json,
      notes: s.projectInfo.notes.trim() || null,
      residential_options: s.residentialOptions as unknown as Json,
      solution: s.solution as unknown as Json,
      services: s.services as unknown as Json,
      updated_at: new Date().toISOString(),
    };

    const data = await saveProjectRecord(s.currentProjectId, payload);

    const saved = projectFromRow(data);

    set((st) => ({
      currentProjectId: saved.id,
      projectInfo: { ...st.projectInfo, name: saved.name },
      savedProjects: [saved, ...st.savedProjects.filter((project) => project.id !== saved.id)],
    }));

    return saved;
  },

  loadProject: (id, options) =>
    set((s) => {
      const project = s.savedProjects.find((item) => item.id === id);
      if (!project) return {};

      return {
        isDemo: false,
        demoId: null,
        demoSnapshot: null,
        currentProjectId: project.id,
        projectDetailsVisible: options?.showDetails ?? true,
        projectInfo: {
          name: project.name,
          clientId: project.clientId,
          address: project.address,
          notes: project.notes,
        },
        residentialOptions: {
          ...defaultResidential,
          ...project.residentialOptions,
          loads: project.residentialOptions.loads.map((load) => ({ ...load })),
          desiredFeatures: sanitizeDesiredFeatures(project.residentialOptions.desiredFeatures),
        },
        solution: project.solution,
        secondarySolution: null,
        services: project.services ?? [],
      };
    }),

  removeProject: async (id) => {
    await deleteProjectRecord(id);

    set((s) => {
      const wasCurrent = s.currentProjectId === id;
      return {
        savedProjects: s.savedProjects.filter((project) => project.id !== id),
        // Deleting the project currently loaded on screen must clear it the
        // same way starting a new project draft does — otherwise its name
        // (e.g. the badge on the Dimensionamento page) and configuration
        // keep showing after the project itself no longer exists.
        ...(wasCurrent
          ? {
              isDemo: false,
              demoId: null,
              demoSnapshot: null,
              currentProjectId: null,
              projectDetailsVisible: false,
              projectInfo: defaultProjectInfo,
              residentialOptions: defaultResidential,
              solution: null,
              secondarySolution: null,
              services: [],
            }
          : {}),
      };
    });
  },

  refreshProjectSolution: async (id) => {
    const project = get().savedProjects.find((item) => item.id === id);
    if (!project) throw new Error('project_not_found');
    const batteryModel = project.residentialOptions.batteryModel;
    if (!batteryModel) throw new Error('missing_battery_model');

    const result = await calculateResidentialSolution({
      residentialOptions: project.residentialOptions,
      batteryModel,
      projectName: project.name,
      peakW: totalPeakW(project.residentialOptions.loads, project.residentialOptions.peakCalcMode ?? 'sum'),
      dailyKwh: totalDailyKwh(project.residentialOptions.loads, project.residentialOptions.operationHours),
    });
    if ('error' in result) throw new Error(result.error);

    const row = await updateProjectSolutionRecord(id, result.solution as unknown as Json);

    const updated = projectFromRow(row);
    set((s) => ({
      savedProjects: s.savedProjects.map((item) => (item.id === id ? updated : item)),
      ...(s.currentProjectId === id
        ? { solution: updated.solution, secondarySolution: null }
        : {}),
    }));

    return updated;
  },

  updateProjectStatus: async (id, status) => {
    const previous = get().savedProjects.find((item) => item.id === id);
    const data = await updateProjectStatusRecord(id, status);

    const updated = projectFromRow(data);
    set((s) => ({
      savedProjects: s.savedProjects.map((item) => (item.id === id ? updated : item)),
    }));

    // Logged for the project's Histórico (see ProjectEventsTimeline) —
    // best-effort: a failure here shouldn't undo the status change itself,
    // which already succeeded above.
    if (previous && previous.status !== status) {
      try {
        const userId = await getCurrentUserId();
        await insertProjectEvent({
          project_id: id,
          actor_id: userId,
          event_type: 'status_changed',
          from_status: previous.status,
          to_status: status,
        });
      } catch (error) {
        console.warn('[projects] status updated but history event could not be recorded', error);
      }
    }

    return updated;
  },

  fetchProjects: async () => {
    const data = await listProjectRecords();
    set({ savedProjects: data.map(projectFromRow) });
  },
});
