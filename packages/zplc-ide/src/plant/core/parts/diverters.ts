import type { ConfigField, FactValue, PartView, PlantSignalDef, ScenePart, SnapPoint, Vec3 } from '../../contracts';
import type { PhysicsWorld } from '../world';
import { AT_LIMIT_M, stepAxis, type AxisState } from './axis';
import { cfgNumber, ITEM_FRICTION, type PartRuntime, type RuntimePartDefinition } from './items';
import { yawEntry } from './yawTable';

const DT_S = 0.005; // one plant step
const PLATE_T = 0.05; // thickness of the pusher plate and of the arm
const CLEARANCE = 0.005; // the bottom of a plate floats this far above the part's y, so it never rubs the belt
const AT_ANGLE_DEG = 0.5; // diverted and home are TRUE within this angle of an end
// A guide face is polished: with the full item friction a box jams against a steep arm instead of sliding along it.
const GUIDE_FRICTION = 0.1;
const RAMP = 8; // the arm reaches degPerS in 1 / RAMP seconds (a kinematic body must not start with a jump in rate)

const pusherConfig: Record<string, ConfigField> = {
  strokeM: { kind: 'number', min: 0.2, max: 1, default: 0.6, unit: 'm' },
  widthM: { kind: 'number', min: 0.2, max: 0.8, default: 0.4, unit: 'm' },
  heightM: { kind: 'number', min: 0.1, max: 0.4, default: 0.25, unit: 'm' },
  speedMps: { kind: 'number', min: 0.2, max: 1.5, default: 0.8, unit: 'm/s' },
  accelMps2: { kind: 'number', min: 1, max: 10, default: 4, unit: 'm/s2' },
};
const armConfig: Record<string, ConfigField> = {
  lengthM: { kind: 'number', min: 0.4, max: 1.2, default: 0.8, unit: 'm' },
  heightM: { kind: 'number', min: 0.1, max: 0.4, default: 0.25, unit: 'm' },
  angleDeg: { kind: 'number', min: 15, max: 60, default: 35, unit: 'deg' },
  degPerS: { kind: 'number', min: 30, max: 180, default: 90, unit: 'deg/s' },
};

/** The two kinematic plates differ in how a position becomes a pose and a view; everything else is shared. */
interface Shape {
  id: string; // view kind, also the part id
  command: string;
  limits: readonly [high: string, low: string]; // signal names: at the far end, at rest
  cfg: Record<string, ConfigField>;
  size(part: ScenePart): Vec3; // the plate
  stroke(part: ScenePart): number; // the axis travel: m for the pusher, degrees for the arm
  spec(part: ScenePart): { speedMps: number; accelMps2: number };
  tol: number;
  friction: number; // of the plate face
  pose(part: ScenePart, p: number): { position: Vec3; q: ReturnType<typeof yawEntry>['q'] };
}

const pusher: Shape = {
  id: 'pusher',
  command: 'extend',
  limits: ['extended', 'retracted'],
  cfg: pusherConfig,
  size: (part) => [cfgNumber(part, pusherConfig, 'widthM'), cfgNumber(part, pusherConfig, 'heightM'), PLATE_T],
  stroke: (part) => cfgNumber(part, pusherConfig, 'strokeM'),
  spec: (part) => ({ speedMps: cfgNumber(part, pusherConfig, 'speedMps'), accelMps2: cfgNumber(part, pusherConfig, 'accelMps2') }),
  tol: AT_LIMIT_M,
  friction: ITEM_FRICTION,
  pose(part, p) {
    // The plate moves along the part's local +z, which a yaw of `a` maps to (sin a, 0, cos a).
    const e = yawEntry(part.rotationYDeg);
    return {
      position: [
        part.position[0] + p * e.sin,
        part.position[1] + CLEARANCE + cfgNumber(part, pusherConfig, 'heightM') / 2,
        part.position[2] + p * e.cos,
      ],
      q: e.q,
    };
  },
};

const arm: Shape = {
  id: 'diverter-arm',
  command: 'divert',
  limits: ['diverted', 'home'],
  cfg: armConfig,
  size: (part) => [cfgNumber(part, armConfig, 'lengthM'), cfgNumber(part, armConfig, 'heightM'), PLATE_T],
  stroke: (part) => cfgNumber(part, armConfig, 'angleDeg'),
  // The arm angle runs on the same axis law as the pusher (degrees instead of metres), with a ramp so it never starts with a jump.
  spec: (part) => ({ speedMps: cfgNumber(part, armConfig, 'degPerS'), accelMps2: RAMP * cfgNumber(part, armConfig, 'degPerS') }),
  tol: AT_ANGLE_DEG,
  friction: GUIDE_FRICTION,
  pose(part, angle) {
    // Swinging towards +z is a negative yaw about +y. Position and orientation come from the same table entry.
    const e = yawEntry(part.rotationYDeg - angle);
    const half = cfgNumber(part, armConfig, 'lengthM') / 2;
    return {
      position: [
        part.position[0] + half * e.cos,
        part.position[1] + CLEARANCE + cfgNumber(part, armConfig, 'heightM') / 2,
        part.position[2] - half * e.sin,
      ],
      q: e.q,
    };
  },
};

function runtime(s: Shape): (part: ScenePart) => PartRuntime {
  return (part) => {
    const plateId = `${part.id}-plate`;
    const stroke = s.stroke(part);
    const spec = { strokeM: stroke, ...s.spec(part) };
    const size = s.size(part);
    let world: PhysicsWorld | undefined;
    let state: AxisState = { p: 0, v: 0 };
    let stuck = false;
    const high = () => state.p >= stroke - s.tol;
    const low = () => state.p <= s.tol;
    const text = () => (high() ? s.limits[0] : low() ? s.limits[1] : 'moving');
    return {
      build(w) {
        world = w;
        const { position } = s.pose(part, 0);
        // Kinematic in the static layer, as the stop blade: it pushes items and a beam never mistakes it for one.
        w.addBody({
          id: plateId,
          kind: 'box',
          half: [size[0] / 2, size[1] / 2, size[2] / 2],
          position,
          rotationYDeg: part.rotationYDeg,
          massKg: 0,
          friction: s.friction,
          motion: 'kinematic',
          layer: 'static',
        });
      },
      beforeStep(commands) {
        const goal = commands[`${part.name}.${s.command}`] === true ? stroke : 0;
        state = stepAxis(state, { mode: 'goto', target: goal }, spec, DT_S, stuck);
        // A kinematic body keeps the velocity of its last move: pose it every step, also to hold it.
        const { position, q } = s.pose(part, state.p);
        world?.setKinematicPose(plateId, position, q);
      },
      afterStep() {},
      sense: () => ({ [`${part.name}.${s.limits[0]}`]: high(), [`${part.name}.${s.limits[1]}`]: low() }),
      facts: (): Record<string, FactValue> => ({}),
      act(action) {
        if (action !== 'stuck') throw new Error(`part "${part.name}" has no action "${action}"`);
        stuck = true;
      },
      views: (): readonly PartView[] => {
        const { position, q } = s.pose(part, state.p);
        return [
          {
            id: part.id,
            part: s.id,
            name: part.name,
            pose: { id: part.id, part: s.id, kind: 'box', size, p: position, q },
            state: { fraction: high() ? 1 : low() ? 0 : state.p / stroke, text: text(), stuck },
            signals: { [s.limits[0]]: high(), [s.limits[1]]: low() },
          },
        ];
      },
    };
  };
}

/** Footprint corners in the part's local frame: x by z from the part position (+z is "right"). */
const corners = (x0: number, x1: number, z1: number): SnapPoint[] =>
  (
    [
      ['corner-a', x0, 0],
      ['corner-b', x1, 0],
      ['corner-c', x1, z1],
      ['corner-d', x0, z1],
    ] as const
  ).map(([name, x, z]) => ({ name, position: [x, 0, z], normalYDeg: 0, accepts: [] }));

const define = (
  s: Shape,
  names: { en: string; es: string },
  snap: (part: ScenePart) => SnapPoint[],
  doc: { en: string; es: string },
): RuntimePartDefinition => ({
  id: s.id,
  family: 'flow',
  names,
  config: s.cfg,
  signals: (part): PlantSignalDef[] => [
    { name: `${part.name}.${s.command}`, direction: 'command', type: 'BOOL' },
    { name: `${part.name}.${s.limits[0]}`, direction: 'sensor', type: 'BOOL' },
    { name: `${part.name}.${s.limits[1]}`, direction: 'sensor', type: 'BOOL' },
  ],
  actions: ['stuck'],
  snapPoints: snap,
  doc,
  runtime: runtime(s),
});

/** The pusher and the diverter arm (PRT-003): kinematic plates that move items by contact; limit sensors. */
export const diverterParts: readonly RuntimePartDefinition[] = [
  define(
    pusher,
    { en: 'Pusher', es: 'Empujador' },
    (part) => {
      const w = cfgNumber(part, pusherConfig, 'widthM') / 2;
      return corners(-w, w, cfgNumber(part, pusherConfig, 'strokeM'));
    },
    {
      en:
        'A plate that pushes items sideways. Its position is the retracted centre of the plate, just above the surface; it moves along ' +
        'its own +z (right) by strokeM at speedMps, with accelMps2, while extend is TRUE and back otherwise. Settings: strokeM, widthM, ' +
        'heightM, speedMps, accelMps2. Signals: extend, extended, retracted (within 1 mm of an end). Fault: stuck freezes the plate.',
      es:
        'Una placa que empuja piezas hacia un lado. Su posición es el centro de la placa retraída, justo sobre la superficie; se mueve ' +
        'a lo largo de su propio +z (derecha) strokeM a speedMps, con accelMps2, mientras extend es TRUE y vuelve en caso contrario. ' +
        'Ajustes: strokeM, widthM, heightM, speedMps, accelMps2. Señales: extend, extended, retracted (a menos de 1 mm de un extremo). ' +
        'Falla: stuck detiene la placa donde está.',
    },
  ),
  define(
    arm,
    { en: 'Diverter arm', es: 'Brazo desviador' },
    (part) => {
      const l = cfgNumber(part, armConfig, 'lengthM');
      return corners(0, l, l);
    },
    {
      en:
        'A plate hinged at the part position that lies along its own +x at rest (home). While divert is TRUE it swings towards its ' +
        'own +z (right) by angleDeg at degPerS, with a short ramp, and back otherwise; a box that travels along +x is deflected to the ' +
        'right. Settings: lengthM, heightM, angleDeg, degPerS. Signals: divert, diverted, home (within 0.5 degrees of an end). ' +
        'Fault: stuck freezes the arm.',
      es:
        'Una placa articulada en la posición de la pieza que reposa a lo largo de su propio +x (home). Mientras divert es TRUE gira ' +
        'hacia su propio +z (derecha) angleDeg a degPerS, con una rampa corta, y vuelve en caso contrario; una caja que viaja a lo ' +
        'largo de +x se desvía hacia la derecha. Ajustes: lengthM, heightM, angleDeg, degPerS. Señales: divert, diverted, home ' +
        '(a menos de 0,5 grados de un extremo). Falla: stuck detiene el brazo donde está.',
    },
  ),
];
