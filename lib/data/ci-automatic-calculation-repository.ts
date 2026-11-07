import type { SupabaseClient } from '@supabase/supabase-js';
import type { CommercialIndustrialOptions } from '@/supabase/functions/_shared/commercial-industrial/types';
import { calculatePersistedCi } from './ci-persisted-calculation-repository';
/** Compatibility entry point. Catalog enumeration belongs exclusively to administrative generation. */
export async function calculateAutomaticCi(db:SupabaseClient,options:CommercialIndustrialOptions){return calculatePersistedCi(db,options);}
