import type { StateCreator } from 'zustand';
import { ACCOUNT_LIMITS, limitReachedMessage } from '@/lib/limits';
import { createClient } from '@/lib/supabase/client';
import type { LoadPresetLoad, UserLoadCatalogItem, UserLoadPresetItem } from '@/lib/types';
import { userLoadFromRow, userLoadPresetFromRow } from '../row-mappers';
import type { WizardStore } from '../wizard-store';

export interface LoadCatalogSlice {
  userLoadCatalog: UserLoadCatalogItem[];
  userLoadPresets: UserLoadPresetItem[];
  fetchUserLoadCatalog: () => Promise<void>;
  saveManualLoadToCatalog: (input: { name: string; powerW: number; ipInRatio: number }) => Promise<void>;
  updateUserLoadCatalogItem: (
    id: string,
    partial: Partial<{ name: string; powerW: number; ipInRatio: number }>
  ) => Promise<void>;
  removeUserLoadCatalogItem: (id: string) => Promise<void>;
  fetchUserLoadPresets: () => Promise<void>;
  saveLoadsAsPreset: (input: { name: string; description: string; loads: LoadPresetLoad[] }) => Promise<void>;
  removeUserLoadPreset: (id: string) => Promise<void>;
}

export const createLoadCatalogSlice: StateCreator<WizardStore, [], [], LoadCatalogSlice> = (set, get) => ({
  userLoadCatalog: [],
  userLoadPresets: [],

  fetchUserLoadCatalog: async () => {
    const supabase = createClient();
    const { data, error } = await supabase.from('user_load_catalog').select('*').order('name');
    if (error) throw error;
    set({ userLoadCatalog: (data ?? []).map(userLoadFromRow) });
  },

  saveManualLoadToCatalog: async (input) => {
    const supabase = createClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) throw new Error('not_authenticated');

    const existing = get().userLoadCatalog.find(
      (item) => item.name.trim().toLowerCase() === input.name.trim().toLowerCase()
    );

    if (existing) {
      const { error } = await supabase
        .from('user_load_catalog')
        .update({
          power_w: input.powerW,
          ip_in_ratio: input.ipInRatio,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);
      if (error) throw error;

      set((s) => ({
        userLoadCatalog: s.userLoadCatalog.map((item) =>
          item.id === existing.id ? { ...item, powerW: input.powerW, ipInRatio: input.ipInRatio } : item
        ),
      }));
      return;
    }

    // FIFO instead of blocking: once at the limit, saving a new custom load
    // silently evicts the oldest one to make room, rather than erroring out.
    if (get().userLoadCatalog.length >= ACCOUNT_LIMITS.userLoadCatalog) {
      const oldest = [...get().userLoadCatalog].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      )[0];
      if (oldest) {
        const { error: deleteError } = await supabase.from('user_load_catalog').delete().eq('id', oldest.id);
        if (deleteError) throw deleteError;
        set((s) => ({ userLoadCatalog: s.userLoadCatalog.filter((item) => item.id !== oldest.id) }));
      }
    }

    const { data, error } = await supabase
      .from('user_load_catalog')
      .insert({
        user_id: userData.user.id,
        name: input.name.trim(),
        power_w: input.powerW,
        ip_in_ratio: input.ipInRatio,
      })
      .select()
      .single();
    if (error) throw error;

    const item = userLoadFromRow(data);
    set((s) => ({
      userLoadCatalog: [...s.userLoadCatalog, item].sort((a, b) => a.name.localeCompare(b.name)),
    }));
  },

  updateUserLoadCatalogItem: async (id, partial) => {
    const supabase = createClient();
    const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (partial.name !== undefined) payload.name = partial.name.trim();
    if (partial.powerW !== undefined) payload.power_w = partial.powerW;
    if (partial.ipInRatio !== undefined) payload.ip_in_ratio = partial.ipInRatio;

    const { error } = await supabase.from('user_load_catalog').update(payload).eq('id', id);
    if (error) throw error;

    set((s) => ({
      userLoadCatalog: s.userLoadCatalog
        .map((item) => (item.id === id ? { ...item, ...partial } : item))
        .sort((a, b) => a.name.localeCompare(b.name)),
    }));
  },

  removeUserLoadCatalogItem: async (id) => {
    const supabase = createClient();
    const { error } = await supabase.from('user_load_catalog').delete().eq('id', id);
    if (error) throw error;

    set((s) => ({
      userLoadCatalog: s.userLoadCatalog.filter((item) => item.id !== id),
    }));
  },

  fetchUserLoadPresets: async () => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('user_load_presets')
      .select('id, name, description, loads')
      .order('created_at');
    if (error) throw error;
    set({ userLoadPresets: (data ?? []).map(userLoadPresetFromRow) });
  },

  saveLoadsAsPreset: async (input) => {
    const supabase = createClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) throw new Error('not_authenticated');

    if (get().userLoadPresets.length >= ACCOUNT_LIMITS.userPresets) {
      throw new Error(limitReachedMessage('predefinições pessoais', ACCOUNT_LIMITS.userPresets));
    }

    const { data, error } = await supabase
      .from('user_load_presets')
      .insert({
        user_id: userData.user.id,
        name: input.name.trim(),
        description: input.description.trim(),
        loads: input.loads,
      })
      .select('id, name, description, loads')
      .single();
    if (error) throw error;

    const item = userLoadPresetFromRow(data);
    set((s) => ({ userLoadPresets: [...s.userLoadPresets, item] }));
  },

  removeUserLoadPreset: async (id) => {
    const supabase = createClient();
    const { error } = await supabase.from('user_load_presets').delete().eq('id', id);
    if (error) throw error;

    set((s) => ({
      userLoadPresets: s.userLoadPresets.filter((item) => item.id !== id),
    }));
  },
});
