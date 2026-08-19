import type { createClient } from '@/lib/supabase/client';

type BrowserSupabaseClient = ReturnType<typeof createClient>;
type ProductTable = 'inverters' | 'batteries' | 'accessories';

const COLUMNS: Record<ProductTable, string> = {
  inverters: 'model, nickname, image_url, documents',
  batteries: 'model, nickname, image_url, documents',
  accessories: 'model, nickname, description, image_url, documents',
};

export async function listProductMedia(
  supabase: BrowserSupabaseClient,
  table: ProductTable,
  models: string[]
) {
  if (models.length === 0) return [];
  const { data, error } = await supabase.from(table).select(COLUMNS[table]).in('model', models);
  if (error) throw error;
  return data ?? [];
}
