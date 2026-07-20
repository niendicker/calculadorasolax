import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js';
import { getCalculationErrorMessage, getNetworkErrorMessage } from '@/lib/calculation-error-messages';
import type { Solution, StockProductType, UserStockItem, WhiteTariffConfig } from '@/lib/types';

export function parseAccessoryLabel(raw: string) {
  const optional = /\s*\(opcional\)\s*$/.test(raw);
  const withoutOptional = optional ? raw.replace(/\s*\(opcional\)\s*$/, '') : raw;
  const qtyMatch = withoutOptional.match(/^(.*)\s+x(\d+)$/);
  return {
    model: qtyMatch ? qtyMatch[1] : withoutOptional,
    qty: qtyMatch ? Number(qtyMatch[2]) : 1,
    optional,
  };
}

export interface SystemCostEstimate {
  totalCost: number;
  pricedItemsCount: number;
  totalItemsCount: number;
  /** false when at least one item in the solution has no price in the user's stock. */
  isComplete: boolean;
}

/** Sums the user's own stock price for every model in the solution (inverter,
 * battery, each accessory) by quantity. Items missing a price are skipped —
 * isComplete tells the caller whether the total should be shown as partial. */
export function calculateSystemCost(solution: Solution, userStockItems: UserStockItem[]): SystemCostEstimate {
  function priceFor(productType: StockProductType, model: string): number | undefined {
    return userStockItems.find((item) => item.productType === productType && item.productModel === model)
      ?.unitValue;
  }

  const items: { productType: StockProductType; model: string; qty: number }[] = [
    { productType: 'inverter', model: solution.inverterModel, qty: solution.inverterQty ?? 1 },
    { productType: 'battery', model: solution.batteryModel, qty: solution.batteryQty },
    ...solution.accessories.map((accessory) => {
      const { model, qty } = parseAccessoryLabel(accessory);
      return { productType: 'accessory' as const, model, qty };
    }),
  ];

  let totalCost = 0;
  let pricedItemsCount = 0;

  for (const item of items) {
    const unitValue = priceFor(item.productType, item.model);
    if (unitValue !== undefined) {
      totalCost += unitValue * item.qty;
      pricedItemsCount += 1;
    }
  }

  return {
    totalCost,
    pricedItemsCount,
    totalItemsCount: items.length,
    isComplete: pricedItemsCount === items.length,
  };
}

export interface BatteryQuantityPart {
  model: string;
  qty: number;
}

/** Some battery lines scale via a "Master" unit plus electrically-identical
 * "Slave"/expansion units instead of more of the same model (e.g. "T58 V2
 * Master" + "T58 Slave"). Energy/power math already treats batteryQty as N
 * identical units, which holds true either way — this only changes what's
 * displayed for units 2..N, using the Master row's expansionModel. */
export function batteryQuantityBreakdown(
  model: string,
  quantity: number,
  batteryCatalog: { model: string; expansionModel?: string | null }[]
): BatteryQuantityPart[] {
  const expansionModel = batteryCatalog.find((battery) => battery.model === model)?.expansionModel;
  if (expansionModel && quantity > 1) {
    return [
      { model, qty: 1 },
      { model: expansionModel, qty: quantity - 1 },
    ];
  }
  return [{ model, qty: quantity }];
}

export function formatCurrencyBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

export interface TariffSavingsEstimate {
  monthlySavings: number;
  annualSavings: number;
  businessDaysPerMonth: number;
}

/** Tarifa Branca's peak surcharge applies on business days — used as the
 * standard monthly multiplier for the savings estimate. */
export const TARIFF_BUSINESS_DAYS_PER_MONTH = 22;

/** Estimated savings from shifting the white-tariff window's energy off the
 * grid, using the spread the customer entered. Null when white_tariff isn't configured. */
export function calculateTariffSavings(whiteTariff: WhiteTariffConfig | null): TariffSavingsEstimate | null {
  if (!whiteTariff) return null;

  const dailySavings = (whiteTariff.requiredEnergyWh / 1000) * whiteTariff.tariffSpreadPerKwh;
  const monthlySavings = dailySavings * TARIFF_BUSINESS_DAYS_PER_MONTH;

  return {
    monthlySavings,
    annualSavings: monthlySavings * 12,
    businessDaysPerMonth: TARIFF_BUSINESS_DAYS_PER_MONTH,
  };
}

/** Turns a supabase.functions.invoke() error into a specific, actionable
 * message using the Edge Function's stable error code, falling back to a
 * network-specific message when the request never reached the function. */
export async function resolveCalculationErrorMessage(functionError: unknown): Promise<string> {
  if (functionError instanceof FunctionsHttpError) {
    try {
      const body = await functionError.context.json();
      return getCalculationErrorMessage(body?.error);
    } catch {
      return getCalculationErrorMessage(undefined);
    }
  }

  if (functionError instanceof FunctionsFetchError) {
    return getNetworkErrorMessage();
  }

  return getCalculationErrorMessage(undefined);
}
