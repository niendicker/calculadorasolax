import { createClient } from '@/lib/supabase/client';

export interface CiProductIdentifier {
  productId?: string;
  model: string;
}

/**
 * Resolves uploaded product images (`image_url`) across C&I and residential catalogs.
 * Matches by both product UUID (`id`) and `model` string.
 */
export async function fetchCiProductImages(
  items: CiProductIdentifier[],
  client?: ReturnType<typeof createClient>
): Promise<Record<string, string>> {
  if (!items || items.length === 0) return {};
  const imageMap: Record<string, string> = {};

  try {
    const supabase = client ?? createClient();
    if (!supabase || typeof supabase.from !== 'function') return {};

    const ids = Array.from(new Set(items.map((i) => i.productId).filter((id): id is string => Boolean(id))));
    const models = Array.from(new Set(items.map((i) => i.model).filter((m): m is string => Boolean(m))));

    const tables = [
      'ci_bess_products',
      'ci_inverters',
      'ci_batteries',
      'ci_accessories',
      'ci_sts_products',
      'inverters',
      'batteries',
      'accessories',
    ] as const;

    await Promise.all(
      tables.map(async (table) => {
        try {
          if (ids.length > 0) {
            const { data } = await supabase.from(table).select('id, model, image_url').in('id', ids);
            if (data) {
              for (const row of data as { id: string; model: string; image_url: string | null }[]) {
                if (row.image_url) {
                  imageMap[row.id] = row.image_url;
                  imageMap[row.model] = row.image_url;
                }
              }
            }
          }
          if (models.length > 0) {
            const { data } = await supabase.from(table).select('id, model, image_url').in('model', models);
            if (data) {
              for (const row of data as { id: string; model: string; image_url: string | null }[]) {
                if (row.image_url) {
                  imageMap[row.id] = row.image_url;
                  imageMap[row.model] = row.image_url;
                }
              }
            }
          }
        } catch {
          // Gracefully continue with remaining tables
        }
      })
    );
  } catch {
    // Safe fallback if client is unconfigured or in offline/isolated test
  }

  return imageMap;
}
