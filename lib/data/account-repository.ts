import type { createClient } from '@/lib/supabase/server';

type ServerSupabaseClient = Awaited<ReturnType<typeof createClient>>;

/** Account-owned cleanup and deletion boundary. Storage cleanup is deliberately
 * best effort: the account RPC remains the source of truth for deletion. */
export async function cleanupAccountLogoFiles(supabase: ServerSupabaseClient, userId: string) {
  const { data: logoFiles, error: listError } = await supabase.storage.from('profile-assets').list(`${userId}/logo`);
  if (listError) {
    console.error(listError);
    return;
  }

  if (logoFiles && logoFiles.length > 0) {
    const { error: removeError } = await supabase.storage
      .from('profile-assets')
      .remove(logoFiles.map((file) => `${userId}/logo/${file.name}`));
    if (removeError) console.error(removeError);
  }
}

export async function deleteOwnAccount(supabase: ServerSupabaseClient) {
  const { error } = await supabase.rpc('delete_own_account');
  if (error) throw new Error(error.message);
}
