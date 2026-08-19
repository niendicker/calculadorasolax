import type { StateCreator } from 'zustand';
import { ACCOUNT_LIMITS, limitReachedMessage } from '@/lib/limits';
import type { Client } from '@/lib/types';
import {
  deleteClientRecord,
  insertClient,
  listClients,
  type ClientInput,
  type ClientUpdate,
  updateClientRecord,
} from '@/lib/data/clients-repository';
import { clientFromRow } from '../row-mappers';
import type { WizardStore } from '../wizard-store';

export interface ClientsSlice {
  clients: Client[];
  fetchClients: () => Promise<void>;
  addClient: (input: ClientInput) => Promise<Client>;
  updateClient: (id: string, partial: ClientUpdate) => Promise<void>;
  removeClient: (id: string) => Promise<void>;
}

export const createClientsSlice: StateCreator<WizardStore, [], [], ClientsSlice> = (set, get) => ({
  clients: [],

  fetchClients: async () => {
    const data = await listClients();
    set({ clients: data.map(clientFromRow) });
  },

  addClient: async (input) => {
    if (get().clients.length >= ACCOUNT_LIMITS.clients) {
      throw new Error(limitReachedMessage('clientes cadastrados', ACCOUNT_LIMITS.clients));
    }

    const data = await insertClient(input);

    const client = clientFromRow(data);
    set((s) => ({
      clients: [...s.clients, client].sort((a, b) => a.name.localeCompare(b.name)),
    }));
    return client;
  },

  updateClient: async (id, partial) => {
    await updateClientRecord(id, partial);

    set((s) => ({
      clients: s.clients
        .map((client) => (client.id === id ? { ...client, ...partial } : client))
        .sort((a, b) => a.name.localeCompare(b.name)),
    }));
  },

  removeClient: async (id) => {
    await deleteClientRecord(id);

    set((s) => ({
      clients: s.clients.filter((client) => client.id !== id),
      savedProjects: s.savedProjects.map((project) =>
        project.clientId === id ? { ...project, clientId: null } : project
      ),
    }));
  },
});
