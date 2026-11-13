import type { ConfigField, FactValue, PartView, PlantSignalDef, ScenePart, SnapPoint, Vec3 } from '../../contracts';
import { PLANT_STEP_MS, type PhysicsWorld } from '../world';
import { stepAxis, type AxisCommand, type AxisSpec, type AxisState } from './axis';
import { cfgNumber, ITEM_FRICTION, trackedItems, type PartRuntime, type RuntimePartDefinition } from './items';
import { yawEntry } from './yawTable';

// Stacker crane with a rack (plan M5, Task B2, rules R5-S to R5-S3). Part frame: local +x is the aisle, +y up, +z across; the
// part position is the floor point under the crane at bay 0. The rack is on the +z side. The carriage and the mast are views;
// the bodies are the fork (a kinematic belt plate, posed every step) and the static rack rails. Per-step arithmetic uses
// `+ - * /`, comparisons and Math.abs/min/max/round only; rotations come from the yaw table (no libm).
const DT_S = PLANT_STEP_MS / 1000;
const PLATE_W = 0.16; // across x; it passes between the rails of a cell
const PLATE_L = 0.6; // along z
const PLATE_T = 0.04;
const RAIL_W = 0.05;
const RAIL_H = 0.1;
const RAIL_L = 0.6;
const RAIL_DX = 0.12; // rail centre offset from the column centre
const SHELF_TOP_M = 0.1; // rail tops over the level height
const FORK_BELOW_M = 0.03; // the fork top is this far under the rail tops when lowered, and the same above when raised
const RAISE_M = 0.06;
const RAISE_SPEED_MPS = 0.1;
const POS_TOL_M = 0.005;
const SETTLED_MPS = 0.02;
const REST_MPS = 0.05;
const LOAD_REACH_M = 0.1;
const LOAD_TOL_M = 0.02;
const CELL_CENTRE_M = 0.1; // an item centre this close to the column centre rests on both rails
const CELL_LOW_M = -0.01;
const CELL_HIGH_M = 0.015; // a box on the raised fork sits 0.03 over the rails: not stored
const ROUND = 1000;

const config: Record<string, ConfigField> = {
  columns: { kind: 'number', min: 1, max: 8, default: 4 },
  levels: { kind: 'number', min: 1, max: 4, default: 3 },
  bayPitchM: { kind: 'number', min: 0.7, max: 1.5, default: 1, unit: 'm' },
  levelPitchM: { kind: 'number', min: 0.4, max: 1, default: 0.6, unit: 'm' },
  forkStrokeM: { kind: 'number', min: 0.6, max: 1, default: 0.8, unit: 'm' },
  speedXMps: { kind: 'number', min: 0.2, max: 1.5, default: 1, unit: 'm/s' },
  speedYMps: { kind: 'number', min: 0.2, max: 1, default: 0.5, unit: 'm/s' },
  forkSpeedMps: { kind: 'number', min: 0.1, max: 0.8, default: 0.4, unit: 'm/s' },
  beltSpeedMps: { kind: 'number', min: 0.1, max: 0.8, default: 0.4, unit: 'm/s' },
  accelMps2: { kind: 'number', min: 0.5, max: 3, default: 1.5, unit: 'm/s2' },
  maxLoadKg: { kind: 'number', min: 5, max: 30, default: 10, unit: 'kg' },
};
const num = (part: ScenePart, key: string) => cfgNumber(part, config, key);
const round3 = (v: number) => Math.round(v * ROUND) / ROUND;

function signals(part: ScenePart): PlantSignalDef[] {
  const n = part.name;
  const b = (name: string, direction: 'command' | 'sensor'): PlantSignalDef => ({ name: `${n}.${name}`, direction, type: 'BOOL' });
  return [
    { name: `${n}.bay`, direction: 'command', type: 'INT', unit: 'bay', range: { min: 0, max: num(part, 'columns') } },
    { name: `${n}.level`, direction: 'command', type: 'INT', unit: 'level', range: { min: 0, max: num(part, 'levels') } },
    b('inPosition', 'sensor'),
    b('raise', 'command'),
    b('raised', 'sensor'),
    b('forkLeft', 'command'),
    b('forkRight', 'command'),
    b('forkCentre', 'sensor'),
    b('forkAtLeft', 'sensor'),
    b('forkAtRight', 'sensor'),
    b('beltLeft', 'command'),
    b('beltRight', 'command'),
    b('loaded', 'sensor'),
  ];
}

function runtime(part: ScenePart): PartRuntime {
  const name = part.name;
  const columns = num(part, 'columns');
  const levels = num(part, 'levels');
  const bayPitch = num(part, 'bayPitchM');
  const levelPitch = num(part, 'levelPitchM');
  const stroke = num(part, 'forkStrokeM');
  const beltSpeed = num(part, 'beltSpeedMps');
  const maxLoadKg = num(part, 'maxLoadKg');
  const accel = num(part, 'accelMps2');
  const specX: AxisSpec = { strokeM: columns * bayPitch, speedMps: num(part, 'speedXMps'), accelMps2: accel };
  const specY: AxisSpec = { strokeM: levels * levelPitch, speedMps: num(part, 'speedYMps'), accelMps2: accel };
  const specZ: AxisSpec = { strokeM: 2 * stroke, speedMps: num(part, 'forkSpeedMps'), accelMps2: accel };
  const specR: AxisSpec = { strokeM: RAISE_M, speedMps: RAISE_SPEED_MPS, accelMps2: accel };
  const [px, py, pz] = part.position;
  const yaw = yawEntry(part.rotationYDeg);
  const forkId = `${part.id}-fork`;
  const beltAxis: Vec3 = [yaw.sin, 0, yaw.cos];
  // Local to world and back, with the yaw table (local +x = (cos, -sin), local +z = (sin, cos) in the world xz plane).
  const toWorld = (lx: number, lz: number): [number, number] => [px + lx * yaw.cos + lz * yaw.sin, pz - lx * yaw.sin + lz * yaw.cos];
  const toLocal = (wx: number, wz: number): [number, number] => [
    (wx - px) * yaw.cos - (wz - pz) * yaw.sin,
    (wx - px) * yaw.sin + (wz - pz) * yaw.cos,
  ];
  const railZ = stroke; // the rails are centred on the fully extended fork
  const railTop = (level: number) => level * levelPitch + SHELF_TOP_M;

  let world: PhysicsWorld | undefined;
  let ax: AxisState = { p: 0, v: 0 };
  let ay: AxisState = { p: 0, v: 0 };
  let az: AxisState = { p: stroke, v: 0 }; // 0..2 * stroke, centre at stroke
  let ar: AxisState = { p: 0, v: 0 };
  let targetBay = 0;
  let targetLevel = 0;
  let wasRefused = false;
  let blocked = 0;
  let stuckX = false;
  let stuckY = false;
  let forkStuck = false;
  let loadedOff = false;
  let beltStall = false;
  let loaded = false;
  let overload = false;
  let cells: boolean[] = [];
  let stored = 0;

  const zPos = () => az.p - stroke;
  const forkTop = () => ay.p + SHELF_TOP_M - FORK_BELOW_M + ar.p; // over the part position
  const forkPose = (): Vec3 => {
    const [wx, wz] = toWorld(ax.p, zPos());
    return [wx, py + forkTop() - PLATE_T / 2, wz];
  };
  const inPosition = () =>
    Math.abs(ax.p - targetBay * bayPitch) <= POS_TOL_M &&
    Math.abs(ay.p - targetLevel * levelPitch) <= POS_TOL_M &&
    Math.abs(ax.v) <= SETTLED_MPS &&
    Math.abs(ay.v) <= SETTLED_MPS;

  const rackBox = (): [Vec3, Vec3] => {
    const xs = [bayPitch - 0.2, columns * bayPitch + 0.2];
    const zs = [railZ - RAIL_L / 2, railZ + RAIL_L / 2];
    const pts = xs.flatMap((x) => zs.map((z) => toWorld(x, z)));
    return [
      [Math.min(...pts.map((p) => p[0])), py, Math.min(...pts.map((p) => p[1]))],
      [Math.max(...pts.map((p) => p[0])), py + levels * levelPitch + SHELF_TOP_M + 1, Math.max(...pts.map((p) => p[1]))],
    ];
  };

  /** One pass over the items near the crane: the cells at rest on their rails and the load on the fork (R5-S2, R5-S3). */
  const scan = () => {
    const w = world!;
    const tracked = trackedItems(w);
    const poses = new Map(w.bodies().map((b) => [b.id, b]));
    const next = cells.map(() => false);
    let onFork = false;
    let forkKg = 0;
    const [fx, fz] = toWorld(ax.p, zPos());
    const top = py + forkTop();
    for (const b of poses.values()) {
      const info = tracked.get(b.id);
      if (!info || info.kind !== 'item') continue;
      const bottom = b.p[1] - info.size[1] / 2;
      if (Math.abs(b.p[0] - fx) <= LOAD_REACH_M && Math.abs(b.p[2] - fz) <= LOAD_REACH_M && Math.abs(bottom - top) <= LOAD_TOL_M) {
        onFork = true;
        forkKg += info.massKg;
      }
    }
    const [lo, hi] = rackBox();
    for (const id of w.bodiesInBox(lo, hi)) {
      const info = tracked.get(id);
      const b = poses.get(id);
      if (!info || info.kind !== 'item' || !b) continue;
      const rest = b.v[0] * b.v[0] + b.v[1] * b.v[1] + b.v[2] * b.v[2] <= REST_MPS * REST_MPS;
      const [lx, lz] = toLocal(b.p[0], b.p[2]);
      const c = Math.round(lx / bayPitch);
      const high = b.p[1] - info.size[1] / 2 - py - SHELF_TOP_M;
      const l = Math.round(high / levelPitch);
      if (!rest || c < 1 || c > columns || l < 1 || l > levels || Math.abs(lx - c * bayPitch) > CELL_CENTRE_M) continue;
      if (Math.abs(lz - railZ) > RAIL_L / 2) continue;
      const off = high - l * levelPitch;
      if (off >= CELL_LOW_M && off <= CELL_HIGH_M) next[(c - 1) * levels + (l - 1)] = true;
    }
    cells = next;
    stored = next.filter(Boolean).length;
    loaded = onFork;
    overload = forkKg > maxLoadKg;
  };

  const sensors = (): Record<string, boolean | number> => ({
    [`${name}.inPosition`]: inPosition(),
    [`${name}.raised`]: ar.p >= RAISE_M - 0.001,
    [`${name}.forkCentre`]: Math.abs(zPos()) <= POS_TOL_M,
    [`${name}.forkAtLeft`]: zPos() <= -stroke + POS_TOL_M,
    [`${name}.forkAtRight`]: zPos() >= stroke - POS_TOL_M,
    [`${name}.loaded`]: loaded && !loadedOff,
  });

  return {
    build(w) {
      world = w;
      cells = new Array<boolean>(columns * levels).fill(false);
      w.addBody({
        id: forkId,
        kind: 'box',
        half: [PLATE_W / 2, PLATE_T / 2, PLATE_L / 2],
        position: forkPose(),
        rotationYDeg: part.rotationYDeg,
        massKg: 0,
        friction: ITEM_FRICTION,
        motion: 'kinematic',
        layer: 'static',
      });
      w.addBelt({ id: forkId, bodyId: forkId, axis: beltAxis, accelMps2: accel });
      for (let c = 1; c <= columns; c += 1) {
        for (let l = 1; l <= levels; l += 1) {
          for (const side of [-1, 1]) {
            const [wx, wz] = toWorld(c * bayPitch + side * RAIL_DX, railZ);
            w.addBody({
              id: `${part.id}-rail-${c}-${l}-${side < 0 ? 'a' : 'b'}`,
              kind: 'box',
              half: [RAIL_W / 2, RAIL_H / 2, RAIL_L / 2],
              position: [wx, py + railTop(l) - RAIL_H / 2, wz],
              rotationYDeg: part.rotationYDeg,
              massKg: 0,
              friction: ITEM_FRICTION,
              motion: 'static',
              layer: 'static',
            });
          }
        }
      }
    },
    beforeStep(commands) {
      const w = world!;
      const on = (key: string) => commands[`${name}.${key}`] === true;
      // The INT setpoints saturate at their range (rule R-X2 of the core); a value that is not a finite number changes nothing.
      const bay = commands[`${name}.bay`];
      const level = commands[`${name}.level`];
      if (typeof bay === 'number' && Number.isFinite(bay)) targetBay = Math.min(columns, Math.max(0, Math.round(bay)));
      if (typeof level === 'number' && Number.isFinite(level)) targetLevel = Math.min(levels, Math.max(0, Math.round(level)));
      const tx = targetBay * bayPitch;
      const ty = targetLevel * levelPitch;
      // R5-S4: X and Y are held while the fork is out (or the load is too heavy); a refused request is counted on its rising edge.
      const inhibited = Math.abs(zPos()) > POS_TOL_M || overload;
      const refused = inhibited && (Math.abs(tx - ax.p) > POS_TOL_M || Math.abs(ty - ay.p) > POS_TOL_M);
      if (refused && !wasRefused) blocked += 1;
      wasRefused = refused;
      ax = stepAxis(ax, inhibited ? { mode: 'jog', dir: 0 } : { mode: 'goto', target: tx }, specX, DT_S, stuckX);
      ay = stepAxis(ay, inhibited ? { mode: 'jog', dir: 0 } : { mode: 'goto', target: ty }, specY, DT_S, stuckY);
      const left = on('forkLeft');
      const right = on('forkRight');
      const forkCmd: AxisCommand =
        left && right ? { mode: 'jog', dir: 0 } : { mode: 'goto', target: left ? 0 : right ? 2 * stroke : stroke };
      az = stepAxis(az, forkCmd, specZ, DT_S, forkStuck);
      ar = stepAxis(ar, { mode: 'goto', target: on('raise') ? RAISE_M : 0 }, specR, DT_S, false);
      const bl = on('beltLeft');
      const br = on('beltRight');
      w.setBeltTarget(forkId, beltStall || bl === br ? 0 : br ? beltSpeed : -beltSpeed);
      // A kinematic body keeps its last velocity: pose the fork every step, also to hold it still.
      w.setKinematicPose(forkId, forkPose(), yaw.q);
    },
    afterStep: scan,
    sense: sensors,
    facts(): Record<string, FactValue> {
      const out: Record<string, FactValue> = {
        [`stored:${name}`]: stored,
        [`blocked:${name}`]: blocked,
        [`axis:${name}:x`]: round3(ax.p),
        [`axis:${name}:y`]: round3(ay.p),
        [`axis:${name}:z`]: round3(zPos()),
      };
      for (let c = 1; c <= columns; c += 1)
        for (let l = 1; l <= levels; l += 1) out[`cell:${name}:${c}:${l}`] = cells[(c - 1) * levels + (l - 1)]!;
      return out;
    },
    act(action) {
      switch (action) {
        case 'stuckX':
          stuckX = true;
          break;
        case 'stuckY':
          stuckY = true;
          break;
        case 'forkStuck':
          forkStuck = true;
          break;
        case 'loadedStuckOff':
          loadedOff = true;
          break;
        case 'beltStall':
          beltStall = true;
          break;
        default:
          throw new Error(`part "${name}" has no action "${action}"`);
      }
    },
    views(): readonly PartView[] {
      const q = yaw.q;
      const pose = (id: string, kind: string, size: Vec3, p: Vec3) => ({ id, part: kind, kind: 'box' as const, size, p, q });
      const mastH = levels * levelPitch + SHELF_TOP_M + 0.4;
      const [mx, mz] = toWorld(ax.p, 0);
      const [cx, cz] = toWorld(ax.p, zPos());
      const rackW = (columns - 1) * bayPitch + 0.4;
      const [rx, rz] = toWorld((bayPitch * (columns + 1)) / 2, railZ + RAIL_L / 2 + 0.025);
      const rackH = levels * levelPitch + SHELF_TOP_M;
      const z = zPos();
      const pos = Object.fromEntries(Object.entries(sensors()).map(([k, v]) => [k.slice(name.length + 1), v]));
      const fork = Math.abs(z) <= POS_TOL_M ? 'fork centre' : z < 0 ? 'fork left' : 'fork right';
      const bayNow = Math.round(ax.p / bayPitch);
      const levelNow = Math.round(ay.p / levelPitch);
      return [
        {
          id: part.id,
          part: 'stacker-crane',
          name,
          pose: pose(part.id, 'stacker-crane', [PLATE_L, PLATE_T, PLATE_W], [cx, py + forkTop() - PLATE_T / 2, cz]),
          state: {
            fraction: z / stroke,
            text: `bay ${bayNow}, level ${levelNow}, ${fork}`,
            bay: bayNow,
            level: levelNow,
            raised: ar.p >= RAISE_M - 0.001,
          },
          signals: pos,
        },
        {
          id: `${part.id}-mast`,
          part: 'stacker-mast',
          name,
          pose: pose(`${part.id}-mast`, 'stacker-mast', [0.1, mastH, 0.1], [mx, py + mastH / 2, mz]),
          state: {},
          signals: {},
        },
        {
          id: `${part.id}-rack`,
          part: 'stacker-rack',
          name,
          pose: pose(`${part.id}-rack`, 'stacker-rack', [rackW, rackH, 0.05], [rx, py + rackH / 2, rz]),
          state: {},
          signals: {},
        },
      ];
    },
  };
}

function snapPoints(part: ScenePart): readonly SnapPoint[] {
  const stroke = num(part, 'forkStrokeM');
  const columns = num(part, 'columns');
  const pitch = num(part, 'bayPitchM');
  const belts = ['belt', 'roller', 'curved'];
  const [x0, x1] = [pitch - 0.2, columns * pitch + 0.2];
  const [z0, z1] = [stroke - RAIL_L / 2, stroke + RAIL_L / 2];
  const corner = (n: string, x: number, z: number): SnapPoint => ({ name: n, position: [x, 0, z], normalYDeg: 0, accepts: [] });
  return [
    { name: 'dockIn', position: [0, 0, -(stroke + PLATE_L / 2)], normalYDeg: 90, accepts: belts },
    { name: 'dockOut', position: [0, 0, stroke + PLATE_L / 2], normalYDeg: 270, accepts: belts },
    corner('rackNearMin', x0, z0),
    corner('rackNearMax', x0, z1),
    corner('rackFarMin', x1, z0),
    corner('rackFarMax', x1, z1),
  ];
}

/** The stacker crane with its rack (PRT-001 Stations row): not registered here, Task K10 registers it. */
export const stackerParts: readonly RuntimePartDefinition[] = [
  {
    id: 'stacker-crane',
    family: 'stations',
    names: { en: 'Stacker crane', es: 'Transelevador' },
    config,
    signals,
    actions: ['stuckX', 'stuckY', 'forkStuck', 'loadedStuckOff', 'beltStall'],
    snapPoints,
    doc: {
      en:
        'A crane that stores boxes in a rack and takes them out again. Axes follow the world: X runs along the aisle (local +x), Y is ' +
        'the mast, the fork moves across (local z) and a small raise axis lifts it by 0.06 m. The part position is the floor point ' +
        'under the crane at bay 0. The INT setpoint bay (0 to columns) sends X to bay x bayPitchM and the INT setpoint level (0 to ' +
        'levels) sends Y to level x levelPitchM; inPosition is TRUE when both are within 5 mm and at rest. Level 0 is the dock: ' +
        'levels start at 1 for the rack shelves. The fork top is 0.03 m under the shelf top of the addressed level, and 0.03 m over ' +
        'it while raise is TRUE (raised). Place the dock belts with their top 0.13 m over the part position, ending at the fork tip ' +
        '(snap points dockIn at -z and dockOut at +z). forkLeft extends the fork towards -z and forkRight towards +z (hold to ' +
        'extend, release to centre, both hold); forkCentre, forkAtLeft and forkAtRight report its place. The fork surface is a belt: ' +
        'beltRight runs it towards +z, beltLeft towards -z (both do nothing). The rack is on the +z side: column c (1 to columns) and ' +
        'level l (1 to levels) is a pair of rails, 0.24 m apart, whose tops are l x levelPitchM + 0.1 m over the part position; a box ' +
        '0.3 m wide (x) and 0.4 m long (z) rests on both rails and the 0.16 m wide fork passes between them. Store: raise the fork ' +
        'loaded, extend it to the right, lower it, retract it. Retrieve: extend it lowered, raise it, retract it. X and Y stop while the ' +
        'fork is out (or the load is above maxLoadKg), and blocked counts each refused request once. The fork passes through the ' +
        'rails: extend it only at inPosition. loaded is TRUE while a box rests on the centre of the fork. Facts: stored:<Name> counts ' +
        'the cells with a box at rest, cell:<Name>:<c>:<l> is TRUE for each occupied cell, blocked:<Name> counts refused requests and ' +
        'axis:<Name>:x, :y and :z are positions in metres (z is signed, 0 at the centre). Faults: stuckX, stuckY, forkStuck, ' +
        'loadedStuckOff, beltStall. Known limits: one rack, on one side, one box deep; the crane starts at bay 0, level 0, fork down.',
      es:
        'Una grúa que guarda cajas en un estante y las saca de nuevo. Los ejes siguen al mundo: X recorre el pasillo (+x local), Y es ' +
        'el mástil, la horquilla se mueve a lo ancho (z local) y un pequeño eje de elevación la sube 0,06 m. La posición de la pieza ' +
        'es el punto del piso bajo la grúa en la bahía 0. La consigna INT bay (0 a columns) lleva X a bay x bayPitchM y la consigna ' +
        'INT level (0 a levels) lleva Y a level x levelPitchM; inPosition es TRUE cuando ambos están a menos de 5 mm y en reposo. El ' +
        'nivel 0 es el muelle: los niveles 1 en adelante son los estantes. La parte superior de la horquilla está 0,03 m bajo la ' +
        'parte superior del estante del nivel indicado, y 0,03 m sobre ella mientras raise es TRUE (raised). Ponga las cintas del ' +
        'muelle con su superficie a 0,13 m sobre la posición de la pieza, terminando en la punta de la horquilla (puntos de unión ' +
        'dockIn en -z y dockOut en +z). forkLeft extiende la horquilla hacia -z y forkRight hacia +z (mantener para extender, soltar ' +
        'para centrar, ambas la mantienen); forkCentre, forkAtLeft y forkAtRight informan su posición. La superficie de la horquilla ' +
        'es una cinta: beltRight la mueve hacia +z, beltLeft hacia -z (ambas no hacen nada). El estante está del lado +z: la columna c ' +
        '(1 a columns) y el nivel l (1 a levels) son un par de rieles, separados 0,24 m, cuyas partes superiores están a l x ' +
        'levelPitchM + 0,1 m sobre la posición de la pieza; una caja de 0,3 m de ancho (x) y 0,4 m de largo (z) descansa sobre ambos ' +
        'rieles y la horquilla de 0,16 m de ancho pasa entre ellos. Guardar: suba la horquilla cargada, extiéndala a la derecha, ' +
        'bájela y recójala. Retirar: extiéndala baja, súbala y recójala. X e Y se detienen mientras la horquilla está afuera (o la ' +
        'carga supera maxLoadKg), y blocked cuenta cada petición rechazada una vez. La horquilla atraviesa los rieles: extiéndala ' +
        'solo con inPosition. loaded es TRUE mientras una caja descansa en el centro de la horquilla. Hechos: stored:<Name> cuenta ' +
        'las celdas con una caja en reposo, cell:<Name>:<c>:<l> es TRUE en cada celda ocupada, blocked:<Name> cuenta las peticiones ' +
        'rechazadas y axis:<Name>:x, :y y :z son posiciones en metros (z con signo, 0 en el centro). Fallas: stuckX, stuckY, ' +
        'forkStuck, loadedStuckOff, beltStall. Límites conocidos: un estante, de un solo lado, una caja de fondo; la grúa inicia en ' +
        'la bahía 0, nivel 0, con la horquilla abajo.',
    },
    runtime,
  },
];
