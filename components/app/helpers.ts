import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js';
import { getCalculationErrorMessage, getNetworkErrorMessage } from '@/lib/calculation-error-messages';

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
