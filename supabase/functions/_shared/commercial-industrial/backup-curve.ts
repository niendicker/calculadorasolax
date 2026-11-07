import type { CiBackupCurveSelection, LoadCurve } from './types.ts';

/** Re-evaluates the saved time window against current consumption, never a stale aggregate. */
export function resolveBackupCurve(selection: CiBackupCurveSelection, curve: LoadCurve | null | undefined) {
  if (!curve || !selection || !['profile', 'average', 'maximum', 'manual'].includes(selection.method)) {
    throw new Error('Selecione um intervalo válido na curva de consumo para configurar o backup.');
  }
  const start = Date.parse(selection.startTimestamp);
  const end = Date.parse(selection.endTimestampExclusive);
  const step = curve.resolutionMinutes * 60_000;
  const count = (end - start) / step;
  if (!Number.isFinite(start) || !Number.isFinite(end) || step <= 0 || !Number.isSafeInteger(count) || count <= 0 || count > curve.points.length) {
    throw new Error('O intervalo de backup não corresponde à curva atual. Selecione novamente o período.');
  }
  const samples = new Map<number, number>();
  for (const point of curve.points) {
    const time = Date.parse(point.timestamp);
    if (time < start || time >= end || !Number.isFinite(time)) continue;
    if (samples.has(time) || !Number.isFinite(point.powerKw) || point.powerKw < 0) {
      throw new Error('O intervalo de backup contém consumo inválido ou horários duplicados.');
    }
    samples.set(time, point.powerKw);
  }
  let totalKw = 0;
  let peakKw = 0;
  const powerProfileKw:number[]=[];
  for (let i = 0; i < count; i++) {
    const power = samples.get(start + i * step);
    if (power === undefined) throw new Error('A curva não cobre todo o intervalo de backup. Selecione novamente o período.');
    totalKw += power;
    powerProfileKw.push(power);
    peakKw = Math.max(peakKw, power);
  }
  const durationHours = count * curve.resolutionMinutes / 60;
  const averageKw = totalKw / count;
  const manual = selection.manualPowerKw;
  if (selection.method === 'manual' && (typeof manual !== 'number' || !Number.isFinite(manual) || manual <= 0)) {
    throw new Error('Informe uma potência manual de backup maior que zero.');
  }
  const continuousPowerKw = selection.method === 'manual' ? manual! : selection.method === 'average' ? averageKw : peakKw;
  const energyKwh = selection.method === 'profile' || selection.method === 'average'
    ? totalKw * curve.resolutionMinutes / 60
    : continuousPowerKw * durationHours;
  if(![continuousPowerKw,energyKwh,averageKw].every(Number.isFinite))throw new Error('Potência ou energia do intervalo de backup excede o limite numérico.');
  return { durationHours, averageKw, peakKw, continuousPowerKw, energyKwh, powerProfileKw, requiredPeakKw: selection.method === 'manual' ? continuousPowerKw : peakKw };
}
