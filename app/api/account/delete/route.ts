import { NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
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

    const supabaseUrl = process.env.SUPABASE_INTERNAL_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const admin = createServiceClient(
      supabaseUrl,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Best-effort cleanup: a failure here shouldn't block account deletion
    // (the logo files are just orphaned storage, not user-facing data), but
    // it's still logged instead of silently swallowed.
    const { data: logoFiles, error: listError } = await admin.storage.from('profile-assets').list(`${user.id}/logo`);
    if (listError) {
      console.error(listError);
    } else if (logoFiles && logoFiles.length > 0) {
      const { error: removeError } = await admin.storage
        .from('profile-assets')
        .remove(logoFiles.map((file) => `${user.id}/logo/${file.name}`));
      if (removeError) console.error(removeError);
    }

    const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Não foi possível excluir a conta. Tente novamente.' }, { status: 500 });
  }
}
