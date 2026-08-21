import type { ResidentialOptions } from '@/lib/types';

/** Payload accepted by the server-side residential calculation route. */
export type ResidentialCalculationRequest = ResidentialOptions & {
  batteryModel: string;
  projectName?: string | null;
  peakW?: number;
  dailyKwh?: number;
  isDemo?: boolean;
};

/** Shape persisted by app_simulations and retried by the browser queue. */
export interface PendingSimulationPayload {
  user_id: string | null;
  project_name: string | null;
  topology: string | null;
  grid_type: string | null;
  peak_w: number;
  daily_kwh: number;
  loads: unknown;
  inverter_model: string | null;
  battery_model: string | null;
  accessories: unknown;
  solution_code: string | null;
}
