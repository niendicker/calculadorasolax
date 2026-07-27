import type { StateCreator } from 'zustand';
import { ACCOUNT_LIMITS, limitReachedMessage } from '@/lib/limits';
import { createClient } from '@/lib/supabase/client';
import type { StockProductType, UserStockItem } from '@/lib/types';
import { userStockItemFromRow } from '../row-mappers';
import type { WizardStore } from '../wizard-store';

export interface StockSlice {
  userStockItems: UserStockItem[];
  fetchUserStockItems: () => Promise<void>;
  addToStock: (input: { productType: StockProductType; productModel: string; unitValue: number }) => Promise<void>;
  updateStockItemValue: (id: string, unitValue: number) => Promise<void>;
  removeFromStock: (id: string) => Promise<void>;
}

export const createStockSlice: StateCreator<WizardStore, [], [], StockSlice> = (set, get) => ({
  userStockItems: [],

  fetchUserStockItems: async () => {
    const supabase = createClient();
    const { data, error } = await supabase.from('user_stock_items').select('*').order('product_model');
    if (error) throw error;
    set({ userStockItems: (data ?? []).map(userStockItemFromRow) });
  },

  addToStock: async (input) => {
    const alreadyInStock = get().userStockItems.some(
      (item) => item.productType === input.productType && item.productModel === input.productModel
    );
    if (!alreadyInStock && get().userStockItems.length >= ACCOUNT_LIMITS.userStockItems) {
      throw new Error(limitReachedMessage('itens no catálogo', ACCOUNT_LIMITS.userStockItems));
    }

    const supabase = createClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) throw new Error('not_authenticated');

    const { data, error } = await supabase
      .from('user_stock_items')
      .upsert(
        {
          user_id: userData.user.id,
          product_type: input.productType,
          product_model: input.productModel,
          unit_value: input.unitValue,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,product_type,product_model' }
      )
      .select()
      .single();
    if (error) throw error;

    const item = userStockItemFromRow(data);
    set((s) => ({
      userStockItems: [...s.userStockItems.filter((i) => i.id !== item.id), item].sort((a, b) =>
        a.productModel.localeCompare(b.productModel)
      ),
    }));
  },

  updateStockItemValue: async (id, unitValue) => {
    const supabase = createClient();
    const { error } = await supabase
      .from('user_stock_items')
      .update({ unit_value: unitValue, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;

    set((s) => ({
      userStockItems: s.userStockItems.map((item) => (item.id === id ? { ...item, unitValue } : item)),
    }));
  },

  removeFromStock: async (id) => {
    const supabase = createClient();
    const { error } = await supabase.from('user_stock_items').delete().eq('id', id);
    if (error) throw error;

    set((s) => ({
      userStockItems: s.userStockItems.filter((item) => item.id !== id),
    }));
  },
});
