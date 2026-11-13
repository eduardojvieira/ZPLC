import type { ConfigField, FactValue, PlantSignalDef, ScenePart } from '../../contracts';
import { cfg, cfgNumber, type RuntimePartDefinition } from './items';
import type { OperableRuntime } from './panel';
import { marker } from './sensors';

const noFacts = (): Record<string, FactValue> => ({});
const noAction = (part: ScenePart, known: readonly string[]) => (action: string) => {
  throw new Error(`part "${part.name}" has no action "${action}"; it has: ${known.join(', ') || 'none'}`);
};

const selectorConfig: Record<string, ConfigField> = {
  positions: { kind: 'number', min: 2, max: 4, default: 3 },
  output: { kind: 'enum', values: ['contacts', 'integer'], default: 'contacts' },
};
const potConfig: Record<string, ConfigField> = {
  min: { kind: 'number', min: -1000, max: 1000, default: 0 },
  max: { kind: 'number', min: -1000, max: 1000, default: 100 },
  initial: { kind: 'number', min: -1000, max: 1000, default: 0 },
  unit: { kind: 'enum', values: ['%', 'm', 'L/s', 'bar', 'V', 'C'], default: '%' },
};

const positionsOf = (part: ScenePart) => Math.round(cfgNumber(part, selectorConfig, 'positions'));
const integerOutput = (part: ScenePart) => cfg(part, selectorConfig, 'output') === 'integer';
// ponytail: a pot whose max is not above its min is a point range (fraction 0); the schema limits cannot relate two fields.
const potRange = (part: ScenePart) => {
  const min = cfgNumber(part, potConfig, 'min');
  return { min, max: Math.max(min, cfgNumber(part, potConfig, 'max')) };
};
const potUnit = (part: ScenePart) => String(cfg(part, potConfig, 'unit'));

function selectorRuntime(part: ScenePart): OperableRuntime {
  const n = positionsOf(part);
  const integer = integerOutput(part);
  let position = 0;
  let stuck = false;
  const contact = (k: number) => `${part.name}.pos${k}`;
  const contacts = () => Object.fromEntries(Array.from({ length: n }, (_, k) => [contact(k), k === position]));
  return {
    build() {},
    beforeStep() {},
    afterStep() {},
    operate(signal, value) {
      if (integer) {
        if (signal !== `${part.name}.position`) return false;
        if (typeof value !== 'number' || !Number.isInteger(value)) throw new RangeError(`plant: ${signal} ${value} must be an integer`);
        if (value > n - 1) throw new RangeError(`plant: ${signal} ${value} is above the limit ${n - 1}`);
        if (value < 0) throw new RangeError(`plant: ${signal} ${value} is below the limit 0`);
        if (!stuck) position = value;
        return true;
      }
      const k = Array.from({ length: n }, (_, i) => i).find((i) => contact(i) === signal);
      if (k === undefined) return false;
      if (!stuck && (value === true || (typeof value === 'number' && value !== 0))) position = k;
      return true;
    },
    sense: () => (integer ? { [`${part.name}.position`]: position } : contacts()),
    facts: noFacts,
    act: (action) => {
      if (action !== 'stuck') return noAction(part, ['stuck'])(action);
      stuck = true;
    },
    views: () => [
      {
        id: part.id,
        part: 'selector-switch',
        name: part.name,
        pose: marker(part, 'selector-switch', [0.06, 0.06, 0.06]),
        state: { position, positions: n },
        signals: integer ? { [`${part.name}.position`]: position } : contacts(),
      },
    ],
  };
}

function estopRuntime(part: ScenePart): OperableRuntime {
  let pressed = false;
  let wireBreak = false;
  const ok = () => !pressed && !wireBreak;
  return {
    build() {},
    beforeStep() {},
    afterStep() {},
    operate(signal, value) {
      if (signal !== `${part.name}.pressed`) return false;
      pressed = value === true || (typeof value === 'number' && value !== 0);
      return true;
    },
    sense: () => ({ [`${part.name}.pressed`]: pressed, [`${part.name}.ok`]: ok() }),
    facts: noFacts,
    act: (action) => {
      if (action !== 'wireBreak') return noAction(part, ['wireBreak'])(action);
      wireBreak = true;
    },
    views: () => [
      {
        id: part.id,
        part: 'emergency-stop',
        name: part.name,
        pose: marker(part, 'emergency-stop', [0.08, 0.05, 0.08]),
        state: { pressed, ok: ok() },
        signals: { [`${part.name}.pressed`]: pressed, [`${part.name}.ok`]: ok() },
      },
    ],
  };
}

function potRuntime(part: ScenePart): OperableRuntime {
  const { min, max } = potRange(part);
  const unit = potUnit(part);
  const name = `${part.name}.value`;
  let value = Math.min(max, Math.max(min, cfgNumber(part, potConfig, 'initial')));
  let stuck = false;
  return {
    build() {},
    beforeStep() {},
    afterStep() {},
    operate(signal, v) {
      if (signal !== name) return false;
      if (typeof v !== 'number' || !Number.isFinite(v)) throw new RangeError(`plant: ${signal} ${v} must be a finite number`);
      if (v > max) throw new RangeError(`plant: ${signal} ${v} is above the limit ${max} ${unit}`);
      if (v < min) throw new RangeError(`plant: ${signal} ${v} is below the limit ${min} ${unit}`);
      if (!stuck) value = v;
      return true;
    },
    sense: () => ({ [name]: value }),
    facts: noFacts,
    act: (action) => {
      if (action !== 'stuck') return noAction(part, ['stuck'])(action);
      stuck = true;
    },
    views: () => [
      {
        id: part.id,
        part: 'potentiometer',
        name: part.name,
        pose: marker(part, 'potentiometer', [0.06, 0.06, 0.06]),
        state: { value, min, max, fraction: max > min ? (value - min) / (max - min) : 0, unit, text: `${value.toFixed(1)} ${unit}` },
        signals: { [name]: value },
      },
    ],
  };
}

const selectorSignals = (part: ScenePart): PlantSignalDef[] => {
  const n = positionsOf(part);
  return integerOutput(part)
    ? [{ name: `${part.name}.position`, direction: 'sensor', type: 'INT', range: { min: 0, max: n - 1 } }]
    : Array.from({ length: n }, (_, k) => ({ name: `${part.name}.pos${k}`, direction: 'sensor', type: 'BOOL' }));
};

/** Panel parts a person operates by pointer or keyboard: selector switch, emergency stop, potentiometer (VIS-010). */
export const operableParts: readonly RuntimePartDefinition[] = [
  {
    id: 'selector-switch',
    family: 'panel',
    names: { en: 'Selector switch', es: 'Selector' },
    config: selectorConfig,
    signals: selectorSignals,
    actions: ['stuck'],
    snapPoints: () => [],
    doc: {
      en:
        'A rotary selector with 2 to 4 positions. Output "contacts": one BOOL contact per position (pos0, pos1, ...), only the ' +
        'selected one is TRUE. Output "integer": one INT signal, position, from 0 to positions - 1. Fault action: stuck (operation is ' +
        'ignored).',
      es:
        'Un selector rotativo de 2 a 4 posiciones. Salida "contacts": un contacto BOOL por posición (pos0, pos1, ...), solo el ' +
        'seleccionado es TRUE. Salida "integer": una señal INT, position, de 0 a positions - 1. Acción de falla: stuck (se ignora la ' +
        'operación).',
    },
    runtime: selectorRuntime,
  },
  {
    id: 'emergency-stop',
    family: 'panel',
    names: { en: 'Emergency stop', es: 'Paro de emergencia' },
    config: {},
    signals: (part) => [
      { name: `${part.name}.pressed`, direction: 'sensor', type: 'BOOL' },
      { name: `${part.name}.ok`, direction: 'sensor', type: 'BOOL' },
    ],
    actions: ['wireBreak'],
    snapPoints: () => [],
    doc: {
      en:
        'A latching mushroom button. Signals: pressed (TRUE once pushed, until it is twisted to release) and ok (the normally closed ' +
        'contact: TRUE while released). Fault action: wireBreak (ok reads FALSE as if the wire were cut).',
      es:
        'Un botón de seta con enclavamiento. Señales: pressed (TRUE al pulsarlo, hasta que se gira para liberarlo) y ok (el contacto ' +
        'normalmente cerrado: TRUE mientras está liberado). Acción de falla: wireBreak (ok lee FALSE como si el cable estuviera cortado).',
    },
    runtime: estopRuntime,
  },
  {
    id: 'potentiometer',
    family: 'panel',
    names: { en: 'Potentiometer', es: 'Potenciómetro' },
    config: potConfig,
    signals: (part) => [{ name: `${part.name}.value`, direction: 'sensor', type: 'REAL', unit: potUnit(part), range: potRange(part) }],
    actions: ['stuck'],
    snapPoints: () => [],
    doc: {
      en:
        'A knob a person turns between min and max. Signal: value, a REAL in the configured unit, starting at initial. Fault action: ' +
        'stuck (operation is ignored).',
      es:
        'Una perilla que una persona gira entre min y max. Señal: value, un REAL en la unidad configurada, que parte en initial. ' +
        'Acción de falla: stuck (se ignora la operación).',
    },
    runtime: potRuntime,
  },
];
