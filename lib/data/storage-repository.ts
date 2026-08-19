import type { createClient } from '@/lib/supabase/client';

type BrowserSupabaseClient = ReturnType<typeof createClient>;

/** Public asset adapter. Bucket names and public URL generation stay here so a
 * future Storage provider can replace Supabase without changing components. */
export async function uploadPublicAsset(
  supabase: BrowserSupabaseClient,
  bucket: string,
  path: string,
  file: File
) {
  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type || undefined,
  });
  if (error) throw new Error(error.message);
  return getPublicAssetUrl(supabase, bucket, path);
}

export function getPublicAssetUrl(supabase: BrowserSupabaseClient, bucket: string, path: string) {
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}
