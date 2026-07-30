import { useEffect, useState } from 'react';
import type { createClient } from '@/lib/supabase/client';
import { flushPendingSimulations } from '@/lib/metrics-queue';
import type { CatalogItem, LoadPresetItem, ProductDocument } from '@/lib/types';
import type {
  AccessoryCatalogOption,
  ApprovedInverterCombo,
  BatteryCatalogOption,
  InlineProfile,
  InverterCatalogOption,
} from '../types';

export function useInitialData({
  supabase,
  fetchClients,
  fetchProjects,
  fetchUserLoadCatalog,
  fetchUserStockItems,
  fetchUserLoadPresets,
  fetchUserServices,
  fetchMarginSettings,
  setLoadCatalog,
  setLoadPresets,
}: {
  supabase: ReturnType<typeof createClient>;
  fetchClients: () => Promise<void>;
  fetchProjects: () => Promise<void>;
  fetchUserLoadCatalog: () => Promise<void>;
  fetchUserStockItems: () => Promise<void>;
  fetchUserLoadPresets: () => Promise<void>;
  fetchUserServices: () => Promise<void>;
  fetchMarginSettings: () => Promise<void>;
  setLoadCatalog: (catalog: CatalogItem[]) => void;
  setLoadPresets: (presets: LoadPresetItem[]) => void;
}) {
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [profile, setProfile] = useState<InlineProfile | null>(null);
  const [batteryCatalog, setBatteryCatalog] = useState<BatteryCatalogOption[]>([]);
  const [inverterCatalog, setInverterCatalog] = useState<InverterCatalogOption[]>([]);
  const [accessoryCatalog, setAccessoryCatalog] = useState<AccessoryCatalogOption[]>([]);
  const [approvedInverterCombos, setApprovedInverterCombos] = useState<ApprovedInverterCombo[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [userDataError, setUserDataError] = useState<string | null>(null);

  useEffect(() => {
    async function loadInitialData() {
      setInitialLoading(true);
      const [
        { data: userData },
        { data: catalogData },
        { data: batteryData },
        { data: inverterData },
        { data: accessoryData },
        { data: approvedSolutionsData },
        { data: presetsData },
      ] = await Promise.all([
        supabase.auth.getUser(),
        supabase
          .from('load_catalog')
          .select('id, name_pt, name_en, name_zh, power_w, category, ip_in_ratio')
          .eq('active', true)
          .order('category'),
        supabase
          .from('batteries')
          .select('id, model, nickname, capacity_kwh, topology, standard_power_kw, peak_power_kw, min_soc_percent, round_trip_efficiency_percent, initial_soh_percent, annual_soh_loss_percent, warranty_end_soh_percent, expansion_model, image_url, documents')
          .order('model'),
        supabase
          .from('inverters')
          .select('id, model, nickname, topology, phases, standard_power_kva, peak_power_kva, max_power_per_phase_w, battery_charge_efficiency_percent, battery_discharge_efficiency_percent, standby_consumption_w, max_battery_charge_power_w, max_battery_discharge_power_w, image_url, documents, flags')
          .order('model'),
        supabase
          .from('accessories')
          .select('id, model, nickname, description, image_url, documents')
          .eq('active', true)
          .order('model'),
        supabase
          .from('approved_solutions')
          .select('grid_topology, battery_topology, inverter_model')
          .eq('active', true),
        supabase.from('load_presets').select('id, name, description, loads').order('display_order'),
      ]);

      setUserEmail(userData.user?.email ?? null);
      setProfile(null);

      if (userData.user) {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('id, email, full_name, phone, role, company_name, company_address, company_logo_url')
          .eq('id', userData.user.id)
          .maybeSingle();

        setProfile({
          id: userData.user.id,
          email: profileData?.email ?? userData.user.email ?? '',
          fullName: profileData?.full_name ?? userData.user.user_metadata?.full_name ?? '',
          phone: profileData?.phone ?? userData.user.user_metadata?.phone ?? '',
          role: profileData?.role === 'admin' ? 'admin' : 'user',
          companyName: profileData?.company_name ?? '',
          companyAddress: profileData?.company_address ?? '',
          companyLogoUrl: profileData?.company_logo_url ?? '',
        });

        try {
          await Promise.all([
            fetchClients(),
            fetchProjects(),
            fetchUserLoadCatalog(),
            fetchUserStockItems(),
            fetchUserLoadPresets(),
            fetchUserServices(),
            fetchMarginSettings(),
          ]);
          setUserDataError(null);
        } catch {
          setUserDataError('Não foi possível carregar seus clientes, projetos ou cargas salvas. Verifique sua conexão e tente novamente.');
        }

        flushPendingSimulations(supabase).catch((err) => console.error(err));
      }

      if (catalogData) {
        const catalog: CatalogItem[] = catalogData.map((row) => ({
          id: row.id,
          namePt: row.name_pt,
          nameEn: row.name_en,
          nameZh: row.name_zh,
          powerW: row.power_w,
          category: row.category,
          ipInRatio: row.ip_in_ratio ?? 1,
        }));
        setLoadCatalog(catalog);
      }

      if (presetsData) {
        setLoadPresets(
          presetsData.map((row) => ({
            id: row.id,
            name: row.name,
            description: row.description,
            loads: (row.loads ?? []) as LoadPresetItem['loads'],
          }))
        );
      }

      if (batteryData) {
        setBatteryCatalog(
          batteryData.map((row) => ({
            id: row.id,
            model: row.model,
            nickname: row.nickname ?? null,
            capacityKwh: Number(row.capacity_kwh),
            topology: row.topology as 'HV' | 'LV',
            standardPowerKw: row.standard_power_kw === null ? null : Number(row.standard_power_kw),
            peakPowerKw: row.peak_power_kw === null ? null : Number(row.peak_power_kw),
            minSocPercent: Number(row.min_soc_percent ?? 10),
            roundTripEfficiencyPercent: Number(row.round_trip_efficiency_percent ?? 95),
            initialSohPercent: Number(row.initial_soh_percent ?? 100),
            annualSohLossPercent: Number(row.annual_soh_loss_percent ?? 2),
            warrantyEndSohPercent: row.warranty_end_soh_percent == null ? null : Number(row.warranty_end_soh_percent),
            expansionModel: row.expansion_model ?? null,
            imageUrl: row.image_url,
            documents: (row.documents ?? []) as ProductDocument[],
          }))
        );
      }

      if (inverterData) {
        setInverterCatalog(
          inverterData.map((row) => ({
            id: row.id,
            model: row.model,
            nickname: row.nickname ?? null,
            topology: row.topology as 'HV' | 'LV' | 'BOTH',
            phases: Number(row.phases),
            standardPowerKva: row.standard_power_kva === null ? null : Number(row.standard_power_kva),
            peakPowerKva: row.peak_power_kva === null ? null : Number(row.peak_power_kva),
            maxPowerPerPhaseW: row.max_power_per_phase_w === null ? null : Number(row.max_power_per_phase_w),
            batteryChargeEfficiencyPercent: Number(row.battery_charge_efficiency_percent ?? 97),
            batteryDischargeEfficiencyPercent: Number(row.battery_discharge_efficiency_percent ?? 97),
            standbyConsumptionW: Number(row.standby_consumption_w ?? 0),
            maxBatteryChargePowerW: row.max_battery_charge_power_w == null ? null : Number(row.max_battery_charge_power_w),
            maxBatteryDischargePowerW: row.max_battery_discharge_power_w == null ? null : Number(row.max_battery_discharge_power_w),
            imageUrl: row.image_url,
            documents: (row.documents ?? []) as ProductDocument[],
            flags: (row.flags ?? []) as InverterCatalogOption['flags'],
          }))
        );
      }

      if (accessoryData) {
        setAccessoryCatalog(
          accessoryData.map((row) => ({
            id: row.id,
            model: row.model,
            nickname: row.nickname ?? null,
            description: row.description,
            imageUrl: row.image_url,
            documents: (row.documents ?? []) as ProductDocument[],
          }))
        );
      }

      if (approvedSolutionsData) {
        setApprovedInverterCombos(
          approvedSolutionsData.map((row) => ({
            gridTopology: row.grid_topology,
            batteryTopology: row.battery_topology as 'HV' | 'LV',
            inverterModel: row.inverter_model,
          }))
        );
      }
      setInitialLoading(false);
    }

    loadInitialData();
  }, [
    setLoadCatalog,
    setLoadPresets,
    supabase,
    fetchClients,
    fetchProjects,
    fetchUserLoadCatalog,
    fetchUserStockItems,
    fetchUserLoadPresets,
    fetchUserServices,
    fetchMarginSettings,
  ]);

  useEffect(() => {
    function handleOnline() {
      flushPendingSimulations(supabase).catch((err) => console.error(err));
    }
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [supabase]);

  async function retryUserData() {
    try {
      await Promise.all([fetchClients(), fetchProjects(), fetchUserLoadCatalog(), fetchUserStockItems()]);
      setUserDataError(null);
    } catch {
      setUserDataError('Não foi possível carregar seus clientes, projetos ou cargas salvas. Verifique sua conexão e tente novamente.');
    }
  }

  return {
    userEmail,
    setUserEmail,
    profile,
    setProfile,
    batteryCatalog,
    inverterCatalog,
    accessoryCatalog,
    approvedInverterCombos,
    initialLoading,
    userDataError,
    retryUserData,
  };
}
