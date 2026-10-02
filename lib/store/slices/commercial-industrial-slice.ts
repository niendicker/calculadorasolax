// C&I project state — parallel to projects-slice.ts, not a branch of it
// (docs/CI-MODULE-PLAN.md's "criar slice C&I próprio; não ampliar
// indiscriminadamente o slice residencial"). Mirrors its shape closely so
// the two are easy to reason about side by side, but touches none of its
// code — residential's behavior is provably unchanged by this file existing.

import type { StateCreator } from 'zustand';
import { ACCOUNT_LIMITS, limitReachedMessage } from '@/lib/limits';
import { isAddressEmpty } from '@/lib/address';
import {
  deleteCiProjectRecord,
  listCiProjectRecords,
  saveCiProjectRecord,
  updateCiProjectStatusRecord,
} from '@/lib/data/ci-projects-repository';
import type { ProjectInfo, ProjectStatus, SavedCiProject } from '@/lib/types';
import type { CommercialIndustrialOptions } from '@/supabase/functions/_shared/commercial-industrial/types';
import type { Json } from '@/lib/database.types';
import { defaultCiOptions, defaultProjectInfo } from '../defaults';
import { ciProjectFromRow } from '../row-mappers';
import { getCurrentUserId } from '../../data/projects-repository';
import type { WizardStore } from '../wizard-store';

export interface CommercialIndustrialSlice {
  ciProjectInfo: ProjectInfo;
  currentCiProjectId: string | null;
  /** Same role as projects-slice's projectDetailsVisible — whether the
   * "Dados do projeto" card should show, not just landing on the page. */
  ciProjectDetailsVisible: boolean;
  savedCiProjects: SavedCiProject[];
  ciOptions: CommercialIndustrialOptions;

  setCiProjectInfo: (partial: Partial<ProjectInfo>) => void;
  setCiOptions: (partial: Partial<CommercialIndustrialOptions>) => void;
  newCiProjectDraft: () => void;
  cancelCiProjectDraft: () => void;
  saveCiProject: () => Promise<SavedCiProject>;
  loadCiProject: (id: string, options?: { showDetails?: boolean }) => void;
  removeCiProject: (id: string) => Promise<void>;
  updateCiProjectStatus: (id: string, status: ProjectStatus) => Promise<SavedCiProject>;
  fetchCiProjects: () => Promise<void>;
}

export const createCommercialIndustrialSlice: StateCreator<WizardStore, [], [], CommercialIndustrialSlice> = (set, get) => ({
  ciProjectInfo: defaultProjectInfo,
  currentCiProjectId: null,
  ciProjectDetailsVisible: false,
  savedCiProjects: [],
  ciOptions: defaultCiOptions,

  setCiProjectInfo: (partial) =>
    set((s) => ({
      ciProjectInfo: { ...s.ciProjectInfo, ...partial },
    })),

  setCiOptions: (partial) =>
    set((s) => ({
      ciOptions: { ...s.ciOptions, ...partial },
    })),

  newCiProjectDraft: () =>
    set({
      ciProjectInfo: defaultProjectInfo,
      currentCiProjectId: null,
      ciProjectDetailsVisible: true,
      ciOptions: defaultCiOptions,
    }),

  cancelCiProjectDraft: () =>
    set((s) => {
      const project = s.currentCiProjectId
        ? s.savedCiProjects.find((item) => item.id === s.currentCiProjectId)
        : undefined;

      if (!project) {
        return {
          ciProjectInfo: defaultProjectInfo,
          currentCiProjectId: null,
          ciProjectDetailsVisible: false,
          ciOptions: defaultCiOptions,
        };
      }

      return {
        ciProjectDetailsVisible: false,
        ciProjectInfo: {
          name: project.name,
          clientId: project.clientId,
          address: project.address,
          notes: project.notes,
        },
        ciOptions: { ...defaultCiOptions, ...project.calculationOptions },
      };
    }),

  saveCiProject: async () => {
    const userId = await getCurrentUserId();

    const s = get();
    // The DB trigger caps all of a user's `projects` rows together
    // (residential + C&I share the same table) — checking the combined
    // count here gives the same fast, friendly message the residential
    // save already does, before ever reaching that trigger.
    if (!s.currentCiProjectId && s.savedProjects.length + s.savedCiProjects.length >= ACCOUNT_LIMITS.projects) {
      throw new Error(limitReachedMessage('projetos salvos', ACCOUNT_LIMITS.projects));
    }

    const name = s.ciProjectInfo.name.trim() || `Projeto C&I ${new Date().toLocaleDateString('pt-BR')}`;
    const payload = {
      user_id: userId,
      client_id: s.ciProjectInfo.clientId,
      name,
      address: (isAddressEmpty(s.ciProjectInfo.address) ? null : s.ciProjectInfo.address) as Json,
      notes: s.ciProjectInfo.notes.trim() || null,
      installation_type: 'commercial_industrial' as const,
      calculation_options: s.ciOptions as unknown as Json,
      updated_at: new Date().toISOString(),
    };

    const data = await saveCiProjectRecord(s.currentCiProjectId, payload);
    const saved = ciProjectFromRow(data);

    set((st) => ({
      currentCiProjectId: saved.id,
      ciProjectInfo: { ...st.ciProjectInfo, name: saved.name },
      savedCiProjects: [saved, ...st.savedCiProjects.filter((project) => project.id !== saved.id)],
    }));

    return saved;
  },

  loadCiProject: (id, options) =>
    set((s) => {
      const project = s.savedCiProjects.find((item) => item.id === id);
      if (!project) return {};

      return {
        currentCiProjectId: project.id,
        ciProjectDetailsVisible: options?.showDetails ?? true,
        ciProjectInfo: {
          name: project.name,
          clientId: project.clientId,
          address: project.address,
          notes: project.notes,
        },
        ciOptions: { ...defaultCiOptions, ...project.calculationOptions },
      };
    }),

  removeCiProject: async (id) => {
    await deleteCiProjectRecord(id);

    set((s) => {
      const wasCurrent = s.currentCiProjectId === id;
      return {
        savedCiProjects: s.savedCiProjects.filter((project) => project.id !== id),
        ...(wasCurrent
          ? {
              currentCiProjectId: null,
              ciProjectDetailsVisible: false,
              ciProjectInfo: defaultProjectInfo,
              ciOptions: defaultCiOptions,
            }
          : {}),
      };
    });
  },

  updateCiProjectStatus: async (id, status) => {
    const data = await updateCiProjectStatusRecord(id, status);
    const updated = ciProjectFromRow(data);
    set((s) => ({
      savedCiProjects: s.savedCiProjects.map((item) => (item.id === id ? updated : item)),
    }));
    return updated;
  },

  fetchCiProjects: async () => {
    const data = await listCiProjectRecords();
    set({ savedCiProjects: data.map(ciProjectFromRow) });
  },
});
