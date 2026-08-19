import { createClient } from '@/lib/supabase/client';

export type ClientInput = {
  name: string;
  email: string;
  phone: string;
  document: string;
  notes: string;
};

export type ClientUpdate = Partial<ClientInput>;

function nullableText(value: string | undefined) {
  return value === undefined ? undefined : value.trim() || null;
}

export async function listClients() {
  const supabase = createClient();
  const { data, error } = await supabase.from('clients').select('*').order('name');
  if (error) throw error;
  return data ?? [];
}

export async function insertClient(input: ClientInput) {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error('not_authenticated');

  const { data, error } = await supabase
    .from('clients')
    .insert({
      user_id: userData.user.id,
      name: input.name.trim(),
      email: nullableText(input.email),
      phone: nullableText(input.phone),
      document: nullableText(input.document),
      notes: nullableText(input.notes),
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateClientRecord(id: string, partial: ClientUpdate) {
  const supabase = createClient();
  const payload = {
    updated_at: new Date().toISOString(),
    ...(partial.name === undefined ? {} : { name: partial.name.trim() }),
    ...(partial.email === undefined ? {} : { email: nullableText(partial.email) }),
    ...(partial.phone === undefined ? {} : { phone: nullableText(partial.phone) }),
    ...(partial.document === undefined ? {} : { document: nullableText(partial.document) }),
    ...(partial.notes === undefined ? {} : { notes: nullableText(partial.notes) }),
  };

  const { error } = await supabase.from('clients').update(payload).eq('id', id);
  if (error) throw error;
}

export async function deleteClientRecord(id: string) {
  const supabase = createClient();
  const { error } = await supabase.from('clients').delete().eq('id', id);
  if (error) throw error;
}
