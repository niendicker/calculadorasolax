// Supabase row -> domain type mappers, shared across store slices. Kept
// separate from the slices themselves since several of them map rows from
// their own table (clients, projects, user_load_catalog, etc.) but none of
// this logic depends on Zustand's set/get — it's pure data shaping.

import type {
  Client,
  ProjectServiceLine,
  ResidentialOptions,
  SavedProject,
  Solution,
  StockProductType,
  UserLoadCatalogItem,
  UserLoadPresetItem,
  UserServiceItem,
  UserStockItem,
} from '@/lib/types';
import type { LoadPresetLoad } from '@/lib/types';

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
    address: (row.address as string | null) ?? '',
    notes: (row.notes as string | null) ?? '',
    updatedAt: row.updated_at as string,
    residentialOptions: row.residential_options as ResidentialOptions,
    solution: (row.solution as Solution | null) ?? null,
    services: Array.isArray(row.services) ? (row.services as ProjectServiceLine[]) : [],
  };
}

export function userServiceFromRow(row: Record<string, unknown>): UserServiceItem {
  return {
    id: row.id as string,
    name: (row.name as string) ?? '',
    unitValue: Number(row.unit_value) || 0,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}
