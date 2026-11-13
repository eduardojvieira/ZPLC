/**
 * The one scaling of a numeric plant signal between the program's raw value and the plant's engineering value (rules R-S1 to
 * R-S3 of plan M2). Pure; basic operators and `min`, `max`, `round`, `fround` only, so every platform computes the same value.
 */
import type { PlantSignal, SignalRange } from '../plants/plantMap';
import type { PlantSignalDef } from './contracts';

export type ScaledSignal = { type: 'INT' | 'REAL'; range: SignalRange };

const clamp = (value: number, low: number, high: number): number => Math.max(low, Math.min(high, value));

/** Raw program value to engineering value. Rule R-S1: the raw value saturates at the raw range. */
export function toEngineering({ range: r }: ScaledSignal, raw: number): number {
  const clamped = clamp(raw, r.raw_min, r.raw_max);
  return r.eng_min + ((clamped - r.raw_min) / (r.raw_max - r.raw_min)) * (r.eng_max - r.eng_min);
}

/** Engineering value to the raw value the program variable holds. Rule R-S2: saturates, never wraps. */
export function toRaw({ type, range: r }: ScaledSignal, eng: number): number {
  const clamped = clamp(eng, r.eng_min, r.eng_max);
  const raw = r.raw_min + ((clamped - r.eng_min) / (r.eng_max - r.eng_min)) * (r.raw_max - r.raw_min);
  return type === 'INT' ? clamp(Math.round(raw), r.raw_min, r.raw_max) : Math.fround(raw);
}

/** Located problems of a map signal against the part's signal definition. Rule R-S3. Empty means valid. */
export function validateScaling(def: PlantSignalDef, signal: PlantSignal): string[] {
  const at = `plant map.signals.${signal.name}`;
  if (def.type === 'BOOL') return signal.type === 'BOOL' ? [] : [`${at}.type: the part signal is BOOL, the map says ${signal.type}`];
  if (signal.type === 'BOOL') return [`${at}.type: the part signal is numeric, the map says BOOL`];
  const r = signal.range;
  if (!def.range) return [`${at}: the part signal has no range`];
  if (!r) return [`${at}.range: is required for a numeric signal`];
  const problems: string[] = [];
  for (const [key, want] of [
    ['eng_min', def.range.min],
    ['eng_max', def.range.max],
  ] as const)
    if (r[key] !== want) problems.push(`${at}.range.${key}: ${r[key]} differs from the range ${want} of the part signal`);
  if ((def.unit ?? '') !== r.unit) problems.push(`${at}.range.unit: ${r.unit} differs from the unit ${def.unit ?? ''} of the part signal`);
  if (signal.type === 'INT' && (r.raw_min < -32768 || r.raw_max > 32767))
    problems.push(`${at}.range.raw_max: an INT signal's raw range must fit -32768..32767`);
  return problems;
}
