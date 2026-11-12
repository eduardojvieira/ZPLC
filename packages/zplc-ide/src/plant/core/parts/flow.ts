import type { ConfigField, FactValue, ScenePart } from '../../contracts';
import type { PhysicsWorld } from '../world';
import { cfgNumber, ITEM_FRICTION, yawQuat, type PartRuntime, type RuntimePartDefinition } from './items';
import { marker } from './sensors';

const STEP_MS = 5;
const TRAVEL_MS = 400; // PRT-003: 0.4 s between the limits
const THICKNESS = 0.05;
const SINK = 0.02; // retracted, the top of the blade sits this far under the belt surface

const bladeConfig: Record<string, ConfigField> = {
  widthM: { kind: 'number', min: 0.2, max: 1, default: 0.6, unit: 'm' },
  heightM: { kind: 'number', min: 0.1, max: 0.6, default: 0.3, unit: 'm' },
};

function bladeRuntime(part: ScenePart): PartRuntime {
  const width = cfgNumber(part, bladeConfig, 'widthM');
  const height = cfgNumber(part, bladeConfig, 'heightM');
  const id = `${part.id}-blade`;
  let world: PhysicsWorld | undefined;
  let travelMs = 0; // 0 retracted, TRAVEL_MS extended
  let stuck = false;
  const centreY = () => part.position[1] + height / 2 - (1 - travelMs / TRAVEL_MS) * (height + SINK);
  return {
    build(w) {
      world = w;
      // Kinematic in the static layer: it pushes items, and a sensor beam never mistakes it for an item.
      w.addBody({
        id,
        kind: 'box',
        half: [THICKNESS / 2, height / 2, width / 2],
        position: [part.position[0], centreY(), part.position[2]],
        rotationYDeg: part.rotationYDeg,
        massKg: 0,
        friction: ITEM_FRICTION,
        motion: 'kinematic',
        layer: 'static',
      });
    },
    beforeStep(commands) {
      if (!stuck) {
        const wants = commands[`${part.name}.extend`] === true;
        travelMs = Math.min(TRAVEL_MS, Math.max(0, travelMs + (wants ? STEP_MS : -STEP_MS)));
      }
      // MoveKinematic sets a velocity that persists: moving to the pose the body already has is what stops it.
      world?.setKinematicPose(id, [part.position[0], centreY(), part.position[2]], yawQuat(part.rotationYDeg));
    },
    afterStep() {},
    sense: () => ({ [`${part.name}.extended`]: travelMs >= TRAVEL_MS, [`${part.name}.retracted`]: travelMs <= 0 }),
    facts: (): Record<string, FactValue> => ({}),
    act(action) {
      if (action !== 'stuck') throw new Error(`part "${part.name}" has no action "${action}"`);
      stuck = true;
    },
    views: () => [
      {
        id: part.id,
        part: 'stop-blade',
        name: part.name,
        pose: marker(part, 'stop-blade', [THICKNESS, height, width], [part.position[0], centreY(), part.position[2]]),
        state: { travelMs, stuck },
        signals: { extended: travelMs >= TRAVEL_MS, retracted: travelMs <= 0 },
      },
    ],
  };
}

/** The stop blade (PRT-003): a kinematic plate across a belt that rises on `extend` and sinks on release. */
export const flowParts: readonly RuntimePartDefinition[] = [
  {
    id: 'stop-blade',
    family: 'flow',
    names: { en: 'Stop blade', es: 'Tope retráctil' },
    config: bladeConfig,
    signals: (part) => [
      { name: `${part.name}.extend`, direction: 'command', type: 'BOOL' },
      { name: `${part.name}.extended`, direction: 'sensor', type: 'BOOL' },
      { name: `${part.name}.retracted`, direction: 'sensor', type: 'BOOL' },
    ],
    actions: ['stuck'],
    snapPoints: () => [],
    doc: {
      en:
        'A plate across a belt at the part position (the centre of the belt surface). It takes 0.4 s to travel; extended and retracted ' +
        'report the limits. Signals: extend, extended, retracted. Fault: stuck.',
      es:
        'Una placa a través de una cinta en la posición de la pieza (el centro de la superficie de la cinta). Tarda 0,4 s en recorrer; ' +
        'extended y retracted indican los límites. Señales: extend, extended, retracted. Falla: stuck.',
    },
    runtime: bladeRuntime,
  },
];
