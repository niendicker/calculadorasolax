import type { StateCreator } from 'zustand';
import { ACCOUNT_LIMITS, limitReachedMessage } from '@/lib/limits';
import { createClient } from '@/lib/supabase/client';
import type { Client } from '@/lib/types';
import { clientFromRow } from '../row-mappers';
import type { WizardStore } from '../wizard-store';

export interface ClientsSlice {
  clients: Client[];
  fetchClients: () => Promise<void>;
  addClient: (input: { name: string; email: string; phone: string; document: string; notes: string }) => Promise<Client>;
  updateClient: (
    id: string,
    partial: Partial<{ name: string; email: string; phone: string; document: string; notes: string }>
  ) => Promise<void>;
  removeClient: (id: string) => Promise<void>;
}

export const createClientsSlice: StateCreator<WizardStore, [], [], ClientsSlice> = (set, get) => ({
  clients: [],

  fetchClients: async () => {
    const supabase = createClient();
    const { data, error } = await supabase.from('clients').select('*').order('name');
    if (error) throw error;
    set({ clients: (data ?? []).map(clientFromRow) });
  },

  addClient: async (input) => {
    if (get().clients.length >= ACCOUNT_LIMITS.clients) {
      throw new Error(limitReachedMessage('clientes cadastrados', ACCOUNT_LIMITS.clients));
    }

    const supabase = createClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) throw new Error('not_authenticated');

    const { data, error } = await supabase
      .from('clients')
      .insert({
        user_id: userData.user.id,
        name: input.name.trim(),
        email: input.email.trim() || null,
        phone: input.phone.trim() || null,
        document: input.document.trim() || null,
        notes: input.notes.trim() || null,
      })
      .select()
      .single();
    if (error) throw error;

    const client = clientFromRow(data);
    set((s) => ({
      clients: [...s.clients, client].sort((a, b) => a.name.localeCompare(b.name)),
    }));
    return client;
  },

  updateClient: async (id, partial) => {
    const supabase = createClient();
    const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (partial.name !== undefined) payload.name = partial.name.trim();
    if (partial.email !== undefined) payload.email = partial.email.trim() || null;
    if (partial.phone !== undefined) payload.phone = partial.phone.trim() || null;
    if (partial.document !== undefined) payload.document = partial.document.trim() || null;
    if (partial.notes !== undefined) payload.notes = partial.notes.trim() || null;

    const { error } = await supabase.from('clients').update(payload).eq('id', id);
    if (error) throw error;

    set((s) => ({
      clients: s.clients
        .map((client) => (client.id === id ? { ...client, ...partial } : client))
        .sort((a, b) => a.name.localeCompare(b.name)),
    }));
  },

  removeClient: async (id) => {
    const supabase = createClient();
    const { error } = await supabase.from('clients').delete().eq('id', id);
    if (error) throw error;

    set((s) => ({
      clients: s.clients.filter((client) => client.id !== id),
      savedProjects: s.savedProjects.map((project) =>
        project.clientId === id ? { ...project, clientId: null } : project
      ),
    }));
  },
});
