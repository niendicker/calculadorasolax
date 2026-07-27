import type { StateCreator } from 'zustand';
import { ACCOUNT_LIMITS, limitReachedMessage } from '@/lib/limits';
import { createClient } from '@/lib/supabase/client';
import type { ProjectServiceLine, UserServiceItem } from '@/lib/types';
import { userServiceFromRow } from '../row-mappers';
import type { WizardStore } from '../wizard-store';

export interface ServicesSlice {
  userServices: UserServiceItem[];
  /** Service lines (from userServices) added to the project currently being
   * edited — saved/loaded alongside residentialOptions/solution as part of
   * the project, see saveCurrentProject/loadProject in the projects slice. */
  services: ProjectServiceLine[];
  fetchUserServices: () => Promise<void>;
  addService: (input: { name: string; unitValue: number }) => Promise<void>;
  updateServiceName: (id: string, name: string) => Promise<void>;
  updateServiceValue: (id: string, unitValue: number) => Promise<void>;
  removeService: (id: string) => Promise<void>;
  /** Adds a line for this service to the project currently being edited, at
   * qty 1 — a no-op if it's already on the list. */
  addServiceToProject: (serviceId: string) => void;
  removeServiceFromProject: (serviceId: string) => void;
  updateProjectServiceQty: (serviceId: string, qty: number) => void;
}

export const createServicesSlice: StateCreator<WizardStore, [], [], ServicesSlice> = (set, get) => ({
  userServices: [],
  services: [],

  fetchUserServices: async () => {
    const supabase = createClient();
    const { data, error } = await supabase.from('user_services').select('*').order('name');
    if (error) throw error;
    set({ userServices: (data ?? []).map(userServiceFromRow) });
  },

  addService: async (input) => {
    if (get().userServices.length >= ACCOUNT_LIMITS.userServices) {
      throw new Error(limitReachedMessage('serviços no catálogo', ACCOUNT_LIMITS.userServices));
    }

    const supabase = createClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) throw new Error('not_authenticated');

    const { data, error } = await supabase
      .from('user_services')
      .insert({ user_id: userData.user.id, name: input.name.trim(), unit_value: input.unitValue })
      .select()
      .single();
    if (error) throw error;

    const item = userServiceFromRow(data);
    set((s) => ({ userServices: [...s.userServices, item].sort((a, b) => a.name.localeCompare(b.name)) }));
  },

  updateServiceName: async (id, name) => {
    const trimmed = name.trim();
    const supabase = createClient();
    const { error } = await supabase
      .from('user_services')
      .update({ name: trimmed, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;

    set((s) => ({
      userServices: s.userServices.map((item) => (item.id === id ? { ...item, name: trimmed } : item)),
    }));
  },

  updateServiceValue: async (id, unitValue) => {
    const supabase = createClient();
    const { error } = await supabase
      .from('user_services')
      .update({ unit_value: unitValue, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;

    set((s) => ({
      userServices: s.userServices.map((item) => (item.id === id ? { ...item, unitValue } : item)),
    }));
  },

  removeService: async (id) => {
    const supabase = createClient();
    const { error } = await supabase.from('user_services').delete().eq('id', id);
    if (error) throw error;

    set((s) => ({
      userServices: s.userServices.filter((item) => item.id !== id),
      services: s.services.filter((line) => line.serviceId !== id),
    }));
  },

  addServiceToProject: (serviceId) =>
    set((s) => {
      if (s.services.some((line) => line.serviceId === serviceId)) return {};
      const service = s.userServices.find((item) => item.id === serviceId);
      if (!service) return {};
      return { services: [...s.services, { serviceId, name: service.name, qty: 1 }] };
    }),

  removeServiceFromProject: (serviceId) =>
    set((s) => ({ services: s.services.filter((line) => line.serviceId !== serviceId) })),

  updateProjectServiceQty: (serviceId, qty) =>
    set((s) => ({
      services: s.services.map((line) => (line.serviceId === serviceId ? { ...line, qty: Math.max(1, qty) } : line)),
    })),
});
