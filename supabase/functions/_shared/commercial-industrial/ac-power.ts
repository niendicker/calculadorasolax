/** Power factor is explicit: active energy must never be integrated from kVA. */
export function validateAcPowerFactor(powerFactor: number): void {
  if (!Number.isFinite(powerFactor) || powerFactor <= 0 || powerFactor > 1) {
    throw new Error('Informe um fator de potência CA maior que zero e até 1.');
  }
}

/** Signed power is supported for import/export and charge/discharge charts. */
export function activeKwToApparentKva(powerKw: number, powerFactor: number): number {
  validateAcPowerFactor(powerFactor);
  if (!Number.isFinite(powerKw)) throw new Error('Potência ativa CA inválida.');
  return powerKw / powerFactor;
}

/** Convert UI/import values to active power before dispatch or kWh integration. */
export function apparentKvaToActiveKw(powerKva: number, powerFactor: number): number {
  validateAcPowerFactor(powerFactor);
  if (!Number.isFinite(powerKva)) throw new Error('Potência aparente CA inválida.');
  return powerKva * powerFactor;
}

/** Legacy projects used active power throughout; unity preserves their values. */
export function projectAcPowerFactor(value?: number): number {
  const factor = value ?? 1;
  validateAcPowerFactor(factor);
  return factor;
}

export function formatAcPower(powerKw: number, powerFactor = 1, digits = 1): string {
  return `${activeKwToApparentKva(powerKw, powerFactor).toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits })} kVA`;
}

/** Engine warnings use decimal-point active powers; apply only to CA warning text. */
export function formatAcPowerWarning(message: string, powerFactor = 1): string {
  return message.replace(/(-?\d+(?:\.\d+)?)\s+kW\b/g, (_match, value: string) => formatAcPower(Number(value), powerFactor));
}
