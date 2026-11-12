import type { ConfigField, FactValue, PartView, ScenePart, Vec3 } from '../../contracts';
import type { PhysicsWorld } from '../world';
import { cfgNumber, rotateY, yawQuat, type PartRuntime, type RuntimePartDefinition } from './items';

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

/** One beam along local +x at `heightM` above the part position, cast through the physics world (PRT-006). */
function sensorRuntime(fields: Record<string, ConfigField>) {
  return (part: ScenePart): PartRuntime => {
    const range = cfgNumber(part, fields, 'rangeM');
    const height = cfgNumber(part, fields, 'heightM');
    const [dx, dz] = rotateY(part.rotationYDeg, range, 0);
    const from: Vec3 = [part.position[0], part.position[1] + height, part.position[2]];
    const to: Vec3 = [from[0] + dx, from[1], from[2] + dz];
    let world: PhysicsWorld | undefined;
    let detect = false;
    let stuck: boolean | undefined;
    let count = 0;
    return {
      build(w) {
        world = w;
      },
      beforeStep() {},
      afterStep() {
        const next = stuck ?? world?.rayHit(from, to) != null;
        if (next && !detect) count += 1;
        detect = next;
      },
      sense: () => ({ [`${part.name}.detect`]: detect }),
      facts: (): Record<string, FactValue> => ({ [`count:${part.name}`]: count }),
      act(action) {
        if (action === 'stuckOn') stuck = true;
        else if (action === 'stuckOff') stuck = false;
        else throw new Error(`part "${part.name}" has no action "${action}"`);
      },
      views: () => [
        {
          id: part.id,
          part: 'sensor',
          name: part.name,
          pose: marker(part, 'sensor', [0.05, 0.05, 0.05], from),
          state: { detect, count },
          signals: { detect },
        },
      ],
    };
  };
}

const define = (
  id: string,
  names: { en: string; es: string },
  fields: Record<string, ConfigField>,
  doc: { en: string; es: string },
): RuntimePartDefinition => ({
  id,
  family: 'sensors',
  names,
  config: fields,
  signals: (part) => [{ name: `${part.name}.detect`, direction: 'sensor', type: 'BOOL' }],
  actions: ['stuckOn', 'stuckOff'],
  snapPoints: () => [],
  doc,
  runtime: sensorRuntime(fields),
});

/** Optical sensors (PRT-006). Inductive and capacitive sensors are M4. */
export const sensorParts: readonly RuntimePartDefinition[] = [
  define('sensor-diffuse', { en: 'Diffuse optical sensor', es: 'Sensor óptico difuso' }, diffuseConfig, {
    en:
      'Detects any item that enters its beam. The beam starts at the part position, runs along +x for rangeM and sits heightM above ' +
      'it. Signal: detect. Faults: stuckOn, stuckOff.',
    es:
      'Detecta cualquier pieza que entre en su haz. El haz parte de la posición de la pieza, corre a lo largo de +x durante rangeM y ' +
      'está heightM por encima. Señal: detect. Fallas: stuckOn, stuckOff.',
  }),
  define('sensor-retro', { en: 'Retro-reflective optical sensor', es: 'Sensor óptico retrorreflectivo' }, retroConfig, {
    en: 'A beam to a reflector rangeM away; detects an item that breaks the beam. Signal: detect. Faults: stuckOn, stuckOff.',
    es: 'Un haz hasta un reflector a rangeM de distancia; detecta una pieza que corte el haz. Señal: detect. Fallas: stuckOn, stuckOff.',
  }),
];
