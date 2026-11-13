import type { ConfigField, FactValue, PlantSignalDef, ScenePart, SnapPoint, Vec3 } from '../../contracts';
import type { PhysicsWorld } from '../world';
import { cfg, cfgNumber, ITEM_FRICTION, type PartRuntime, type RuntimePartDefinition } from './items';
import { yawEntry } from './yawTable';

const STEP_MS = 5;
const THICKNESS = 0.1; // the part position is the centre of the top surface when lowered
const JAM_HEIGHT = 0.3;
const ACCEPTS = ['belt', 'roller', 'curved', 'emitter', 'remover'];

const fields: Record<string, ConfigField> = {
  lengthM: { kind: 'number', min: 0.4, max: 2, default: 0.8, unit: 'm' },
  widthM: { kind: 'number', min: 0.4, max: 0.8, default: 0.6, unit: 'm' },
  liftM: { kind: 'number', min: 0.02, max: 0.2, default: 0.05, unit: 'm' },
  liftTravelMs: { kind: 'number', min: 100, max: 2000, default: 400, unit: 'ms' },
  speedMps: { kind: 'number', min: 0.1, max: 1.0, default: 0.5, unit: 'm/s' },
  accelMps2: { kind: 'number', min: 0.1, max: 5, default: 1.0, unit: 'm/s2' },
  allowReverse: { kind: 'boolean', default: false },
};

type Mode = 'x' | 'z';

function runtime(part: ScenePart): PartRuntime {
  const id = part.id;
  const name = part.name;
  const length = cfgNumber(part, fields, 'lengthM');
  const width = cfgNumber(part, fields, 'widthM');
  const lift = cfgNumber(part, fields, 'liftM');
  const travel = cfgNumber(part, fields, 'liftTravelMs');
  const speed = cfgNumber(part, fields, 'speedMps');
  const reverse = cfg(part, fields, 'allowReverse') === true;
  // Table lookups, not libm: the pose does not depend on the platform (PLT-006). The rotation is rounded to 0.25 degrees.
  const yaw = yawEntry(part.rotationYDeg);
  const axes: Record<Mode, Vec3> = { x: [yaw.cos, 0, -yaw.sin], z: [yaw.sin, 0, yaw.cos] };
  let world: PhysicsWorld | undefined;
  let travelMs = 0;
  let mode: Mode = 'x';
  let liftStuck = false;
  let stalled = false;
  let jammed = false;
  const centre = (): Vec3 => [part.position[0], part.position[1] - THICKNESS / 2 + (lift * travelMs) / travel, part.position[2]];
  return {
    build(w) {
      world = w;
      w.addBody({
        id,
        kind: 'box',
        half: [length / 2, THICKNESS / 2, width / 2],
        position: centre(),
        rotationYDeg: part.rotationYDeg,
        massKg: 0,
        friction: ITEM_FRICTION,
        motion: 'kinematic',
        layer: 'static',
      });
      w.addBelt({ id, bodyId: id, axis: axes.x, accelMps2: cfgNumber(part, fields, 'accelMps2') });
    },
    beforeStep(commands) {
      if (!world) return;
      const on = (key: string) => commands[`${name}.${key}`] === true;
      const wantsLift = on('lift');
      const run = on('run');
      const back = reverse && on('runReverse');
      const right = on('moveRight');
      const left = on('moveLeft');
      // run with lift is a conflict: the lift holds and the surface does not move (R4-T2).
      const conflict = wantsLift && (run || back);
      if (!liftStuck && !conflict) travelMs = Math.min(travel, Math.max(0, travelMs + (wantsLift ? STEP_MS : -STEP_MS)));
      let want: Mode = mode;
      let target = 0;
      if (travelMs <= 0) {
        want = 'x';
        if (!conflict && run !== back) target = run ? speed : -speed;
      } else if (travelMs >= travel) {
        want = 'z';
        if (right !== left) target = right ? speed : -speed;
      }
      if (stalled) target = 0;
      if (want !== mode) {
        // R4-T2: the surface ramps to 0 first and changes axis only once it is at 0.
        target = 0;
        if (world.beltSpeed(id) === 0) {
          world.setBeltAxis(id, axes[want]);
          mode = want;
        }
      }
      world.setBeltTarget(id, target);
      // MoveKinematic keeps the velocity it was last given: pose the body every step, also to hold it still.
      world.setKinematicPose(id, centre(), yaw.q);
    },
    afterStep() {},
    sense: () => ({ [`${name}.raised`]: travelMs >= travel, [`${name}.lowered`]: travelMs <= 0 }),
    facts: (): Record<string, FactValue> => ({}),
    act(action) {
      if (action === 'liftStuck') liftStuck = true;
      else if (action === 'stall') stalled = true;
      else if (action === 'jam') {
        if (jammed || !world) return;
        jammed = true;
        // A fixed bar across the module: items are blocked by the physics, not by a script.
        world.addBody({
          id: `${id}-jam`,
          kind: 'box',
          half: [0.025, JAM_HEIGHT / 2, width / 2],
          position: [part.position[0], part.position[1] + JAM_HEIGHT / 2, part.position[2]],
          rotationYDeg: part.rotationYDeg,
          massKg: 0,
          friction: ITEM_FRICTION,
          motion: 'static',
          layer: 'static',
        });
      } else throw new Error(`part "${name}" has no action "${action}"`);
    },
    views() {
      const raised = travelMs >= travel;
      const lowered = travelMs <= 0;
      return [
        {
          id,
          part: 'chain-transfer',
          name,
          pose: { id, part: 'chain-transfer', kind: 'box', size: [length, THICKNESS, width], p: centre(), q: yaw.q },
          state: {
            fraction: travelMs / travel,
            text: raised ? 'raised' : lowered ? 'lowered' : 'travelling',
            speedMps: world ? world.beltSpeed(id) : 0,
            axis: mode,
            liftStuck,
            stalled,
            jammed,
          },
          signals: { raised, lowered },
        },
      ];
    },
  };
}

function signals(part: ScenePart): PlantSignalDef[] {
  const n = part.name;
  const cmd = (k: string): PlantSignalDef => ({ name: `${n}.${k}`, direction: 'command', type: 'BOOL' });
  const out = [cmd('lift'), cmd('run')];
  if (cfg(part, fields, 'allowReverse') === true) out.push(cmd('runReverse'));
  out.push(cmd('moveRight'), cmd('moveLeft'));
  out.push({ name: `${n}.raised`, direction: 'sensor', type: 'BOOL' }, { name: `${n}.lowered`, direction: 'sensor', type: 'BOOL' });
  return out;
}

const snapPoints = (part: ScenePart): SnapPoint[] => {
  const half = cfgNumber(part, fields, 'lengthM') / 2;
  return [
    { name: 'in', position: [-half, 0, 0], normalYDeg: 180, accepts: ACCEPTS },
    { name: 'out', position: [half, 0, 0], normalYDeg: 0, accepts: ACCEPTS },
  ];
};

/** The chain transfer (PRT-001): a kinematic module with a surface velocity that lifts to move items sideways. */
export const chainParts: readonly RuntimePartDefinition[] = [
  {
    id: 'chain-transfer',
    family: 'conveyors',
    names: { en: 'Chain transfer', es: 'Transferencia de cadenas' },
    config: fields,
    signals,
    actions: ['liftStuck', 'stall', 'jam'],
    snapPoints,
    doc: {
      en:
        'A module in a belt line. Its position is the centre of the top surface when lowered. Lowered, it moves items along +x like a ' +
        'belt (run, runReverse when reverse is allowed). With lift TRUE it rises liftM over liftTravelMs (0.4 s by default); raised, it ' +
        'moves ' +
        'items sideways: moveRight along +z, moveLeft along -z. The surface stops before it changes direction, and commands in conflict ' +
        '(run with lift, moveLeft with moveRight) do nothing. Signals: lift, run, runReverse, moveRight, moveLeft, raised, lowered. ' +
        'Faults: liftStuck, stall, jam.',
      es:
        'Un módulo dentro de una línea de cintas. Su posición es el centro de la superficie superior cuando está bajado. Bajado, mueve ' +
        'las ' +
        'piezas a lo largo de +x como una cinta (run, y runReverse si se permite el sentido inverso). Con lift en TRUE sube liftM en ' +
        'liftTravelMs (0,4 s por defecto); subido, mueve las piezas de lado: moveRight a lo largo de +z, moveLeft a lo largo de -z. La ' +
        'superficie se detiene antes de cambiar de sentido, y las órdenes en conflicto (run con lift, moveLeft con moveRight) no hacen ' +
        'nada. Señales: lift, run, runReverse, moveRight, moveLeft, raised, lowered. Fallas: liftStuck, stall, jam.',
    },
    runtime,
  },
];
