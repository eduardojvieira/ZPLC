import type { ConfigField, FactValue, PartView, PlantSignalDef, ScenePart, SnapPoint, Vec3 } from '../../contracts';
import type { PhysicsWorld } from '../world';
import { cfgNumber, rotateY, trackedItems, type PartRuntime, type RuntimePartDefinition } from './items';
import { marker } from './sensors';

/** Plant step in seconds-free form: the scale counts steps of PLANT_STEP_MS (5 ms). */
const STEP_MS = 5;
/** An item whose speed is at most this (m/s) is at rest for the scale (R4-D3). */
const REST_SPEED_MPS = 0.05;
const REST_SPEED_SQ = REST_SPEED_MPS * REST_SPEED_MPS;
const MAX_CODE = 9;

/** Rounds to a multiple of `step` with the correctly rounded `Math.round` (a bit-exact reading). */
const roundTo = (v: number, step: number): number => Math.round(v / step) * step;
const clamp = (v: number, max: number): number => Math.min(Math.max(v, 0), max);

/** The footprint of a part: local half sizes and the world axes of local +x and +z (build-time trig only, as `rotateY` always did). */
function frame(part: ScenePart) {
  const [x0, x1] = rotateY(part.rotationYDeg, 1, 0);
  const [z0, z1] = rotateY(part.rotationYDeg, 0, 1);
  const p = part.position;
  return {
    ux: [x0, x1] as const,
    uz: [z0, z1] as const,
    /** Local (x, z) of a world point relative to the part position. */
    local: (w: Vec3): [number, number] => [(w[0] - p[0]) * x0 + (w[2] - p[2]) * x1, (w[0] - p[0]) * z0 + (w[2] - p[2]) * z1],
  };
}

const corners = (halfX: number, halfZ: number): readonly SnapPoint[] =>
  (
    [
      [halfX, halfZ],
      [halfX, -halfZ],
      [-halfX, halfZ],
      [-halfX, -halfZ],
    ] as const
  ).map(([x, z], i) => ({ name: `corner${i}`, position: [x, 0, z] as const, normalYDeg: 0, accepts: [] }));

const unknownAction = (part: ScenePart, action: string): Error => new Error(`part "${part.name}" has no action "${action}"`);

interface Reading {
  /** Reading for this step before faults, already inside its range. */
  raw: number;
  detect: boolean;
  stable?: boolean;
}

/**
 * What the three sensors share: a sampling function run once per step after the world step, the fault flags, and the views.
 * `sample` reads the world in creation order and returns the raw reading; `offset` is the readingOffset amount (0 = no such fault).
 */
function numericRuntime(
  part: ScenePart,
  o: {
    names: { reading: string; extra?: string };
    max: number;
    offset: number;
    viewPart: string;
    size: Vec3;
    text: (reading: number, stable: boolean) => string;
    sample: (world: PhysicsWorld) => Reading;
    /** Fault actions that change the published reading, as a map from action to reading transform. */
    faults: Readonly<Record<string, (reading: number) => number>>;
    countEdges: boolean;
  },
): PartRuntime {
  const n = part.name;
  let world: PhysicsWorld | undefined;
  let last: Reading = { raw: 0, detect: false, stable: false };
  let stuck: number | undefined;
  let offsetOn = false;
  let transform: ((reading: number) => number) | undefined;
  let count = 0;
  const reading = (): number => {
    if (stuck !== undefined) return stuck;
    const r = offsetOn ? Math.min(last.raw + o.offset, o.max) : last.raw;
    return transform ? transform(r) : r;
  };
  const sensed = (): Record<string, boolean | number> => ({
    [`${n}.${o.names.reading}`]: reading(),
    [`${n}.${o.names.extra ?? 'detect'}`]: o.names.extra ? (last.stable ?? false) : last.detect,
  });
  return {
    build(w) {
      world = w;
    },
    beforeStep() {},
    afterStep() {
      if (!world) return;
      const next = o.sample(world);
      if (next.detect && !last.detect) count += 1;
      last = next;
    },
    sense: sensed,
    facts: (): Record<string, FactValue> => (o.countEdges ? { [`count:${n}`]: count } : {}),
    act(action) {
      if (action === 'readingStuck' && o.offset > 0) stuck = reading();
      else if (action === 'readingOffset' && o.offset > 0) offsetOn = true;
      else if (o.faults[action]) transform = o.faults[action];
      else throw unknownAction(part, action);
    },
    views(): readonly PartView[] {
      const r = reading();
      return [
        {
          id: part.id,
          part: o.viewPart,
          name: n,
          pose: marker(part, o.viewPart, o.size),
          state: { text: o.text(r, last.stable ?? false), fraction: o.max > 0 ? r / o.max : 0, detect: last.detect, count },
          signals: sensed(),
        },
      ];
    },
  };
}

// ---- Light array (R4-D2) ----

const ARRAY_FIELDS: Readonly<Record<string, ConfigField>> = {
  beams: { kind: 'number', min: 4, max: 32, default: 12 },
  pitchM: { kind: 'number', min: 0.025, max: 0.1, default: 0.05, unit: 'm' },
  spanM: { kind: 'number', min: 0.4, max: 1.2, default: 0.8, unit: 'm' },
};
const arrayNum = (part: ScenePart, key: string): number => cfgNumber(part, ARRAY_FIELDS, key);
const arrayBeams = (part: ScenePart): number => Math.round(arrayNum(part, 'beams'));
/** Heights are multiples of the pitch, quantised to micrometres so `6 * 0.05` reads 0.3, not 0.30000000000000004. */
const arrayHeight = (part: ScenePart, beams: number): number => Math.round(beams * arrayNum(part, 'pitchM') * 1e6) / 1e6;

function lightArrayRuntime(part: ScenePart): PartRuntime {
  const beams = arrayBeams(part);
  const pitch = arrayNum(part, 'pitchM');
  const span = arrayNum(part, 'spanM');
  const max = arrayHeight(part, beams);
  const f = frame(part);
  const p = part.position;
  return numericRuntime(part, {
    names: { reading: 'height' },
    max,
    offset: pitch,
    viewPart: 'light-array',
    size: [0.05, 0.05, span],
    text: (h) => `${h.toFixed(2)} m`,
    countEdges: true,
    faults: {},
    sample(world) {
      const items = trackedItems(world);
      const hit = (i: number): boolean => {
        const y = p[1] + (i + 0.5) * pitch;
        const id = world.rayHit([p[0], y, p[2]], [p[0] + span * f.uz[0], y, p[2] + span * f.uz[1]]);
        return id !== null && items.has(id);
      };
      for (let i = beams - 1; i >= 0; i -= 1) if (hit(i)) return { raw: Math.min(arrayHeight(part, i + 1), max), detect: true };
      return { raw: 0, detect: false };
    },
  });
}

// ---- Scale (R4-D3) ----

const SCALE_FIELDS: Readonly<Record<string, ConfigField>> = {
  rangeKg: { kind: 'number', min: 5, max: 200, default: 20, unit: 'kg' },
  lengthM: { kind: 'number', min: 0.3, max: 1.5, default: 0.6, unit: 'm' },
  widthM: { kind: 'number', min: 0.3, max: 1.2, default: 0.6, unit: 'm' },
  heightM: { kind: 'number', min: 0.2, max: 1, default: 0.5, unit: 'm' },
  settleMs: { kind: 'number', min: 0, max: 2000, default: 300, unit: 'ms' },
};
const scaleNum = (part: ScenePart, key: string): number => cfgNumber(part, SCALE_FIELDS, key);

function scaleRuntime(part: ScenePart): PartRuntime {
  const range = scaleNum(part, 'rangeKg');
  const halfL = scaleNum(part, 'lengthM') / 2;
  const halfW = scaleNum(part, 'widthM') / 2;
  const height = scaleNum(part, 'heightM');
  const settleSteps = Math.round(scaleNum(part, 'settleMs') / STEP_MS);
  const f = frame(part);
  const y0 = part.position[1];
  let steady = 0; // consecutive steps with at least one item, all at rest
  return numericRuntime(part, {
    names: { reading: 'weight', extra: 'stable' },
    max: range,
    offset: 2,
    viewPart: 'scale',
    size: [halfL * 2, 0.02, halfW * 2],
    text: (w, stable) => `${w.toFixed(2)} kg${stable ? ', stable' : ''}`,
    countEdges: false,
    faults: {},
    sample(world) {
      const items = trackedItems(world);
      let mass = 0;
      let inside = 0;
      let moving = false;
      for (const b of world.bodies()) {
        const info = items.get(b.id);
        if (!info || b.p[1] < y0 || b.p[1] > y0 + height) continue;
        const [lx, lz] = f.local(b.p);
        if (Math.abs(lx) > halfL || Math.abs(lz) > halfW) continue;
        inside += 1;
        mass += roundTo(info.massKg, 0.01);
        if (b.v[0] * b.v[0] + b.v[1] * b.v[1] + b.v[2] * b.v[2] > REST_SPEED_SQ) moving = true;
      }
      steady = inside > 0 && !moving ? steady + 1 : 0;
      const stable = inside > 0 && steady >= settleSteps;
      return { raw: stable ? Math.min(roundTo(mass, 0.01), range) : 0, detect: inside > 0, stable };
    },
  });
}

// ---- Vision sensor (R4-D4) ----

const VISION_FIELDS: Readonly<Record<string, ConfigField>> = {
  fieldM: { kind: 'number', min: 0.2, max: 1, default: 0.5, unit: 'm' },
  heightM: { kind: 'number', min: 0.2, max: 1, default: 0.5, unit: 'm' },
};
const visionNum = (part: ScenePart, key: string): number => cfgNumber(part, VISION_FIELDS, key);

function visionRuntime(part: ScenePart): PartRuntime {
  const half = visionNum(part, 'fieldM') / 2;
  const height = visionNum(part, 'heightM');
  const f = frame(part);
  const y0 = part.position[1];
  return numericRuntime(part, {
    names: { reading: 'code' },
    max: MAX_CODE,
    offset: 0,
    viewPart: 'vision-sensor',
    size: [half * 2, 0.02, half * 2],
    text: (c) => `code ${Math.round(c)}`,
    countEdges: false,
    faults: { blind: () => 0, misread: (c) => (c % MAX_CODE) + 1 },
    sample(world) {
      const items = trackedItems(world);
      let best = -1;
      let bestD = 0;
      let seen = false;
      for (const b of world.bodies()) {
        const info = items.get(b.id);
        if (!info || b.p[1] < y0 || b.p[1] > y0 + height) continue;
        const [lx, lz] = f.local(b.p);
        if (Math.abs(lx) > half || Math.abs(lz) > half) continue;
        seen = true;
        const d = lx * lx + lz * lz;
        if (best < 0 || d < bestD) {
          best = Math.round(info.code ?? 0);
          bestD = d;
        }
      }
      return { raw: seen ? clamp(best, MAX_CODE) : 0, detect: seen };
    },
  });
}

// ---- Definitions ----

const arraySignals = (part: ScenePart): PlantSignalDef[] => [
  {
    name: `${part.name}.height`,
    direction: 'sensor',
    type: 'REAL',
    unit: 'm',
    range: { min: 0, max: arrayHeight(part, arrayBeams(part)) },
  },
  { name: `${part.name}.detect`, direction: 'sensor', type: 'BOOL' },
];
const scaleSignals = (part: ScenePart): PlantSignalDef[] => [
  { name: `${part.name}.weight`, direction: 'sensor', type: 'REAL', unit: 'kg', range: { min: 0, max: scaleNum(part, 'rangeKg') } },
  { name: `${part.name}.stable`, direction: 'sensor', type: 'BOOL' },
];
const visionSignals = (part: ScenePart): PlantSignalDef[] => [
  { name: `${part.name}.code`, direction: 'sensor', type: 'INT', unit: 'code', range: { min: 0, max: MAX_CODE } },
  { name: `${part.name}.detect`, direction: 'sensor', type: 'BOOL' },
];

const lightArray: RuntimePartDefinition = {
  id: 'light-array',
  family: 'sensors',
  names: { en: 'Light array', es: 'Cortina de luz' },
  config: ARRAY_FIELDS,
  signals: arraySignals,
  actions: ['readingStuck', 'readingOffset'],
  snapPoints: (part) => corners(0.05, arrayNum(part, 'spanM') / 2),
  doc: {
    en:
      'A row of beams across the line, one every pitchM, the first at half a pitch above the part. Signals: height (REAL, m, 0 to ' +
      'beams * pitchM) is the top edge of the highest tracked item that breaks a beam, in steps of pitchM (0.20, 0.30 and 0.40 for the ' +
      'three ' +
      'boxes at the default 0.05 m; a lid on a base reads the top of the lid), 0 when no beam is broken; detect (BOOL) is TRUE while any ' +
      'beam ' +
      'is broken. Fact: count (rising edges of detect). Faults: readingStuck holds the reading, readingOffset adds one pitch.',
    es:
      'Una fila de haces a través de la línea, uno cada pitchM, el primero a medio paso por encima de la pieza. Señales: height (REAL, ' +
      'm, 0 a beams * pitchM) es el borde superior de la pieza más alta que corta un haz, en pasos de pitchM (0,20, 0,30 y 0,40 para las ' +
      'tres cajas con el 0,05 m por defecto; una tapa sobre una base lee la parte superior de la tapa), 0 cuando ningún haz está ' +
      'cortado; ' +
      'detect (BOOL) es VERDADERO mientras algún haz esté cortado. Hecho: count (flancos de subida de detect). Fallas: readingStuck ' +
      'mantiene la lectura, readingOffset suma un paso.',
  },
  runtime: lightArrayRuntime,
};

const scale: RuntimePartDefinition = {
  id: 'scale',
  family: 'sensors',
  names: { en: 'Scale', es: 'Báscula' },
  config: SCALE_FIELDS,
  signals: scaleSignals,
  actions: ['readingStuck', 'readingOffset'],
  snapPoints: (part) => corners(scaleNum(part, 'lengthM') / 2, scaleNum(part, 'widthM') / 2),
  doc: {
    en:
      'A static scale: it adds the masses of the items and pallets whose centre is inside its weighing volume (lengthM along the part, ' +
      'widthM across, heightM up from the part). Signals: weight (REAL, kg, 0 to rangeKg) is that sum, rounded to 0.01 kg, only while ' +
      'stable, ' +
      'else 0 (a heavier load reads rangeKg); stable (BOOL) is TRUE once at least one item has been at rest (at most 0.05 m/s) for ' +
      'settleMs. ' +
      'It does not read contact force. Faults: readingStuck holds the weight, readingOffset adds 2 kg.',
    es:
      'Una báscula estática: suma las masas de las piezas y palés cuyo centro está dentro de su volumen de pesaje (lengthM a lo largo ' +
      'de la pieza, widthM a lo ancho, heightM hacia arriba). Señales: weight (REAL, kg, 0 a rangeKg) es esa suma, redondeada a 0,01 kg, ' +
      'solo mientras es estable y, si no, 0 (una carga mayor lee rangeKg); stable (BOOL) es VERDADERO cuando al menos una pieza lleva ' +
      'settleMs en reposo (como máximo 0,05 m/s). No lee la fuerza de contacto. Fallas: readingStuck mantiene el peso, readingOffset ' +
      'suma 2 kg.',
  },
  runtime: scaleRuntime,
};

const vision: RuntimePartDefinition = {
  id: 'vision-sensor',
  family: 'sensors',
  names: { en: 'Vision sensor', es: 'Sensor de visión' },
  config: VISION_FIELDS,
  signals: visionSignals,
  actions: ['blind', 'misread'],
  snapPoints: (part) => corners(visionNum(part, 'fieldM') / 2, visionNum(part, 'fieldM') / 2),
  doc: {
    en:
      'Reads the identity of the item in view as a code, not an image. The field is a square fieldM by fieldM centred on the part, from ' +
      'its ' +
      'position up heightM. Signals: code (INT, 0 to 9) is the code of the item whose centre is nearest to the field centre, 0 when the ' +
      'field is empty or the item is unlabelled; detect (BOOL) is TRUE while any item is in the field. Faults: blind reads 0, misread ' +
      'reads another code.',
    es:
      'Lee la identidad de la pieza a la vista como un código, no como una imagen. El campo es un cuadrado de fieldM por fieldM centrado ' +
      'en la pieza, desde su posición hacia arriba heightM. Señales: code (INT, 0 a 9) es el código de la pieza cuyo centro está más ' +
      'cerca ' +
      'del centro del campo, 0 cuando el campo está vacío o la pieza no tiene código; detect (BOOL) es VERDADERO mientras haya una pieza ' +
      'en el campo. Fallas: blind lee 0, misread lee otro código.',
  },
  runtime: visionRuntime,
};

/** Numeric sensors (PRT-005): not registered here; the core registers them. */
export const numericSensorParts: readonly RuntimePartDefinition[] = [lightArray, scale, vision];
