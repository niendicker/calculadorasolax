// Supabase row -> domain type mappers, shared across store slices. Kept
// separate from the slices themselves since several of them map rows from
// their own table (clients, projects, user_load_catalog, etc.) but none of
// this logic depends on Zustand's set/get — it's pure data shaping.

import { addressFromJson } from '@/lib/address';
import { defaultCiOptions, defaultResidential, sanitizeDesiredFeatures } from './defaults';
import type {
  Client,
  ProjectEvent,
  ProjectServiceLine,
  ProjectStatus,
  ResidentialOptions,
  SavedCiProject,
  SavedProject,
  Solution,
  StockProductType,
  UserLoadCatalogItem,
  UserLoadPresetItem,
  UserServiceItem,
  UserServicePricingUnit,
  UserStockItem,
} from '@/lib/types';
import type { LoadPresetLoad, SingleLoad } from '@/lib/types';
import type { CommercialIndustrialOptions, CommercialIndustrialResult } from '@/supabase/functions/_shared/commercial-industrial/types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function singleLoadFromJson(value: unknown): SingleLoad | null {
  if (!isRecord(value)) return null;
  const powerW = finiteNumber(value.powerW, -1);
  const qty = finiteNumber(value.qty, -1);
  if (powerW < 0 || qty <= 0) return null;
  return {
    ...(value as Omit<SingleLoad, 'powerW' | 'qty'>),
    powerW,
    qty,
    ipInRatio: finiteNumber(value.ipInRatio, 1),
  };
}

/** Converts the projects JSONB boundary into a safe domain object. Legacy
 * rows may omit fields added later; malformed rows must not enter the store as
 * an unchecked ResidentialOptions cast. */
export function residentialOptionsFromJson(value: unknown): ResidentialOptions {
  if (!isRecord(value)) return { ...defaultResidential, loads: [] };
  const loads = Array.isArray(value.loads)
    ? value.loads.map(singleLoadFromJson).filter((load): load is SingleLoad => load !== null)
    : [];
  return {
    ...defaultResidential,
    ...value,
    loads,
    desiredFeatures: sanitizeDesiredFeatures(
      Array.isArray(value.desiredFeatures) ? (value.desiredFeatures as ResidentialOptions['desiredFeatures']) : undefined
    ),
  };
}

export function clientFromRow(row: Record<string, unknown>): Client {
  return {
    id: row.id as string,
    name: (row.name as string) ?? '',
    email: (row.email as string | null) ?? '',
    phone: (row.phone as string | null) ?? '',
    document: (row.document as string | null) ?? '',
    notes: (row.notes as string | null) ?? '',
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export function userLoadFromRow(row: Record<string, unknown>): UserLoadCatalogItem {
  return {
    id: row.id as string,
    name: (row.name as string) ?? '',
    powerW: Number(row.power_w) || 0,
    ipInRatio: Number(row.ip_in_ratio) || 1,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export function userLoadPresetFromRow(row: Record<string, unknown>): UserLoadPresetItem {
  return {
    id: row.id as string,
    name: (row.name as string) ?? '',
    description: (row.description as string) ?? '',
    loads: (row.loads as LoadPresetLoad[] | null) ?? [],
  };
}

export function userStockItemFromRow(row: Record<string, unknown>): UserStockItem {
  return {
    id: row.id as string,
    productType: row.product_type as StockProductType,
    productModel: (row.product_model as string) ?? '',
    unitValue: Number(row.unit_value) || 0,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export function projectFromRow(row: Record<string, unknown>): SavedProject {
  return {
    id: row.id as string,
    name: (row.name as string) ?? '',
    clientId: (row.client_id as string | null) ?? null,
    address: addressFromJson(row.address),
    notes: (row.notes as string | null) ?? '',
    updatedAt: row.updated_at as string,
    status: (row.status as ProjectStatus | undefined) ?? 'draft',
    residentialOptions: residentialOptionsFromJson(row.residential_options),
    solution: (row.solution as Solution | null) ?? null,
    services: Array.isArray(row.services) ? (row.services as ProjectServiceLine[]) : [],
  };
}

/** Same shallow-merge-over-defaults idiom as residentialOptionsFromJson —
 * missing fields (an empty `{}` for a project that hasn't been configured
 * yet, or one saved before a field existed) fall back to the default
 * rather than producing a half-populated options object. */
export function commercialIndustrialOptionsFromJson(value: unknown): CommercialIndustrialOptions {
  if (!isRecord(value)) return defaultCiOptions;
  return { ...defaultCiOptions, ...value } as CommercialIndustrialOptions;
}

export function ciProjectFromRow(row: Record<string, unknown>): SavedCiProject {
  return {
    id: row.id as string,
    installationType: 'commercial_industrial',
    name: (row.name as string) ?? '',
    clientId: (row.client_id as string | null) ?? null,
    address: addressFromJson(row.address),
    notes: (row.notes as string | null) ?? '',
    updatedAt: row.updated_at as string,
    status: (row.status as ProjectStatus | undefined) ?? 'draft',
    calculationOptions: commercialIndustrialOptionsFromJson(row.calculation_options),
    calculationResult: (row.calculation_result as CommercialIndustrialResult | null) ?? null,
    calculationVersion: (row.calculation_version as string | null) ?? null,
  };
}

export function projectEventFromRow(row: Record<string, unknown>): ProjectEvent {
  return {
    id: row.id as string,
    projectId: row.project_id as string,
    actorId: (row.actor_id as string | null) ?? null,
    eventType: row.event_type as string,
    fromStatus: (row.from_status as string | null) ?? null,
    toStatus: (row.to_status as string | null) ?? null,
    message: (row.message as string | null) ?? null,
    createdAt: row.created_at as string,
  };
}

export function userServiceFromRow(row: Record<string, unknown>): UserServiceItem {
  return {
    id: row.id as string,
    name: (row.name as string) ?? '',
    unitValue: Number(row.unit_value) || 0,
    pricingUnit: (row.pricing_unit as UserServicePricingUnit) || 'project',
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}
