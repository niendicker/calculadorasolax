import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
    }

    // No service-role client needed: "users write own profile assets"
    // (0007_profile_company_branding.sql) already lets a user manage their
    // own storage.objects, and delete_own_account (0078) is a
    // security-definer RPC scoped to auth.uid() for the auth.users row
    // itself, which the regular anon-key client can't touch directly.

    // Best-effort cleanup: a failure here shouldn't block account deletion
    // (the logo files are just orphaned storage, not user-facing data), but
    // it's still logged instead of silently swallowed.
    const { data: logoFiles, error: listError } = await supabase.storage.from('profile-assets').list(`${user.id}/logo`);
    if (listError) {
      console.error(listError);
    } else if (logoFiles && logoFiles.length > 0) {
      const { error: removeError } = await supabase.storage
        .from('profile-assets')
        .remove(logoFiles.map((file) => `${user.id}/logo/${file.name}`));
      if (removeError) console.error(removeError);
    }

    const { error: deleteError } = await supabase.rpc('delete_own_account');
    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Não foi possível excluir a conta. Tente novamente.' }, { status: 500 });
  }
}
