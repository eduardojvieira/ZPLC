import type { ConfigField, FactValue, ScenePart } from '../../contracts';
import { cfg, cfgNumber } from './items';
import type { PartRuntime, RuntimePartDefinition } from './items';
import { marker } from './sensors';

const noFacts = (): Record<string, FactValue> => ({});
const noAction = (part: ScenePart) => (action: string) => {
  throw new Error(`part "${part.name}" has no action "${action}"`);
};

function stackLightRuntime(part: ScenePart): PartRuntime {
  const lamps = { red: false, amber: false, green: false };
  return {
    build() {},
    beforeStep(commands) {
      lamps.red = commands[`${part.name}.red`] === true;
      lamps.amber = commands[`${part.name}.amber`] === true;
      lamps.green = commands[`${part.name}.green`] === true;
    },
    afterStep() {},
    sense: () => ({}),
    facts: noFacts,
    act: noAction(part),
    views: () => [
      {
        id: part.id,
        part: 'stack-light',
        name: part.name,
        pose: marker(part, 'stack-light', [0.08, 0.3, 0.08]),
        state: { ...lamps },
        signals: { ...lamps },
      },
    ],
  };
}

const UNITS = ['%', 'm', 'L/s', 'bar', 'V', 'C'] as const;
const displayConfig: Readonly<Record<string, ConfigField>> = {
  type: { kind: 'enum', values: ['REAL', 'INT'], default: 'REAL' },
  min: { kind: 'number', min: -1000, max: 1000, default: 0 },
  max: { kind: 'number', min: -1000, max: 1000, default: 100 },
  unit: { kind: 'enum', values: UNITS, default: '%' },
  decimals: { kind: 'number', min: 0, max: 3, default: 1 },
};

/** The text a person reads: fixed decimals, a space and the unit; never "-0.0". Locale-neutral (toFixed). */
function formatValue(value: number, decimals: number, unit: string): string {
  const fixed = value.toFixed(decimals);
  return `${Number(fixed) === 0 ? fixed.replace('-', '') : fixed} ${unit}`;
}

function displayRuntime(part: ScenePart): PartRuntime {
  const min = cfgNumber(part, displayConfig, 'min');
  const max = cfgNumber(part, displayConfig, 'max');
  const decimals = cfgNumber(part, displayConfig, 'decimals');
  const unit = String(cfg(part, displayConfig, 'unit'));
  let value = Math.min(Math.max(0, min), max);
  return {
    build() {},
    beforeStep(commands) {
      const v = commands[`${part.name}.value`];
      if (typeof v === 'number' && Number.isFinite(v)) value = Math.min(Math.max(v, min), max);
    },
    afterStep() {},
    sense: () => ({}),
    facts: noFacts,
    act: noAction(part),
    views: () => [
      {
        id: part.id,
        part: 'numeric-display',
        name: part.name,
        pose: marker(part, 'numeric-display', [0.2, 0.08, 0.04]),
        state: { value, min, max, fraction: max > min ? (value - min) / (max - min) : 0, unit, text: formatValue(value, decimals, unit) },
        signals: { value },
      },
    ],
  };
}

/** Stack light and numeric display: what the program shows to a person. */
export const indicatorParts: readonly RuntimePartDefinition[] = [
  {
    id: 'stack-light',
    family: 'panel',
    names: { en: 'Stack light', es: 'Torre de luces' },
    config: {},
    signals: (part) => ['red', 'amber', 'green'].map((s) => ({ name: `${part.name}.${s}`, direction: 'command', type: 'BOOL' })),
    actions: [],
    snapPoints: () => [],
    doc: {
      en: 'A three-lamp tower the program lights. Signals: red, amber, green, each on its own.',
      es: 'Una torre de tres luces que el programa enciende. Señales: red, amber, green, cada una por separado.',
    },
    runtime: stackLightRuntime,
  },
  {
    id: 'numeric-display',
    family: 'panel',
    names: { en: 'Numeric display', es: 'Indicador numérico' },
    config: displayConfig,
    signals: (part) => [
      {
        name: `${part.name}.value`,
        direction: 'command',
        type: cfg(part, displayConfig, 'type') === 'INT' ? 'INT' : 'REAL',
        unit: String(cfg(part, displayConfig, 'unit')),
        range: { min: cfgNumber(part, displayConfig, 'min'), max: cfgNumber(part, displayConfig, 'max') },
      },
    ],
    actions: [],
    snapPoints: () => [],
    doc: {
      en: 'A display that shows a number the program sends, clamped to its range, with its decimals and unit. Signal: value (REAL or INT).',
      es:
        'Un indicador que muestra un número que envía el programa, limitado a su rango, con sus decimales y su unidad. Señal: value ' +
        '(REAL o INT).',
    },
    runtime: displayRuntime,
  },
];
