import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { cleanupAccountLogoFiles, deleteOwnAccount } from '@/lib/data/account-repository';

export async function POST() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
    }

    await cleanupAccountLogoFiles(supabase, user.id);
    try {
      await deleteOwnAccount(supabase);
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Não foi possível excluir a conta.' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Não foi possível excluir a conta. Tente novamente.' }, { status: 500 });
  }
}
