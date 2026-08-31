// Admin CRUD for the C&I BESS catalog — mirrors projects-repository.ts's
// style (a browser-side client, called from an admin UI component), not
// calculation-repository.ts's (a server-side helper taking a client
// parameter). There is no service-role admin API route for catalog-style
// resources in this project (see components/admin/AdminPanel.tsx's
// approved_solutions upsert) — RLS's `admin write ci_bess_products` policy
// (supabase/migrations/0094_ci_module.sql) is the actual authorization
// boundary, not a route handler.

import { createClient } from '@/lib/supabase/client';
import type { ProductDocument } from '@/lib/types';

export interface CiBessProductRecord {
  id: string;
  model: string;
  manufacturer: string;
  description: string | null;
  active: boolean;
  module_power_kw: number;
  module_capacity_kwh: number;
  efficiency_percent: number;
  soc_min_percent: number;
  soc_max_percent: number;
  warranty_years: number;
  image_url: string | null;
  /** Same shape as inverters/batteries/accessories' documents column — kept
   * as ProductDocument[] (not the table's raw jsonb Json type) so this row
   * type is a drop-in for the shared ProductMediaFields/MediaSummary admin
   * components those catalogs already use. */
  documents: ProductDocument[];
  created_at: string;
  updated_at: string;
}

export type CiBessProductInput = Omit<CiBessProductRecord, 'id' | 'created_at' | 'updated_at'>;

const COLUMNS =
  'id, model, manufacturer, description, active, module_power_kw, module_capacity_kwh, efficiency_percent, soc_min_percent, soc_max_percent, warranty_years, image_url, documents, created_at, updated_at';

/** Admins see every row (active or not) through their own RLS policy;
 * everyone else only sees active ones — same query, RLS decides what comes
 * back, so there is no separate "admin" vs "picker" query to keep in sync. */
export async function listCiBessProducts(): Promise<CiBessProductRecord[]> {
  const supabase = createClient();
  const { data, error } = await supabase.from('ci_bess_products').select(COLUMNS).order('model');
  if (error) throw error;
  return (data ?? []) as unknown as CiBessProductRecord[];
}

// `documents` is ProductDocument[] here (see CiBessProductRecord) but jsonb
// in the generated Supabase types — same widening every jsonb write in this
// codebase needs (e.g. AdminPanel's approved_solutions upsert casts
// raw_solution `as never`).
export async function createCiBessProduct(input: CiBessProductInput): Promise<CiBessProductRecord> {
  const supabase = createClient();
  const { data, error } = await supabase.from('ci_bess_products').insert(input as never).select(COLUMNS).single();
  if (error) throw error;
  return data as unknown as CiBessProductRecord;
}

export async function updateCiBessProduct(id: string, input: Partial<CiBessProductInput>): Promise<CiBessProductRecord> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('ci_bess_products')
    .update({ ...input, updated_at: new Date().toISOString() } as never)
    .eq('id', id)
    .select(COLUMNS)
    .single();
  if (error) throw error;
  return data as unknown as CiBessProductRecord;
}

/** The plan's own MVP scope (section 7's acceptance criterion) only calls
 * for activate/deactivate, not delete — a product stays in the catalog for
 * any project that already references it by id. */
export async function setCiBessProductActive(id: string, active: boolean): Promise<CiBessProductRecord> {
  return updateCiBessProduct(id, { active } as Partial<CiBessProductInput>);
}
