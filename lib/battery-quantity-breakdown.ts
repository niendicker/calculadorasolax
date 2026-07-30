// Shared by the customer-facing app (components/app/helpers.ts) and the admin
// panel (components/admin/helpers.ts) — unlike the Deno Edge Function, both
// run in the same Next.js bundle, so this is one real implementation instead
// of a manually-kept-in-sync copy.

export interface BatteryQuantityPart {
  model: string;
  qty: number;
}

/** Some battery lines scale via a "Master" unit plus electrically-identical
 * "Slave"/expansion units instead of more of the same model (e.g. "T58 V2
 * Master" + "T58 Slave"). Energy/power math already treats quantity as N
 * identical units, which holds true either way — this only changes what's
 * displayed for units 2..N, using the Master row's expansionModel.
 *
 * Each battery port is its own physical string and needs its own Master at
 * the head of the chain — mastersNeeded should be inverterQty × the
 * solution's battery ports in use, not a flat 1, or a multi-port/
 * multi-inverter solution ends up short a Master in this breakdown. Defaults
 * to 1 for callers that don't have that data (e.g. older saved projects). */
export function batteryQuantityBreakdown(
  model: string,
  quantity: number,
  batteryCatalog: { model: string; expansionModel?: string | null }[],
  mastersNeeded = 1
): BatteryQuantityPart[] {
  const expansionModel = batteryCatalog.find((battery) => battery.model === model)?.expansionModel;
  if (!expansionModel || quantity <= 1) return [{ model, qty: quantity }];

  const masters = Math.min(quantity, Math.max(1, mastersNeeded));
  const slaves = quantity - masters;
  if (slaves <= 0) return [{ model, qty: quantity }];

  return [
    { model, qty: masters },
    { model: expansionModel, qty: slaves },
  ];
}

/** Expansion/Slave models (e.g. "T58 Slave") only ever exist as units 2..N of
 * some other "Master" battery's bank — they aren't a real standalone base
 * model, so they must never be offered directly wherever an admin or user
 * picks a battery to build/configure a solution around. */
export function expansionModelSet(batteryCatalog: { expansionModel?: string | null }[]): Set<string> {
  return new Set(
    batteryCatalog.map((battery) => battery.expansionModel).filter((model): model is string => Boolean(model))
  );
}
