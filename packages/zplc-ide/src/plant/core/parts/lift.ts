import type { ConfigField, FactValue, PlantSignalDef, ScenePart, SnapPoint, Vec3 } from '../../contracts';
import type { PhysicsWorld } from '../world';
import { stepAxis, type AxisState } from './axis';
import { cfg, cfgNumber, ITEM_FRICTION, type PartRuntime, type RuntimePartDefinition } from './items';
import { yawEntry } from './yawTable';

const DT_S = 0.005; // one plant step
const THICKNESS = 0.1; // the part position is the centre of the top surface at level 1
const AT_LEVEL_M = 0.01; // atLevelK is TRUE within this distance of level K ...
const AT_REST_MPS = 0.02; // ... and at or below this axis speed
const ACCEPTS = ['belt', 'roller', 'curved', 'emitter', 'remover'];

const fields: Record<string, ConfigField> = {
  levels: { kind: 'number', min: 2, max: 4, default: 2 },
  levelPitchM: { kind: 'number', min: 0.3, max: 1.5, default: 0.6, unit: 'm' },
  lengthM: { kind: 'number', min: 0.8, max: 1.6, default: 1, unit: 'm' },
  widthM: { kind: 'number', min: 0.5, max: 1, default: 0.7, unit: 'm' },
  speedMps: { kind: 'number', min: 0.1, max: 1, default: 0.5, unit: 'm/s' },
  travelSpeedMps: { kind: 'number', min: 0.1, max: 1, default: 0.4, unit: 'm/s' },
  accelMps2: { kind: 'number', min: 0.1, max: 3, default: 0.8, unit: 'm/s2' },
  allowReverse: { kind: 'boolean', default: false },
};

const levelsOf = (part: ScenePart): number => Math.round(cfgNumber(part, fields, 'levels'));
const round3 = (v: number): number => Math.round(v * 1000) / 1000;

function runtime(part: ScenePart): PartRuntime {
  const { id, name } = part;
  const levels = levelsOf(part);
  const pitch = cfgNumber(part, fields, 'levelPitchM');
  const length = cfgNumber(part, fields, 'lengthM');
  const width = cfgNumber(part, fields, 'widthM');
  const speed = cfgNumber(part, fields, 'speedMps');
  const reverse = cfg(part, fields, 'allowReverse') === true;
  const spec = {
    strokeM: (levels - 1) * pitch,
    speedMps: cfgNumber(part, fields, 'travelSpeedMps'),
    accelMps2: cfgNumber(part, fields, 'accelMps2'),
  };
  // Table lookup, not libm (PLT-006).
  const yaw = yawEntry(part.rotationYDeg);
  let world: PhysicsWorld | undefined;
  let axis: AxisState = { p: 0, v: 0 };
  let stuck = false;
  let stalled = false;
  let levelStuckOff = false;
  const centre = (): Vec3 => [part.position[0], part.position[1] - THICKNESS / 2 + axis.p, part.position[2]];
  const atLevel = (k: number): boolean =>
    !levelStuckOff && Math.abs(axis.p - (k - 1) * pitch) <= AT_LEVEL_M && Math.abs(axis.v) <= AT_REST_MPS;
  const nearest = (): number => Math.min(levels, Math.max(1, Math.round(axis.p / pitch) + 1));
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
      w.addBelt({ id, bodyId: id, axis: [yaw.cos, 0, -yaw.sin], accelMps2: cfgNumber(part, fields, 'accelMps2') });
    },
    beforeStep(commands) {
      if (!world) return;
      const on = (key: string) => commands[`${name}.${key}`] === true;
      const dir = on('up') === on('down') ? 0 : on('up') ? 1 : -1;
      axis = stepAxis(axis, { mode: 'jog', dir }, spec, DT_S, stuck);
      const run = on('run');
      const back = reverse && on('runReverse');
      world.setBeltTarget(id, stalled || run === back ? 0 : run ? speed : -speed);
      // MoveKinematic keeps its last velocity: pose the platform every step, also to hold it still.
      world.setKinematicPose(id, centre(), yaw.q);
    },
    afterStep() {},
    sense() {
      const out: Record<string, boolean | number> = {};
      for (let k = 1; k <= levels; k += 1) out[`${name}.atLevel${k}`] = atLevel(k);
      return out;
    },
    facts: (): Record<string, FactValue> => ({ [`axis:${name}:y`]: round3(axis.p) }),
    act(action) {
      if (action === 'stuck') {
        stuck = true;
        axis = { p: axis.p, v: 0 };
      } else if (action === 'stall') stalled = true;
      else if (action === 'levelStuckOff') levelStuckOff = true;
      else throw new Error(`part "${name}" has no action "${action}"`);
    },
    views() {
      const level = nearest();
      const here = Math.abs(axis.p - (level - 1) * pitch) <= AT_LEVEL_M && Math.abs(axis.v) <= AT_REST_MPS;
      return [
        {
          id,
          part: 'lift',
          name,
          pose: { id, part: 'lift', kind: 'box', size: [length, THICKNESS, width], p: centre(), q: yaw.q },
          // A fault never changes a physical view: levelStuckOff leaves the lift drawn where it is.
          state: {
            fraction: spec.strokeM > 0 ? axis.p / spec.strokeM : 0,
            text: here ? `level ${level}` : 'travelling',
            level,
            speedMps: world ? world.beltSpeed(id) : 0,
            stuck,
            stalled,
            levelStuckOff,
          },
          signals: Object.fromEntries(Array.from({ length: levels }, (_, i) => [`atLevel${i + 1}`, atLevel(i + 1)])),
        },
      ];
    },
  };
}

function signals(part: ScenePart): PlantSignalDef[] {
  const n = part.name;
  const cmd = (k: string): PlantSignalDef => ({ name: `${n}.${k}`, direction: 'command', type: 'BOOL' });
  const out = [cmd('up'), cmd('down'), cmd('run')];
  if (cfg(part, fields, 'allowReverse') === true) out.push(cmd('runReverse'));
  for (let k = 1; k <= levelsOf(part); k += 1) out.push({ name: `${n}.atLevel${k}`, direction: 'sensor', type: 'BOOL' });
  return out;
}

const snapPoints = (part: ScenePart): SnapPoint[] => {
  const half = cfgNumber(part, fields, 'lengthM') / 2;
  const pitch = cfgNumber(part, fields, 'levelPitchM');
  const out: SnapPoint[] = [];
  for (let k = 1; k <= levelsOf(part); k += 1)
    out.push({ name: `in${k}`, position: [-half, (k - 1) * pitch, 0], normalYDeg: 180, accepts: ACCEPTS });
  for (let k = 1; k <= levelsOf(part); k += 1)
    out.push({ name: `out${k}`, position: [half, (k - 1) * pitch, 0], normalYDeg: 0, accepts: ACCEPTS });
  return out;
};

/** The lift (PRT-001): a kinematic belt platform that travels between two to four levels and reports each one. */
export const liftParts: readonly RuntimePartDefinition[] = [
  {
    id: 'lift',
    family: 'conveyors',
    names: { en: 'Lift', es: 'Elevador' },
    config: fields,
    signals,
    actions: ['stuck', 'stall', 'levelStuckOff'],
    snapPoints,
    doc: {
      en:
        'A platform with a belt surface that travels vertically between levels. Its position is the centre of the top surface at ' +
        'level 1, the lowest; level K is (K - 1) times levelPitchM above it, for levels 2 to 4. up TRUE moves it up and down TRUE ' +
        'moves it down at travelSpeedMps with accelMps2; both or neither hold it, and it stops at the ends. The surface carries items ' +
        'along its own +x (right is +z): run, and runReverse when reverse is allowed, at speedMps. atLevelK is TRUE within 0.01 m of ' +
        'level K once the platform moves at 0.02 m/s or less. It has in and out landings at every level (in1 to inN, out1 to outN). ' +
        'The setting lengthM and widthM size the platform. Do not confuse it with the chain transfer, whose lift signal raises a ' +
        'short module; here the commands are up and down. The plant inhibits nothing: a platform that travels while its surface ' +
        'runs may lose its load. Facts: axis:Name:y, the height above level 1 in metres. Faults: stuck, stall, levelStuckOff.',
      es:
        'Una plataforma con superficie de cinta que se mueve en vertical entre niveles. Su posición es el centro de la superficie ' +
        'superior en el nivel 1, el más bajo; el nivel K está (K - 1) veces levelPitchM por encima, con 2 a 4 niveles. up en TRUE ' +
        'la sube y down en TRUE la baja a travelSpeedMps con accelMps2; con ambas o ninguna se mantiene, y se detiene en los ' +
        'extremos. La superficie lleva las piezas a lo largo de su propio +x (la derecha es +z): run, y runReverse si se permite el ' +
        'sentido inverso, a speedMps. atLevelK es TRUE a menos de 0,01 m del nivel K cuando la plataforma se mueve a 0,02 m/s o ' +
        'menos. Tiene entrada y salida en cada nivel (in1 a inN, out1 a outN). Los ajustes lengthM y widthM dan el tamaño. No ' +
        'confundir con la transferencia de cadenas, cuya señal lift sube un módulo corto; aquí las órdenes son up y down. La planta ' +
        'no inhibe nada: una plataforma que se mueve con la superficie en marcha puede perder su carga. Hechos: axis:Nombre:y, la ' +
        'altura sobre el nivel 1 en metros. Fallas: stuck, stall, levelStuckOff.',
    },
    runtime,
  },
];
