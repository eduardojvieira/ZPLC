import type { ConfigField, FactValue, PartView, ScenePart, Vec3 } from '../../contracts';
import type { PhysicsWorld } from '../world';
import { cfg, cfgNumber, rotateY, trackedItems, type ItemInfo, yawQuat, type PartRuntime, type RuntimePartDefinition } from './items';

/** A small drawable marker for parts that have no body of their own. */
export const marker = (part: ScenePart, id: string, size: Vec3, p: Vec3 = part.position): PartView['pose'] => ({
  id: part.id,
  part: id,
  kind: 'box',
  size,
  p,
  q: yawQuat(part.rotationYDeg),
});

const beamConfig = (range: number): Record<string, ConfigField> => ({
  rangeM: { kind: 'number', min: 0.05, max: 2, default: range, unit: 'm' },
  heightM: { kind: 'number', min: 0, max: 2, default: 0.1, unit: 'm' },
});
const diffuseConfig = beamConfig(0.5);
const retroConfig = beamConfig(1.5);
const rangedConfig = (min: number, max: number, range: number): Record<string, ConfigField> => ({
  rangeM: { kind: 'number', min, max, default: range, unit: 'm' },
  heightM: { kind: 'number', min: 0, max: 2, default: 0.1, unit: 'm' },
});
const inductiveConfig = rangedConfig(0.02, 0.3, 0.1);
const capacitiveConfig = rangedConfig(0.02, 0.5, 0.15);
const colourConfig: Record<string, ConfigField> = {
  ...rangedConfig(0.05, 1, 0.3),
  target: { kind: 'enum', values: ['red', 'blue'], default: 'red' },
};

/** What a sensor makes of the body its beam hit (`null` when the beam is clear). `match` is published only by the colour sensor. */
type Detector = (world: PhysicsWorld, hitId: string | null, part: ScenePart) => { detect: boolean; match?: boolean };
const optical: Detector = (_w, hit) => ({ detect: hit != null });
const hitInfo = (w: PhysicsWorld, hit: string | null): ItemInfo | undefined => (hit == null ? undefined : trackedItems(w).get(hit));
/** Detects a tracked item or pallet whose properties satisfy `ok`; the floor, belts and other bodies never count. */
const tracked =
  (ok: (info: ItemInfo) => boolean): Detector =>
  (w, hit) => {
    const info = hitInfo(w, hit);
    return { detect: info != null && ok(info) };
  };
const inductive = tracked((i) => i.metal === true);
const capacitive = tracked(() => true);
const colour: Detector = (w, hit, part) => {
  const info = hitInfo(w, hit);
  return { detect: info != null, match: info?.colour != null && info.colour === cfg(part, colourConfig, 'target') };
};

/** One beam along local +x at `heightM` above the part position, cast through the physics world (PRT-006). */
function sensorRuntime(kind: SensorKind, fields: Record<string, ConfigField>, detector: Detector, hasMatch: boolean) {
  return (part: ScenePart): PartRuntime => {
    const range = cfgNumber(part, fields, 'rangeM');
    const height = cfgNumber(part, fields, 'heightM');
    const [dx, dz] = rotateY(part.rotationYDeg, range, 0);
    const from: Vec3 = [part.position[0], part.position[1] + height, part.position[2]];
    const to: Vec3 = [from[0] + dx, from[1], from[2] + dz];
    let world: PhysicsWorld | undefined;
    let detect = false;
    let stuck: boolean | undefined;
    let match = false;
    let inverted = false;
    let count = 0;
    return {
      build(w) {
        world = w;
      },
      beforeStep() {},
      afterStep() {
        const hit = world ? detector(world, world.rayHit(from, to), part) : { detect: false };
        const next = stuck ?? hit.detect;
        match = (hit.match ?? false) !== inverted;
        if (next && !detect) count += 1;
        detect = next;
      },
      sense: () => ({ [`${part.name}.detect`]: detect, ...(hasMatch ? { [`${part.name}.match`]: match } : {}) }),
      facts: (): Record<string, FactValue> => ({ [`count:${part.name}`]: count }),
      act(action) {
        if (action === 'stuckOn') stuck = true;
        else if (action === 'stuckOff') stuck = false;
        else if (action === 'wrongColour' && hasMatch) inverted = !inverted;
        else throw new Error(`part "${part.name}" has no action "${action}"`);
      },
      views: () => [
        {
          id: part.id,
          part: 'sensor',
          name: part.name,
          pose: marker(part, 'sensor', [0.05, 0.05, 0.05], from),
          state: { kind, detect, count, beamLength: range, ...(hasMatch ? { match } : {}) },
          signals: { detect, ...(hasMatch ? { match } : {}) },
        },
      ],
    };
  };
}

/** The beam sensor kinds of the catalogue (owner decision 4, 2026-11-25): each is drawn its own way. */
export type SensorKind = 'diffuse' | 'retro-reflective' | 'inductive' | 'capacitive' | 'colour';

const define = (
  id: string,
  kind: SensorKind,
  names: { en: string; es: string },
  fields: Record<string, ConfigField>,
  doc: { en: string; es: string },
  detector: Detector = optical,
  hasMatch = false,
): RuntimePartDefinition => ({
  id,
  family: 'sensors',
  kind,
  names,
  config: fields,
  signals: (part) => [
    { name: `${part.name}.detect`, direction: 'sensor', type: 'BOOL' },
    ...(hasMatch ? [{ name: `${part.name}.match`, direction: 'sensor' as const, type: 'BOOL' as const }] : []),
  ],
  actions: hasMatch ? ['stuckOn', 'stuckOff', 'wrongColour'] : ['stuckOn', 'stuckOff'],
  snapPoints: () => [],
  doc,
  runtime: sensorRuntime(kind, fields, detector, hasMatch),
});

/** Beam sensors (PRT-006): two optical, and the inductive, capacitive and colour sensors that read item properties (R4-D1). */
export const sensorParts: readonly RuntimePartDefinition[] = [
  define('sensor-diffuse', 'diffuse', { en: 'Diffuse optical sensor', es: 'Sensor óptico difuso' }, diffuseConfig, {
    en:
      'Detects any item that enters its beam. The beam starts at the part position, runs along +x for rangeM and sits heightM above ' +
      'it. Signal: detect. Faults: stuckOn, stuckOff.',
    es:
      'Detecta cualquier pieza que entre en su haz. El haz parte de la posición de la pieza, corre a lo largo de +x durante rangeM y ' +
      'está heightM por encima. Señal: detect. Fallas: stuckOn, stuckOff.',
  }),
  define('sensor-retro', 'retro-reflective', { en: 'Retro-reflective optical sensor', es: 'Sensor óptico retrorreflectivo' }, retroConfig, {
    en: 'A beam to a reflector rangeM away; detects an item that breaks the beam. Signal: detect. Faults: stuckOn, stuckOff.',
    es: 'Un haz hasta un reflector a rangeM de distancia; detecta una pieza que corte el haz. Señal: detect. Fallas: stuckOn, stuckOff.',
  }),
  define(
    'sensor-inductive',
    'inductive',
    { en: 'Inductive sensor', es: 'Sensor inductivo' },
    inductiveConfig,
    {
      en:
        'Detects metal items only; plastic items, boxes and pallets pass unseen. The beam starts at the part position, runs along +x for ' +
        'rangeM ' +
        'and sits heightM above it. Signal: detect. Faults: stuckOn, stuckOff.',
      es:
        'Detecta solo piezas metálicas; las piezas de plástico, las cajas y las paletas pasan sin ser vistas. El haz parte de la ' +
        'posición de ' +
        'la pieza, corre a lo largo de +x durante rangeM y está heightM por encima. Señal: detect. Fallas: stuckOn, stuckOff.',
    },
    inductive,
  ),
  define(
    'sensor-capacitive',
    'capacitive',
    { en: 'Capacitive sensor', es: 'Sensor capacitivo' },
    capacitiveConfig,
    {
      en:
        'Detects any item or pallet, metal or not. The beam starts at the part position, runs along +x for rangeM and sits heightM above ' +
        'it. ' +
        'Signal: detect. Faults: stuckOn, stuckOff.',
      es:
        'Detecta cualquier pieza o paleta, sea metálica o no. El haz parte de la posición de la pieza, corre a lo largo de +x durante ' +
        'rangeM y ' +
        'está heightM por encima. Señal: detect. Fallas: stuckOn, stuckOff.',
    },
    capacitive,
  ),
  define(
    'sensor-colour',
    'colour',
    { en: 'Colour sensor', es: 'Sensor de color' },
    colourConfig,
    {
      en:
        'Teach-in colour sensor: detect is TRUE for any item in its beam, match is TRUE when that item has the colour set in target (red ' +
        'or ' +
        'blue); an item without a colour never matches. The beam runs along +x for rangeM at heightM. Signals: detect, match. Faults: ' +
        'stuckOn, ' +
        'stuckOff, wrongColour (inverts match).',
      es:
        'Sensor de color con aprendizaje: detect es TRUE con cualquier pieza en su haz y match es TRUE cuando esa pieza tiene el color ' +
        'de target ' +
        '(rojo o azul); una pieza sin color nunca coincide. El haz corre a lo largo de +x durante rangeM a heightM. Señales: detect, ' +
        'match. ' +
        'Fallas: stuckOn, stuckOff, wrongColour (invierte match).',
    },
    colour,
    true,
  ),
];
