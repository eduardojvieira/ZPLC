import type { ConfigField, FactValue, PartView, PlantSignalDef, ScenePart, SnapPoint, Vec3 } from '../../contracts';
import { PLANT_STEP_MS, type PhysicsWorld } from '../world';
import { stepAxis, AT_LIMIT_M, type AxisState } from './axis';
import { createGripper } from './gripper';
import {
  ITEM_FRICTION,
  cfg,
  cfgNumber,
  rotateY,
  trackedItems,
  yawQuat,
  BOX_BASE,
  type PartRuntime,
  type RuntimePartDefinition,
} from './items';

// Layer palletizer (plan M3, Task K7). Part frame: local +x is the transfer axis, +y up, +z across; the part position is the floor
// (belt surface) point under the clamp head's home, which is the centre of the forming zone. Per-step arithmetic uses
// `+ - * /`, comparisons and Math.abs/min/max/round only; trigonometry only through `rotateY` at build time.
const DT_S = PLANT_STEP_MS / 1000;
const TRAVEL_MS = 400; // the squaring pusher, as the stop blade
const PLATE_T = 0.05; // thickness of the fixed plates and of the pusher
const PLATE_H = 0.5;
const PUSH_RETRACT_M = 0.15; // retracted, the pusher face stands this far outside the zone
const PAD_THICK = 0.03;
const CLAMP_DEPTH_M = 0.25; // as the clamp window of the gripper: item tops 0 to 0.25 m under the pad bottom
const ZONE_BELOW_M = 0.05;
const ZONE_ABOVE_M = 1; // boxes count in the zone up to this height over the part position
const REST_MPS = 0.05;
const RAIL_H = 0.05;
const ROUND = 1000;

const config: Record<string, ConfigField> = {
  variant: { kind: 'enum', values: ['digital', 'numeric'], default: 'digital' },
  strokeXM: { kind: 'number', min: 0.8, max: 3, default: 1.6, unit: 'm' },
  strokeYM: { kind: 'number', min: 0.3, max: 1.5, default: 0.8, unit: 'm' },
  speedMps: { kind: 'number', min: 0.1, max: 2, default: 0.8, unit: 'm/s' },
  accelMps2: { kind: 'number', min: 0.5, max: 10, default: 3, unit: 'm/s2' },
  columns: { kind: 'number', min: 1, max: 3, default: 2 },
  rows: { kind: 'number', min: 1, max: 3, default: 2 },
  maxLoadKg: { kind: 'number', min: 5, max: 60, default: 40, unit: 'kg' },
};
const num = (part: ScenePart, key: string) => cfgNumber(part, config, key);
const zoneSize = (part: ScenePart): [number, number] => [num(part, 'columns') * BOX_BASE[0], num(part, 'rows') * BOX_BASE[1]];
const round3 = (v: number) => Math.round(v * ROUND) / ROUND;

function signals(part: ScenePart): PlantSignalDef[] {
  const sx = num(part, 'strokeXM');
  const sy = num(part, 'strokeYM');
  const m = (name: string, direction: 'command' | 'sensor', max: number): PlantSignalDef => ({
    name: `${part.name}.${name}`,
    direction,
    type: 'REAL',
    unit: 'm',
    range: { min: 0, max },
  });
  const b = (name: string, direction: 'command' | 'sensor'): PlantSignalDef => ({ name: `${part.name}.${name}`, direction, type: 'BOOL' });
  const axes =
    cfg(part, config, 'variant') === 'numeric'
      ? [m('xSet', 'command', sx), m('ySet', 'command', sy), m('xPos', 'sensor', sx), m('yPos', 'sensor', sy)]
      : [
          ...['xPlus', 'xMinus', 'yPlus', 'yMinus'].map((n) => b(n, 'command')),
          ...['xAtMin', 'xAtMax', 'yAtMin', 'yAtMax'].map((n) => b(n, 'sensor')),
        ];
  return [...axes, b('square', 'command'), b('squared', 'sensor'), b('layerReady', 'sensor'), b('grip', 'command'), b('gripped', 'sensor')];
}

function runtime(part: ScenePart): PartRuntime {
  const numeric = cfg(part, config, 'variant') === 'numeric';
  const [W, D] = zoneSize(part);
  const maxItems = num(part, 'columns') * num(part, 'rows');
  const maxLoadKg = num(part, 'maxLoadKg');
  const strokes = [num(part, 'strokeXM'), num(part, 'strokeYM')] as const;
  const specs = strokes.map((strokeM) => ({ strokeM, speedMps: num(part, 'speedMps'), accelMps2: num(part, 'accelMps2') }));
  const [px, py, pz] = part.position;
  // World direction of local +x and +z, from the one allowed trigonometry (build time).
  const ux = rotateY(part.rotationYDeg, 1, 0);
  const uz = rotateY(part.rotationYDeg, 0, 1);
  const world2 = (lx: number, lz: number): [number, number] => [px + ux[0] * lx + uz[0] * lz, pz + ux[1] * lx + uz[1] * lz];
  const toLocal = (wx: number, wz: number): [number, number] => [
    (wx - px) * ux[0] + (wz - pz) * ux[1],
    (wx - px) * uz[0] + (wz - pz) * uz[1],
  ];
  // Axis-aligned half footprint of the pad in the world frame (the gripper window is axis-aligned).
  const c1 = rotateY(part.rotationYDeg, W / 2, D / 2);
  const c2 = rotateY(part.rotationYDeg, W / 2, -D / 2);
  const padHalf: readonly [number, number] = [Math.max(Math.abs(c1[0]), Math.abs(c2[0])), Math.max(Math.abs(c1[1]), Math.abs(c2[1]))];
  const quat = yawQuat(part.rotationYDeg);
  const padId = `${part.id}-pad`;
  const pusherId = `${part.id}-pusher`;
  const reach = W + D; // search radius of the zone query

  let world: PhysicsWorld | undefined;
  let gripper: ReturnType<typeof createGripper> | undefined;
  let axes: AxisState[] = [
    { p: 0, v: 0 },
    { p: 0, v: 0 },
  ];
  const targets = [0, 0];
  let travelMs = 0;
  let layerReady = false;
  let stuckAxis = [false, false];
  let squareStuck = false;
  let readyOff = false;
  let gripOn: boolean | undefined;
  let held = false;

  const padBottom = (): Vec3 => {
    const [wx, wz] = world2(axes[0]!.p, 0);
    return [wx, py + axes[1]!.p, wz];
  };
  const pusherPose = (): Vec3 => {
    const [wx, wz] = world2(0, D / 2 + PLATE_T / 2 + (1 - travelMs / TRAVEL_MS) * PUSH_RETRACT_M);
    return [wx, py + PLATE_H / 2, wz];
  };
  const plates: { id: string; p: Vec3; size: Vec3 }[] = [];
  const plate = (id: string, lx: number, lz: number, half: Vec3) => {
    const [wx, wz] = world2(lx, lz);
    plates.push({ id, p: [wx, py + PLATE_H / 2, wz], size: [half[0] * 2, half[1] * 2, half[2] * 2] });
    world!.addBody({
      id,
      kind: 'box',
      half,
      position: [wx, py + PLATE_H / 2, wz],
      rotationYDeg: part.rotationYDeg,
      massKg: 0,
      friction: ITEM_FRICTION,
      motion: 'static',
      layer: 'static',
    });
  };

  /** The layer-total load rule (plan K7): the clamp takes a layer only when the capturable boxes weigh at most `maxLoadKg` together. */
  const layerWithinLoad = (pad: Vec3): boolean => {
    const w = world!;
    const tracked = trackedItems(w);
    const poses = new Map(w.bodies().map((b) => [b.id, b]));
    let total = 0;
    for (const id of w.bodiesInBox([pad[0] - reach, pad[1] - 1, pad[2] - reach], [pad[0] + reach, pad[1] + 1, pad[2] + reach])) {
      const info = tracked.get(id);
      const b = poses.get(id);
      if (!info || info.kind !== 'item' || !b) continue;
      const below = pad[1] - (b.p[1] + info.size[1] / 2);
      if (Math.abs(b.p[0] - pad[0]) <= padHalf[0] && Math.abs(b.p[2] - pad[2]) <= padHalf[1] && below >= 0 && below <= CLAMP_DEPTH_M) {
        total += info.massKg;
      }
    }
    return total <= maxLoadKg;
  };

  const countZone = (): boolean => {
    const w = world!;
    const tracked = trackedItems(w);
    const poses = new Map(w.bodies().map((b) => [b.id, b]));
    let n = 0;
    for (const id of w.bodiesInBox([px - reach, py - ZONE_BELOW_M, pz - reach], [px + reach, py + ZONE_ABOVE_M, pz + reach])) {
      const info = tracked.get(id);
      const b = poses.get(id);
      if (!info || info.kind !== 'item' || !b) continue;
      const [lx, lz] = toLocal(b.p[0], b.p[2]);
      const still = b.v[0] * b.v[0] + b.v[1] * b.v[1] + b.v[2] * b.v[2] <= REST_MPS * REST_MPS;
      if (Math.abs(lx) <= W / 2 && Math.abs(lz) <= D / 2 && still) n += 1;
    }
    return n === maxItems;
  };

  const sensors = (): Record<string, boolean | number> => {
    const n = part.name;
    const [x, y] = [axes[0]!.p, axes[1]!.p];
    const out: Record<string, boolean | number> = numeric
      ? { [`${n}.xPos`]: x, [`${n}.yPos`]: y }
      : {
          [`${n}.xAtMin`]: x <= AT_LIMIT_M,
          [`${n}.xAtMax`]: x >= strokes[0] - AT_LIMIT_M,
          [`${n}.yAtMin`]: y <= AT_LIMIT_M,
          [`${n}.yAtMax`]: y >= strokes[1] - AT_LIMIT_M,
        };
    out[`${n}.squared`] = travelMs >= TRAVEL_MS;
    out[`${n}.layerReady`] = !readyOff && layerReady;
    out[`${n}.gripped`] = gripOn ?? held;
    return out;
  };

  return {
    build(w) {
      world = w;
      const T = PLATE_T;
      plate(`${part.id}-plate-far`, W / 2 + T / 2, 0, [T / 2, PLATE_H / 2, D / 2 + T]);
      plate(`${part.id}-plate-side`, 0, -(D / 2 + T / 2), [W / 2, PLATE_H / 2, T / 2]);
      // The pusher and the pad are kinematic bodies of the static layer (as the stop blade): items are pushed, a beam never sees them.
      w.addBody({
        id: pusherId,
        kind: 'box',
        half: [W / 2, PLATE_H / 2, T / 2],
        position: pusherPose(),
        rotationYDeg: part.rotationYDeg,
        massKg: 0,
        friction: ITEM_FRICTION,
        motion: 'kinematic',
        layer: 'static',
      });
      const bottom = padBottom();
      w.addBody({
        id: padId,
        kind: 'box',
        half: [W / 2, PAD_THICK / 2, D / 2],
        position: [bottom[0], bottom[1] + PAD_THICK / 2, bottom[2]],
        rotationYDeg: part.rotationYDeg,
        massKg: 0,
        friction: ITEM_FRICTION,
        motion: 'kinematic',
        layer: 'static',
      });
      gripper = createGripper(w, { kind: 'clamp', maxLoadKg, maxItems });
    },
    beforeStep(commands) {
      const w = world!;
      const n = part.name;
      if (!squareStuck)
        travelMs = Math.min(TRAVEL_MS, Math.max(0, travelMs + (commands[`${n}.square`] === true ? PLANT_STEP_MS : -PLANT_STEP_MS)));
      const dirs = (plus: string, minus: string): -1 | 0 | 1 =>
        commands[`${n}.${plus}`] === true ? (commands[`${n}.${minus}`] === true ? 0 : 1) : commands[`${n}.${minus}`] === true ? -1 : 0;
      axes = axes.map((a, i) => {
        if (numeric) {
          const v = commands[`${n}.${i === 0 ? 'xSet' : 'ySet'}`];
          if (typeof v === 'number' && Number.isFinite(v)) targets[i] = v;
          return stepAxis(a, { mode: 'goto', target: targets[i]! }, specs[i]!, DT_S, stuckAxis[i]!);
        }
        const dir = i === 0 ? dirs('xPlus', 'xMinus') : dirs('yPlus', 'yMinus');
        return stepAxis(a, { mode: 'jog', dir }, specs[i]!, DT_S, stuckAxis[i]!);
      });
      // A kinematic body keeps its last velocity: pose both bodies every step.
      w.setKinematicPose(pusherId, pusherPose(), quat);
      const bottom = padBottom();
      w.setKinematicPose(padId, [bottom[0], bottom[1] + PAD_THICK / 2, bottom[2]], quat);
      const grip = commands[`${n}.grip`] === true;
      // A layer heavier than `maxLoadKg` is never captured: the clamp is not closed on it.
      const closed = grip && (gripper!.held().length > 0 || layerWithinLoad(bottom));
      gripper!.update(closed, { id: padId, centre: bottom, half: padHalf });
    },
    afterStep() {
      gripper!.settle();
      held = gripper!.held().length > 0;
      layerReady = countZone();
    },
    sense: sensors,
    facts(): Record<string, FactValue> {
      const c = gripper!.counts();
      return {
        [`picked:${part.name}`]: c.picked,
        [`placed:${part.name}`]: c.placed,
        [`drops:${part.name}`]: c.drops,
        [`axis:${part.name}:x`]: round3(axes[0]!.p),
        [`axis:${part.name}:y`]: round3(axes[1]!.p),
      };
    },
    act(action) {
      switch (action) {
        case 'stuckX':
          stuckAxis = [true, stuckAxis[1]!];
          break;
        case 'stuckY':
          stuckAxis = [stuckAxis[0]!, true];
          break;
        case 'squareStuck':
          squareStuck = true;
          break;
        case 'gripFail':
        case 'dropLoad':
          gripper!.act(action);
          break;
        case 'grippedStuckOn':
          gripOn = true;
          break;
        case 'grippedStuckOff':
          gripOn = false;
          break;
        case 'layerReadyStuckOff':
          readyOff = true;
          break;
        default:
          throw new Error(`part "${part.name}" has no action "${action}"`);
      }
    },
    views(): readonly PartView[] {
      const [x, y] = [axes[0]!.p, axes[1]!.p];
      const bottom = padBottom();
      const q = quat;
      const pose = (id: string, kind: string, size: Vec3, p: Vec3) => ({ id, part: kind, kind: 'box' as const, size, p, q });
      const railY = py + strokes[1] + CLAMP_DEPTH_M + PAD_THICK + RAIL_H;
      const [fx, fz] = world2((strokes[0] + W) / 2 - W / 2, 0);
      const [bx, bz] = world2(x, 0);
      const colHeight = railY - bottom[1];
      return [
        {
          id: part.id,
          part: 'layer-palletizer',
          name: part.name,
          pose: { ...pose(part.id, 'layer-palletizer', [W, PAD_THICK, D], [bottom[0], bottom[1] + PAD_THICK / 2, bottom[2]]) },
          state: {
            x,
            y,
            z: 0,
            strokeX: strokes[0],
            strokeY: strokes[1],
            strokeZ: 0,
            fraction: x / strokes[0],
            text: `X ${x.toFixed(2)} m, Y ${y.toFixed(2)} m`,
            holding: held,
            gripper: 'clamp',
            variant: numeric ? 'numeric' : 'digital',
            closeFraction: gripper!.closeFraction(),
          },
          signals: Object.fromEntries(Object.entries(sensors()).map(([k, v]) => [k.slice(part.name.length + 1), v])),
        },
        {
          id: `${part.id}-frame`,
          part: 'manipulator-frame',
          name: part.name,
          pose: pose(`${part.id}-frame`, 'manipulator-frame', [strokes[0] + W, RAIL_H, RAIL_H], [fx, railY, fz]),
          state: {},
          signals: {},
        },
        {
          id: `${part.id}-beam`,
          part: 'manipulator-beam',
          name: part.name,
          pose: pose(`${part.id}-beam`, 'manipulator-beam', [RAIL_H, colHeight, RAIL_H], [bx, bottom[1] + colHeight / 2, bz]),
          state: {},
          signals: {},
        },
        {
          id: `${part.id}-pusher`,
          part: 'layer-pusher',
          name: part.name,
          pose: pose(`${part.id}-pusher`, 'layer-pusher', [W, PLATE_H, PLATE_T], pusherPose()),
          state: {},
          signals: {},
        },
        ...plates.map((pl) => ({
          id: pl.id,
          part: 'layer-plate',
          name: part.name,
          pose: pose(pl.id, 'layer-plate', pl.size, pl.p),
          state: {},
          signals: {},
        })),
      ];
    },
  };
}

function snapPoints(part: ScenePart): readonly SnapPoint[] {
  const [W, D] = zoneSize(part);
  const far = num(part, 'strokeXM') + W / 2;
  const corner = (name: string, x: number, z: number): SnapPoint => ({ name, position: [x, 0, z], normalYDeg: 0, accepts: [] });
  return [
    { name: 'infeed', position: [-W / 2, 0, 0], normalYDeg: 180, accepts: ['belt', 'roller', 'curved'] },
    corner('cornerNearMin', -W / 2, -D / 2),
    corner('cornerNearMax', -W / 2, D / 2),
    corner('cornerFarMin', far, -D / 2),
    corner('cornerFarMax', far, D / 2),
  ];
}

/** The layer palletizer (PRT-001 Stations row): not registered here, Task K8 registers it. */
export const stationParts: readonly RuntimePartDefinition[] = [
  {
    id: 'layer-palletizer',
    family: 'stations',
    names: { en: 'Layer palletizer', es: 'Paletizador de capas' },
    config,
    signals,
    actions: ['stuckX', 'stuckY', 'squareStuck', 'gripFail', 'dropLoad', 'grippedStuckOn', 'grippedStuckOff', 'layerReadyStuckOff'],
    snapPoints,
    doc: {
      en:
        'A station that squares boxes into a layer, lifts the whole layer with a clamp head and sets it on a pallet. Axes follow the ' +
        'world: X is the transfer along the part (local +x), Y is up. The part position is the floor point under the head at home, ' +
        'which is the centre of the forming zone; the pad bottom is at the part height plus the Y position. The forming zone is ' +
        'columns x 0.4 m by rows x 0.3 m; fixed plates close it at +x and -z, and the squaring pusher closes +z (it takes 0.4 s); ' +
        'boxes arrive from a belt at -x (snap point infeed). The pad is as large as the zone. Place the pallet centre at strokeXM ' +
        'along the part. The clamp closes in 0.3 s and takes up to columns x rows boxes at rest within 0.25 m under the pad; the layer ' +
        'is taken only if its total mass is at most maxLoadKg. layerReady is TRUE when exactly columns x rows boxes lie at rest in the ' +
        'zone. Variant digital: xPlus, xMinus, yPlus, yMinus (hold to move) and the limit sensors xAtMin, xAtMax, yAtMin, yAtMax; ' +
        'variant numeric: xSet, ySet and xPos, yPos in metres. Both: square, squared, layerReady, grip, gripped. Facts: picked, placed ' +
        'and drops count boxes; axis:<Name>:x and axis:<Name>:y are positions in metres. Faults: stuckX, stuckY, squareStuck, gripFail, ' +
        'dropLoad, grippedStuckOn, grippedStuckOff, layerReadyStuckOff. The axes start at 0, with the head at its lowest: raise it first.',
      es:
        'Una estación que escuadra cajas en una capa, levanta la capa completa con una cabeza de pinza y la coloca sobre una tarima. ' +
        'Los ejes siguen al mundo: X es el traslado a lo largo de la pieza (+x local), Y es hacia arriba. La posición de la pieza es el ' +
        'punto del piso bajo la cabeza en reposo, que es el centro de la zona de formación; la base de la placa está a la altura de la ' +
        'pieza más la posición Y. La zona de formación mide columns x 0,4 m por rows x 0,3 m; placas fijas la cierran en +x y -z, y ' +
        'el empujador de escuadra la cierra en +z (tarda 0,4 s); las cajas llegan por una cinta en -x (punto de unión infeed). La ' +
        'placa es tan grande como la zona. Ponga el centro de la tarima a strokeXM a lo largo de la pieza. La pinza se cierra en 0,3 s ' +
        'y toma hasta columns x rows cajas en reposo a menos de 0,25 m bajo la placa; toma la capa solo si su masa total es a lo sumo ' +
        'maxLoadKg. layerReady es TRUE cuando exactamente columns x rows cajas están en reposo en la zona. Variante digital: xPlus, ' +
        'xMinus, yPlus, yMinus (mantener para mover) y los sensores de límite xAtMin, xAtMax, yAtMin, yAtMax; variante numérica: xSet, ' +
        'ySet y xPos, yPos en metros. Ambas: square, squared, layerReady, grip, gripped. Hechos: picked, placed y drops cuentan cajas; ' +
        'axis:<Name>:x y axis:<Name>:y son posiciones en metros. Fallas: stuckX, stuckY, squareStuck, gripFail, dropLoad, ' +
        'grippedStuckOn, ' +
        'grippedStuckOff, layerReadyStuckOff. Los ejes inician en 0, con la cabeza en su punto más bajo: levántela primero.',
    },
    equations: {
      en:
        'Axis law per 5 ms step with a = accelMps2, v_max = speedMps: v moves toward the target velocity by at most a * dt; ' +
        'p = p + v * dt, clamped to 0..stroke. A set value brakes when |d - v * dt| <= v * v / (2 * a), d = target - p. ' +
        'Pusher: travel t moves 0..400 ms at 1 ms per ms; squared when t = 400 ms.',
      es:
        'Ley del eje por paso de 5 ms con a = accelMps2, v_max = speedMps: v se acerca a la velocidad objetivo en a * dt como máximo; ' +
        'p = p + v * dt, limitado a 0..carrera. Un valor de consigna frena cuando |d - v * dt| <= v * v / (2 * a), d = objetivo - p. ' +
        'Empujador: el recorrido t va de 0 a 400 ms; squared cuando t = 400 ms.',
    },
    runtime,
  },
];
