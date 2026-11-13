import type { ConfigField, FactValue, PartView, ScenePart, SnapPoint, Vec3 } from '../../contracts';
import type { PhysicsWorld } from '../world';
import { cfgNumber, ITEM_FRICTION, rotateY, trackedItems, type PartRuntime, type RuntimePartDefinition } from './items';
import { marker } from './sensors';
import { yawEntry } from './yawTable';

const STEP_MS = 5;
const TRAVEL_MS = 400; // PRT-003: the aligner guides take 0.4 s between their limits
const GUIDE_THICKNESS = 0.05;
const GUIDE_HEIGHT = 0.15;
const LEVER_HALF_WIDTH = 0.05; // the limit switch lever is 0.1 m across
const PLATE_THICKNESS = 0.02;
const CHUTE_FRICTION = 0.2;
const ACCEPTS = ['belt', 'roller', 'curved', 'emitter', 'remover'];

// ---- limit switch -------------------------------------------------------------------------------------------------------------------

const switchFields: Record<string, ConfigField> = {
  reachM: { kind: 'number', min: 0.02, max: 0.2, default: 0.05, unit: 'm' },
  heightM: { kind: 'number', min: 0, max: 2, default: 0.1, unit: 'm' },
};

/** A lever box in front of the part (local +x): contact is TRUE while the centre of a tracked item is inside it. */
function switchRuntime(part: ScenePart): PartRuntime {
  const reach = cfgNumber(part, switchFields, 'reachM');
  const height = cfgNumber(part, switchFields, 'heightM');
  const [px, py, pz] = part.position;
  // Build-time geometry (may use libm): the axis-aligned box that bounds the lever, turned by the part rotation.
  const ends = [rotateY(part.rotationYDeg, 0, -LEVER_HALF_WIDTH), rotateY(part.rotationYDeg, reach, LEVER_HALF_WIDTH)];
  const more = [rotateY(part.rotationYDeg, 0, LEVER_HALF_WIDTH), rotateY(part.rotationYDeg, reach, -LEVER_HALF_WIDTH)];
  const xs = [...ends, ...more].map((e) => px + e[0]);
  const zs = [...ends, ...more].map((e) => pz + e[1]);
  const min: Vec3 = [Math.min(...xs), py, Math.min(...zs)];
  const max: Vec3 = [Math.max(...xs), py + height, Math.max(...zs)];
  const [cx, cz] = rotateY(part.rotationYDeg, reach / 2, 0);
  let world: PhysicsWorld | undefined;
  let contact = false;
  let stuck: boolean | undefined;
  let count = 0;
  return {
    build(w) {
      world = w;
    },
    beforeStep() {},
    afterStep() {
      let touched = false;
      if (world) {
        const items = trackedItems(world);
        touched = world.bodiesInBox(min, max).some((id) => items.has(id));
      }
      const next = stuck ?? touched;
      if (next && !contact) count += 1;
      contact = next;
    },
    sense: () => ({ [`${part.name}.contact`]: contact }),
    facts: (): Record<string, FactValue> => ({ [`count:${part.name}`]: count }),
    act(action) {
      if (action === 'stuckOn') stuck = true;
      else if (action === 'stuckOff') stuck = false;
      else throw new Error(`part "${part.name}" has no action "${action}"`);
    },
    views: (): PartView[] => [
      {
        id: part.id,
        part: 'limit-switch',
        name: part.name,
        pose: marker(part, 'limit-switch', [reach, height, LEVER_HALF_WIDTH * 2], [px + cx, py + height / 2, pz + cz]),
        state: { contact, count, reachM: reach, heightM: height },
        signals: { contact },
      },
    ],
  };
}

// ---- aligner ------------------------------------------------------------------------------------------------------------------------

const alignerFields: Record<string, ConfigField> = {
  widthM: { kind: 'number', min: 0.4, max: 1, default: 0.7, unit: 'm' },
  gapM: { kind: 'number', min: 0.2, max: 0.6, default: 0.35, unit: 'm' },
  lengthM: { kind: 'number', min: 0.2, max: 0.8, default: 0.4, unit: 'm' },
};

/** Two kinematic guides at +z and -z of the belt that close to gapM on `align` over 0.4 s (the blade technique of flow.ts). */
function alignerRuntime(part: ScenePart): PartRuntime {
  const width = cfgNumber(part, alignerFields, 'widthM');
  // A gap wider than the span the guides sit on never closes outwards.
  const gap = Math.min(cfgNumber(part, alignerFields, 'gapM'), width);
  const length = cfgNumber(part, alignerFields, 'lengthM');
  const yaw = yawEntry(part.rotationYDeg); // table lookup, not libm (PLT-006)
  const ids = [`${part.id}-guide-right`, `${part.id}-guide-left`];
  let world: PhysicsWorld | undefined;
  let travelMs = 0; // 0 open, TRAVEL_MS aligned
  let stuck = false;
  const clearHalf = () => width / 2 - ((width - gap) / 2) * (travelMs / TRAVEL_MS);
  const pose = (side: 1 | -1): Vec3 => {
    const z = side * (clearHalf() + GUIDE_THICKNESS / 2);
    return [part.position[0] + z * yaw.sin, part.position[1] + GUIDE_HEIGHT / 2, part.position[2] + z * yaw.cos];
  };
  return {
    build(w) {
      world = w;
      for (const [i, id] of ids.entries()) {
        // Kinematic in the static layer: it pushes items, and a sensor beam never mistakes it for an item.
        w.addBody({
          id,
          kind: 'box',
          half: [length / 2, GUIDE_HEIGHT / 2, GUIDE_THICKNESS / 2],
          position: pose(i === 0 ? 1 : -1),
          rotationYDeg: part.rotationYDeg,
          massKg: 0,
          friction: ITEM_FRICTION,
          motion: 'kinematic',
          layer: 'static',
        });
      }
    },
    beforeStep(commands) {
      if (!stuck) {
        const wants = commands[`${part.name}.align`] === true;
        travelMs = Math.min(TRAVEL_MS, Math.max(0, travelMs + (wants ? STEP_MS : -STEP_MS)));
      }
      // MoveKinematic keeps its last velocity: pose the guides every step, also to hold them still.
      world?.setKinematicPose(ids[0]!, pose(1), yaw.q);
      world?.setKinematicPose(ids[1]!, pose(-1), yaw.q);
    },
    afterStep() {},
    sense: () => ({ [`${part.name}.aligned`]: travelMs >= TRAVEL_MS, [`${part.name}.open`]: travelMs <= 0 }),
    facts: (): Record<string, FactValue> => ({}),
    act(action) {
      if (action !== 'stuck') throw new Error(`part "${part.name}" has no action "${action}"`);
      stuck = true;
    },
    views: (): PartView[] => [
      {
        id: part.id,
        part: 'aligner',
        name: part.name,
        pose: marker(
          part,
          'aligner',
          [length, GUIDE_HEIGHT, width + GUIDE_THICKNESS * 2],
          [part.position[0], part.position[1] + GUIDE_HEIGHT / 2, part.position[2]],
        ),
        state: {
          fraction: travelMs / TRAVEL_MS,
          gapM: clearHalf() * 2,
          widthM: width,
          lengthM: length,
          aligned: travelMs >= TRAVEL_MS,
          open: travelMs <= 0,
          stuck,
        },
        signals: { aligned: travelMs >= TRAVEL_MS, open: travelMs <= 0 },
      },
    ],
  };
}

// ---- chute --------------------------------------------------------------------------------------------------------------------------

const chuteFields: Record<string, ConfigField> = {
  lengthM: { kind: 'number', min: 0.4, max: 2, default: 1, unit: 'm' },
  widthM: { kind: 'number', min: 0.4, max: 1, default: 0.6, unit: 'm' },
  tiltDeg: { kind: 'number', min: 5, max: 35, default: 20, unit: 'deg' },
};

/** A static plate that descends along local +x: the part position is the centre of its top surface. Build-time geometry only. */
function chuteRuntime(part: ScenePart): PartRuntime {
  const length = cfgNumber(part, chuteFields, 'lengthM');
  const width = cfgNumber(part, chuteFields, 'widthM');
  const tilt = cfgNumber(part, chuteFields, 'tiltDeg');
  const a = (part.rotationYDeg * Math.PI) / 360;
  const t = (-tilt * Math.PI) / 360; // the body tilt is half-angle in the quaternion; negative descends towards +x
  const q: [number, number, number, number] = [
    Math.sin(a) * Math.sin(t),
    Math.sin(a) * Math.cos(t),
    Math.cos(a) * Math.sin(t),
    Math.cos(a) * Math.cos(t),
  ];
  // The body centre lies half a plate thickness under the top surface, along the plate normal.
  const tau = (-tilt * Math.PI) / 180;
  const [ox, oz] = rotateY(part.rotationYDeg, (PLATE_THICKNESS / 2) * Math.sin(tau), 0);
  const centre: Vec3 = [part.position[0] + ox, part.position[1] - (PLATE_THICKNESS / 2) * Math.cos(tau), part.position[2] + oz];
  return {
    build(w) {
      w.addBody({
        id: part.id,
        kind: 'box',
        half: [length / 2, PLATE_THICKNESS / 2, width / 2],
        position: centre,
        rotationYDeg: part.rotationYDeg,
        massKg: 0,
        friction: CHUTE_FRICTION,
        motion: 'static',
        layer: 'static',
        tiltDeg: -tilt,
      });
    },
    beforeStep() {},
    afterStep() {},
    sense: () => ({}),
    facts: (): Record<string, FactValue> => ({}),
    act(action) {
      throw new Error(`part "${part.name}" has no action "${action}"`);
    },
    views: (): PartView[] => [
      {
        id: part.id,
        part: 'chute',
        name: part.name,
        pose: { id: part.id, part: 'chute', kind: 'box', size: [length, PLATE_THICKNESS, width], p: centre, q },
        state: { tiltDeg: tilt, lengthM: length, widthM: width },
        signals: {},
      },
    ],
  };
}

const chuteSnapPoints = (part: ScenePart): SnapPoint[] => {
  const half = cfgNumber(part, chuteFields, 'lengthM') / 2;
  const tau = (cfgNumber(part, chuteFields, 'tiltDeg') * Math.PI) / 180;
  const dx = half * Math.cos(tau);
  const dy = half * Math.sin(tau);
  return [
    { name: 'in', position: [-dx, dy, 0], normalYDeg: 180, accepts: ACCEPTS },
    { name: 'out', position: [dx, -dy, 0], normalYDeg: 0, accepts: ACCEPTS },
  ];
};

/** The catalogue completion (PRT-001): limit switch, aligner and chute. Not registered here (Task K10). */
export const completionParts: readonly RuntimePartDefinition[] = [
  {
    id: 'limit-switch',
    family: 'sensors',
    names: { en: 'Limit switch', es: 'Final de carrera' },
    config: switchFields,
    signals: (part) => [{ name: `${part.name}.contact`, direction: 'sensor', type: 'BOOL' }],
    actions: ['stuckOn', 'stuckOff'],
    snapPoints: () => [],
    doc: {
      en:
        'A mechanical lever in front of the part. The lever is a box reachM long along +x, 0.1 m across and heightM tall, starting at ' +
        'the part position. contact is TRUE while the centre of an item or pallet is inside it, and the fact count:Name counts each time ' +
        'it turns TRUE. The lever does not block the item. Signal: contact. Faults: stuckOn, stuckOff.',
      es:
        'Una palanca mecánica delante de la pieza. La palanca es una caja de reachM de largo a lo largo de +x, 0,1 m de ancho y heightM ' +
        'de alto, que parte de la posición de la pieza. contact es TRUE mientras el centro de una pieza o paleta está dentro, y el hecho ' +
        'count:Nombre cuenta cada vez que pasa a TRUE. La palanca no detiene la pieza. Señal: contact. Fallas: stuckOn, stuckOff.',
    },
    runtime: switchRuntime,
  },
  {
    id: 'aligner',
    family: 'flow',
    names: { en: 'Aligner', es: 'Alineador' },
    config: alignerFields,
    signals: (part) => [
      { name: `${part.name}.align`, direction: 'command', type: 'BOOL' },
      { name: `${part.name}.aligned`, direction: 'sensor', type: 'BOOL' },
      { name: `${part.name}.open`, direction: 'sensor', type: 'BOOL' },
    ],
    actions: ['stuck'],
    snapPoints: () => [],
    doc: {
      en:
        'Two guides at the sides of a belt, at the part position (the centre of the belt surface), lengthM long. Open, they sit at ' +
        'widthM apart; align TRUE closes them to gapM in 0.4 s and releasing it opens them again. A skewed box between the guides is ' +
        'squared to the belt axis when gapM is close to its width. gapM wider than widthM closes to widthM. aligned and open report the ' +
        'two limits. Signals: align, aligned, open. Fault: stuck (the guides hold where they are).',
      es:
        'Dos guías a los lados de una cinta, en la posición de la pieza (el centro de la superficie de la cinta), de lengthM de largo. ' +
        'Abiertas, quedan separadas widthM; align en TRUE las cierra a gapM en 0,4 s y al soltarlo se abren de nuevo. Una caja torcida ' +
        'entre las guías queda alineada con el eje de la cinta cuando gapM es cercano a su ancho. Un gapM mayor que widthM cierra a ' +
        'widthM. aligned y open indican los dos límites. Señales: align, aligned, open. Falla: stuck (las guías se quedan donde están).',
    },
    runtime: alignerRuntime,
  },
  {
    id: 'chute',
    family: 'flow',
    names: { en: 'Chute', es: 'Rampa de deslizamiento' },
    config: chuteFields,
    signals: () => [],
    actions: [],
    snapPoints: chuteSnapPoints,
    doc: {
      en:
        'A fixed plate lengthM by widthM, tilted tiltDeg (5 to 35) so that items slide along +x, down from the in landing at the high ' +
        'end to the out landing at the low end. Its position is the centre of the top surface. Friction is low (0.2), so an item ' +
        'accelerates under gravity; the plate has no sides, and nothing slows the item. It has no signals and no faults.',
      es:
        'Una placa fija de lengthM por widthM, inclinada tiltDeg (5 a 35) para que las piezas se deslicen a lo largo de +x, desde la ' +
        'entrada in en el extremo alto hasta la salida out en el extremo bajo. Su posición es el centro de la superficie superior. El ' +
        'rozamiento es bajo (0,2), de modo que la pieza se acelera por gravedad; la placa no tiene bordes y nada frena la pieza. No ' +
        'tiene señales ni fallas.',
    },
    runtime: chuteRuntime,
  },
];
