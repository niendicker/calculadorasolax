import type { BatteryTopology, InverterFlag, ProductDocument, ResidentialGridType } from '@/lib/types';

export interface InlineProfile {
  id: string;
  email: string;
  fullName: string;
  phone: string;
  role: 'user' | 'admin';
  companyName: string;
  companyAddress: string;
  companyLogoUrl: string;
}

export interface ProductMedia {
  model: string;
  imageUrl: string | null;
  documents: ProductDocument[];
}

export interface BatteryCatalogOption {
  id: string;
  model: string;
  capacityKwh: number;
  topology: 'HV' | 'LV';
  standardPowerKw: number | null;
  peakPowerKw: number | null;
  minSocPercent: number;
  imageUrl: string | null;
  documents: ProductDocument[];
}

export interface InverterCatalogOption {
  id: string;
  model: string;
  topology: 'HV' | 'LV' | 'BOTH';
  phases: number;
  standardPowerKva: number | null;
  peakPowerKva: number | null;
  maxPowerPerPhaseW: number | null;
  imageUrl: string | null;
  documents: ProductDocument[];
  flags: InverterFlag[];
}

export interface AccessoryCatalogOption {
  id: string;
  model: string;
  description: string | null;
  imageUrl: string | null;
  documents: ProductDocument[];
}

export interface ApprovedInverterCombo {
  gridTopology: string;
  batteryTopology: 'HV' | 'LV';
  inverterModel: string;
}

export const gridOptions: { value: ResidentialGridType; label: string; detail: string }[] = [
  { value: 'singlePhase_220', label: 'Monofásico', detail: '220V' },
  { value: 'splitPhase_220', label: 'Bifásico', detail: '220V' },
  { value: 'threePhase_220', label: 'Trifásico', detail: '220V' },
  { value: 'threePhase_380', label: 'Trifásico', detail: '380V' },
];

export const topologyLabels: Record<BatteryTopology, string> = {
  HighVoltage: 'Alta tensão (HV)',
  LowVoltage: 'Baixa tensão (LV)',
};

export const gridLabels: Record<ResidentialGridType, string> = {
  singlePhase_220: 'Monofásico 220V',
  splitPhase_220: 'Bifásico 220V',
  threePhase_220: 'Trifásico 220V',
  threePhase_380: 'Trifásico 380V',
};

export const gridTypeToApprovedTopology: Record<ResidentialGridType, '1p_220V' | '2p_220V' | '3p_220V' | '3p_380V'> = {
  singlePhase_220: '1p_220V',
  splitPhase_220: '2p_220V',
  threePhase_220: '3p_220V',
  threePhase_380: '3p_380V',
};
