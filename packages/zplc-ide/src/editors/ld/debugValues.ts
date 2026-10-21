/**
 * The values Ladder draws for the variables its elements name (LNG-006, UX-009): what the debug map says the program
 * holds, whether the user forces the variable, and a fault when the poll could not read it. The flags are the ones
 * FBD and SFC use (`Monitor.flagsOf`), so the three editors cannot disagree about which variable is forced.
 */

import type { Monitor } from '../../monitoring/useMonitor';
import { t } from '../../i18n';
import type { DebugValuesMap } from './LDElement';

export function debugValuesOf(monitor: Pick<Monitor, 'active' | 'values' | 'flagsOf'>): DebugValuesMap | undefined {
  if (!monitor.active) return undefined;
  const values: DebugValuesMap = new Map();
  for (const [variable, { reading, type }] of monitor.values) {
    const flags = monitor.flagsOf(variable);
    values.set(variable, {
      value: reading ?? null,
      type: type || null,
      address: null,
      region: null,
      size: null,
      loading: false,
      exists: true,
      error: flags?.fault ? t('editor.readFault') : null,
      forced: flags?.forced === true,
    });
  }
  return values;
}
