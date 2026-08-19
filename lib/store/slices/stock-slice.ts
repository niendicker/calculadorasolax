import type { StateCreator } from 'zustand';
import { ACCOUNT_LIMITS, limitReachedMessage } from '@/lib/limits';
import type { StockProductType, UserStockItem } from '@/lib/types';
import {
  deleteUserStockItem,
  listUserStockItems,
  updateUserStockItemValue,
  upsertUserStockItem,
} from '@/lib/data/catalog-repository';
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
    const data = await listUserStockItems();
    set({ userStockItems: data.map(userStockItemFromRow) });
  },

  addToStock: async (input) => {
    const alreadyInStock = get().userStockItems.some(
      (item) => item.productType === input.productType && item.productModel === input.productModel
    );
    if (!alreadyInStock && get().userStockItems.length >= ACCOUNT_LIMITS.userStockItems) {
      throw new Error(limitReachedMessage('itens no catálogo', ACCOUNT_LIMITS.userStockItems));
    }

    const data = await upsertUserStockItem(input);

    const item = userStockItemFromRow(data);
    set((s) => ({
      userStockItems: [...s.userStockItems.filter((i) => i.id !== item.id), item].sort((a, b) =>
        a.productModel.localeCompare(b.productModel)
      ),
    }));
  },

  updateStockItemValue: async (id, unitValue) => {
    await updateUserStockItemValue(id, unitValue);

    set((s) => ({
      userStockItems: s.userStockItems.map((item) => (item.id === id ? { ...item, unitValue } : item)),
    }));
  },

  removeFromStock: async (id) => {
    await deleteUserStockItem(id);

    set((s) => ({
      userStockItems: s.userStockItems.filter((item) => item.id !== id),
    }));
  },
});
