import { createClient } from '@/lib/supabase/client';
import type { StockProductType, UserServicePricingUnit } from '@/lib/types';

export type ServiceInput = { name: string; unitValue: number; pricingUnit?: UserServicePricingUnit };
export type StockInput = { productType: StockProductType; productModel: string; unitValue: number };

export async function listUserServices() {
  const supabase = createClient();
  const { data, error } = await supabase.from('user_services').select('*').order('name');
  if (error) throw error;
  return data ?? [];
}

export async function insertUserService(input: ServiceInput) {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error('not_authenticated');

  const { data, error } = await supabase
    .from('user_services')
    .insert({ user_id: userData.user.id, name: input.name.trim(), unit_value: input.unitValue, pricing_unit: input.pricingUnit ?? 'project' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateUserServiceName(id: string, name: string) {
  const supabase = createClient();
  const { error } = await supabase
    .from('user_services')
    .update({ name: name.trim(), updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function updateUserServiceValue(id: string, unitValue: number) {
  const supabase = createClient();
  const { error } = await supabase
    .from('user_services')
    .update({ unit_value: unitValue, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function updateUserServicePricingUnit(id: string, pricingUnit: UserServicePricingUnit) {
  const supabase = createClient();
  const { error } = await supabase
    .from('user_services')
    .update({ pricing_unit: pricingUnit, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function deleteUserService(id: string) {
  const supabase = createClient();
  const { error } = await supabase.from('user_services').delete().eq('id', id);
  if (error) throw error;
}

export async function listUserStockItems() {
  const supabase = createClient();
  const { data, error } = await supabase.from('user_stock_items').select('*').order('product_model');
  if (error) throw error;
  return data ?? [];
}

export async function upsertUserStockItem(input: StockInput) {
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
  return data;
}

export async function updateUserStockItemValue(id: string, unitValue: number) {
  const supabase = createClient();
  const { error } = await supabase
    .from('user_stock_items')
    .update({ unit_value: unitValue, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function deleteUserStockItem(id: string) {
  const supabase = createClient();
  const { error } = await supabase.from('user_stock_items').delete().eq('id', id);
  if (error) throw error;
}
