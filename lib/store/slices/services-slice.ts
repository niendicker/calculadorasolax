import type { StateCreator } from 'zustand';
import { ACCOUNT_LIMITS, limitReachedMessage } from '@/lib/limits';
import type { ProjectServiceLine, UserServiceItem, UserServicePricingUnit } from '@/lib/types';
import {
  deleteUserService,
  insertUserService,
  listUserServices,
  updateUserServiceName,
  updateUserServiceValue,
  updateUserServicePricingUnit,
} from '@/lib/data/catalog-repository';
import { userServiceFromRow } from '../row-mappers';
import type { WizardStore } from '../wizard-store';

export interface ServicesSlice {
  userServices: UserServiceItem[];
  /** Service lines (from userServices) added to the project currently being
   * edited — saved/loaded alongside residentialOptions/solution as part of
   * the project, see saveCurrentProject/loadProject in the projects slice. */
  services: ProjectServiceLine[];
  fetchUserServices: () => Promise<void>;
  addService: (input: { name: string; unitValue: number; pricingUnit?: UserServicePricingUnit }) => Promise<void>;
  updateServiceName: (id: string, name: string) => Promise<void>;
  updateServiceValue: (id: string, unitValue: number) => Promise<void>;
  updateServicePricingUnit: (id: string, pricingUnit: UserServicePricingUnit) => Promise<void>;
  removeService: (id: string) => Promise<void>;
  /** Adds a line for this service to the project currently being edited, at
   * qty 1 — a no-op if it's already on the list. */
  addServiceToProject: (serviceId: string) => void;
  removeServiceFromProject: (serviceId: string) => void;
  clearProjectServices: () => void;
  updateProjectServiceQty: (serviceId: string, qty: number) => void;
}

export const createServicesSlice: StateCreator<WizardStore, [], [], ServicesSlice> = (set, get) => ({
  userServices: [],
  services: [],

  fetchUserServices: async () => {
    const data = await listUserServices();
    set({ userServices: data.map(userServiceFromRow) });
  },

  addService: async (input) => {
    if (get().userServices.length >= ACCOUNT_LIMITS.userServices) {
      throw new Error(limitReachedMessage('serviços no catálogo', ACCOUNT_LIMITS.userServices));
    }

    const data = await insertUserService(input);

    const item = userServiceFromRow(data);
    set((s) => ({ userServices: [...s.userServices, item].sort((a, b) => a.name.localeCompare(b.name)) }));
  },

  updateServiceName: async (id, name) => {
    const trimmed = name.trim();
    await updateUserServiceName(id, trimmed);

    set((s) => ({
      userServices: s.userServices.map((item) => (item.id === id ? { ...item, name: trimmed } : item)),
    }));
  },

  updateServiceValue: async (id, unitValue) => {
    await updateUserServiceValue(id, unitValue);

    set((s) => ({
      userServices: s.userServices.map((item) => (item.id === id ? { ...item, unitValue } : item)),
    }));
  },

  updateServicePricingUnit: async (id, pricingUnit) => {
    await updateUserServicePricingUnit(id, pricingUnit);
    set((s) => ({ userServices: s.userServices.map((item) => (item.id === id ? { ...item, pricingUnit } : item)) }));
  },

  removeService: async (id) => {
    await deleteUserService(id);

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

  clearProjectServices: () => set({ services: [] }),

  updateProjectServiceQty: (serviceId, qty) =>
    set((s) => ({
      services: s.services.map((line) => (line.serviceId === serviceId ? { ...line, qty: Math.max(1, qty) } : line)),
    })),
});
