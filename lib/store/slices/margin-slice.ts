import type { StateCreator } from 'zustand';
import { createClient } from '@/lib/supabase/client';
import type { MarginSettings, StockProductType } from '@/lib/types';
import type { WizardStore } from '../wizard-store';

export interface MarginSlice {
  marginSettings: MarginSettings;
  fetchMarginSettings: () => Promise<void>;
  updateMarginPercent: (category: StockProductType, percent: number) => Promise<void>;
}

export const zeroMargins: MarginSettings = { inverterPercent: 0, batteryPercent: 0, accessoryPercent: 0 };

export const createMarginSlice: StateCreator<WizardStore, [], [], MarginSlice> = (set) => ({
  marginSettings: zeroMargins,

  fetchMarginSettings: async () => {
    const supabase = createClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return;

    const { data, error } = await supabase
      .from('profiles')
      .select('margin_inverter_percent, margin_battery_percent, margin_accessory_percent')
      .eq('id', userData.user.id)
      .maybeSingle();
    if (error) throw error;

    set({
      marginSettings: {
        inverterPercent: data?.margin_inverter_percent ?? 0,
        batteryPercent: data?.margin_battery_percent ?? 0,
        accessoryPercent: data?.margin_accessory_percent ?? 0,
      },
    });
  },

  updateMarginPercent: async (category, percent) => {
    const column = {
      inverter: 'margin_inverter_percent',
      battery: 'margin_battery_percent',
      accessory: 'margin_accessory_percent',
    }[category];
    const field = {
      inverter: 'inverterPercent',
      battery: 'batteryPercent',
      accessory: 'accessoryPercent',
    }[category] as keyof MarginSettings;

    const supabase = createClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) throw new Error('not_authenticated');

    const { error } = await supabase
      .from('profiles')
      .update({ [column]: percent, updated_at: new Date().toISOString() })
      .eq('id', userData.user.id);
    if (error) throw error;

    set((s) => ({ marginSettings: { ...s.marginSettings, [field]: percent } }));
  },
});
