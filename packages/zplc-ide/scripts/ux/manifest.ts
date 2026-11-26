/**
 * Names, conditions and the manifest of a capture run (UXV-003).
 */
import type { Defect } from './detectors';
import type { Measurement } from './measurement';

export interface Surface {
  id: string;
  area: string;
  states: string[];
  reachedBy: string[];
}

export interface Condition {
  width: number;
  height: number;
  theme: 'light' | 'dark' | 'high-contrast';
  locale: 'en' | 'es';
  density: 'comfortable' | 'compact';
}

export function parseScreens(_markdown: string): Surface[] {
  return [];
}

export function conditionName(_condition: Condition): string {
  return '';
}

export function captureName(_surfaces: Surface[], _surface: string, _state: string, _condition: Condition): string {
  return '';
}

export function conditionsFor(_surface: Surface): Condition[] {
  return [];
}

export interface CaptureRecord {
  name: string;
  surface: string;
  state: string;
  condition: string;
  file: string;
  measures: { elements: number; controls: number; texts: number; focusChecked: number; focusUnchecked: number; scene: string };
  defects: Defect[];
}

export function captureRecord(_name: string, _surface: string, _state: string, _condition: Condition, _measurement: Measurement): CaptureRecord {
  throw new Error('not written yet');
}

export function manifestText(_captures: CaptureRecord[], _unreached: Array<{ surface: string; reason: string }>): string {
  return '';
}
