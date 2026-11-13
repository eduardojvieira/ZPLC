import type { ConfigField, FactValue, PartView, PlantSignalDef, ScenePart, SnapPoint, Vec3 } from '../../contracts';
import { PLANT_STEP_MS, type PhysicsWorld } from '../world';
import {
  BASE_SIZE,
  ITEM_FRICTION,
  LID_SIZE,
  cfg,
  cfgNumber,
  removeTrackedItem,
  rotateY,
  spawnItem,
  trackedItems,
  yawQuat,
  type PartRuntime,
  type RuntimePartDefinition,
} from './items';

// Machining centre (plan M5, Task B3). Part frame: local +x is the flow, the part position is the centre of the top surface of the
// integrated belt and of the chamber. Per-step arithmetic uses `+ - * /`, comparisons and Math.min/max/round/abs only; trigonometry
// only through `rotateY` at build time. The swap of the blank for the product is a model event, not physics (R5-M1).
const BELT_T = 0.1; // the integrated belt is a 0.1 m thick static body under the chamber
const DOOR_T = 0.05;
const DOOR_H = 0.3;
const DOOR_SINK = 0.02; // lowered, the top of a door sits this far under the belt surface
const DOOR_TRAVEL_MS = 400;
const HOUSING_H = 0.5;
const REST_MPS = 0.05;
const BELT_ACCEL_MPS2 = 1;
const PRODUCT_MASS_KG = 1; // the default mass of a lid or a base part

const config: Record<string, ConfigField> = {
  product: { kind: 'enum', values: ['lid', 'base'], default: 'lid' },
  cycleMs: { kind: 'number', min: 1000, max: 30000, default: 4000, unit: 'ms' },
  lengthM: { kind: 'number', min: 0.8, max: 1.4, default: 1, unit: 'm' },
  widthM: { kind: 'number', min: 0.5, max: 0.8, default: 0.6, unit: 'm' },
  speedMps: { kind: 'number', min: 0.2, max: 1, default: 0.5, unit: 'm/s' },
};
const num = (part: ScenePart, key: string) => cfgNumber(part, config, key);
const ACCEPTS = ['belt', 'roller', 'curved'];

function signals(part: ScenePart): PlantSignalDef[] {
  const b = (name: string, direction: 'command' | 'sensor'): PlantSignalDef => ({ name: `${part.name}.${name}`, direction, type: 'BOOL' });
  return [
    b('feed', 'command'),
    b('start', 'command'),
    b('ready', 'sensor'),
    b('busy', 'sensor'),
    b('done', 'sensor'),
    b('doorClosed', 'sensor'),
  ];
}

type State = 'idle' | 'busy' | 'done';

function runtime(part: ScenePart): PartRuntime {
  const L = num(part, 'lengthM');
  const W = num(part, 'widthM');
  const speed = num(part, 'speedMps');
  const product = cfg(part, config, 'product') as 'lid' | 'base';
  const productSize = product === 'lid' ? LID_SIZE : BASE_SIZE;
  const cycleSteps = Math.round(num(part, 'cycleMs') / PLANT_STEP_MS);
  const [px, py, pz] = part.position;
  const ux = rotateY(part.rotationYDeg, 1, 0);
  const uz = rotateY(part.rotationYDeg, 0, 1);
  const toWorld = (lx: number, lz: number): [number, number] => [px + ux[0] * lx + uz[0] * lz, pz + ux[1] * lx + uz[1] * lz];
  const toLocal = (wx: number, wz: number): [number, number] => [
    (wx - px) * ux[0] + (wz - pz) * ux[1],
    (wx - px) * uz[0] + (wz - pz) * uz[1],
  ];
  const quat = yawQuat(part.rotationYDeg);
  const beltId = `${part.id}-belt`;
  const doorIds = [`${part.id}-door-in`, `${part.id}-door-out`] as const;
  const reach = L + W;

  let world: PhysicsWorld | undefined;
  let state: State = 'idle';
  let doorMs = 0; // 0 lowered, DOOR_TRAVEL_MS risen
  let stepsLeft = 0;
  let blankId: string | undefined;
  let productId: string | undefined;
  let readyBlank: string | undefined;
  let produced = 0;
  let misfires = 0;
  let startWas = false;
  let target = 0;
  let doorStuck = false;
  let cycleSlow = false;
  let readyOff = false;
  let stalled = false;

  const doorPose = (i: 0 | 1): Vec3 => {
    const [wx, wz] = toWorld((i === 0 ? -1 : 1) * (L / 2 + DOOR_T / 2), 0);
    return [wx, py + DOOR_H / 2 - (1 - doorMs / DOOR_TRAVEL_MS) * (DOOR_H + DOOR_SINK), wz];
  };

  /** Tracked items whose centre lies inside the chamber, in creation order, with whether each is at rest. */
  const contents = (): { id: string; blank: boolean; still: boolean }[] => {
    const w = world!;
    const tracked = trackedItems(w);
    const poses = new Map(w.bodies().map((b) => [b.id, b]));
    const out: { id: string; blank: boolean; still: boolean }[] = [];
    for (const id of w.bodiesInBox([px - reach, py - BELT_T, pz - reach], [px + reach, py + 1, pz + reach])) {
      const info = tracked.get(id);
      const b = poses.get(id);
      if (!info || !b) continue;
      const [lx, lz] = toLocal(b.p[0], b.p[2]);
      if (Math.abs(lx) > L / 2 || Math.abs(lz) > W / 2) continue;
      out.push({
        id,
        blank: info.kind === 'item' && info.tag === undefined && info.colour !== undefined,
        still: b.v[0] * b.v[0] + b.v[1] * b.v[1] + b.v[2] * b.v[2] <= REST_MPS * REST_MPS,
      });
    }
    return out;
  };

  const ready = () => !readyOff && readyBlank !== undefined;
  const sensors = (): Record<string, boolean> => ({
    [`${part.name}.ready`]: ready(),
    [`${part.name}.busy`]: state === 'busy',
    [`${part.name}.done`]: state === 'done',
    [`${part.name}.doorClosed`]: doorMs >= DOOR_TRAVEL_MS,
  });
  const text = () => (state === 'busy' ? `busy ${((stepsLeft * PLANT_STEP_MS) / 1000).toFixed(1)} s` : state);

  return {
    build(w) {
      world = w;
      w.addBody({
        id: beltId,
        kind: 'box',
        half: [L / 2, BELT_T / 2, W / 2],
        position: [px, py - BELT_T / 2, pz],
        rotationYDeg: part.rotationYDeg,
        massKg: 0,
        friction: ITEM_FRICTION,
        motion: 'static',
        layer: 'static',
      });
      w.addBelt({ id: beltId, bodyId: beltId, axis: [ux[0], 0, ux[1]], accelMps2: BELT_ACCEL_MPS2 });
      doorIds.forEach((id, i) =>
        // Kinematic in the static layer, as the stop blade: items are blocked by the physics and a beam never sees a door.
        w.addBody({
          id,
          kind: 'box',
          half: [DOOR_T / 2, DOOR_H / 2, W / 2],
          position: doorPose(i as 0 | 1),
          rotationYDeg: part.rotationYDeg,
          massKg: 0,
          friction: ITEM_FRICTION,
          motion: 'kinematic',
          layer: 'static',
        }),
      );
    },
    beforeStep(commands) {
      const start = commands[`${part.name}.start`] === true;
      if (start && !startWas) {
        if (state === 'done') state = 'idle'; // the next start ends `done`
        if (state === 'idle' && ready() && !doorStuck) {
          state = 'busy';
          blankId = readyBlank;
          stepsLeft = cycleSteps * (cycleSlow ? 2 : 1);
        } else misfires += 1;
      }
      startWas = start;
      if (!doorStuck) {
        doorMs = Math.min(DOOR_TRAVEL_MS, Math.max(0, doorMs + (state === 'busy' ? PLANT_STEP_MS : -PLANT_STEP_MS)));
      }
      target = stalled || state === 'busy' || commands[`${part.name}.feed`] !== true ? 0 : speed;
      world!.setBeltTarget(beltId, target);
      // A kinematic body keeps its last velocity: pose both doors every step.
      world!.setKinematicPose(doorIds[0], doorPose(0), quat);
      world!.setKinematicPose(doorIds[1], doorPose(1), quat);
    },
    afterStep() {
      const w = world!;
      const inside = contents();
      if (state === 'busy') {
        stepsLeft -= 1;
        if (stepsLeft <= 0) {
          // R5-M1: the one scripted transformation. The blank leaves and the product appears in this same step, never one without the
          // other.
          if (blankId !== undefined && trackedItems(w).has(blankId)) {
            removeTrackedItem(w, blankId);
            produced += 1;
            productId = `${part.id}-p${produced}`;
            spawnItem(w, productId, 'item', productSize, PRODUCT_MASS_KG, [px, py, pz], part.rotationYDeg, product);
          }
          blankId = undefined;
          state = 'done';
        }
      } else if (state === 'done' && productId !== undefined) {
        // `done` holds until the product's centre has left the chamber.
        if (!inside.some((i) => i.id === productId)) state = 'idle';
      }
      const now = state === 'idle' ? contents() : [];
      readyBlank = now.length === 1 && now[0]!.blank && now[0]!.still ? now[0]!.id : undefined;
    },
    sense: sensors,
    facts(): Record<string, FactValue> {
      return { [`produced:${part.name}`]: produced, [`misfires:${part.name}`]: misfires };
    },
    act(action) {
      switch (action) {
        case 'doorStuck':
          doorStuck = true;
          break;
        case 'cycleSlow':
          cycleSlow = true;
          break;
        case 'readyStuckOff':
          readyOff = true;
          break;
        case 'stall':
          stalled = true;
          break;
        default:
          throw new Error(`part "${part.name}" has no action "${action}"`);
      }
    },
    views(): readonly PartView[] {
      const total = cycleSteps * (cycleSlow ? 2 : 1);
      const pose = (id: string, kind: string, size: Vec3, p: Vec3): PartView['pose'] => ({ id, part: kind, kind: 'box', size, p, q: quat });
      const signalsNow = Object.fromEntries(Object.entries(sensors()).map(([k, v]) => [k.slice(part.name.length + 1), v]));
      return [
        {
          id: part.id,
          part: 'machining-centre',
          name: part.name,
          pose: pose(part.id, 'machining-centre', [L, HOUSING_H, W], [px, py + HOUSING_H / 2, pz]),
          state: {
            fraction: state === 'busy' ? (total - stepsLeft) / total : state === 'done' ? 1 : 0,
            text: text(),
            busy: state === 'busy',
            product,
          },
          signals: signalsNow,
        },
        ...([0, 1] as const).map((i) => ({
          id: doorIds[i],
          part: 'machining-door',
          name: part.name,
          pose: pose(doorIds[i], 'machining-door', [DOOR_T, DOOR_H, W], doorPose(i)),
          state: { fraction: doorMs / DOOR_TRAVEL_MS },
          signals: {},
        })),
      ];
    },
  };
}

function snapPoints(part: ScenePart): readonly SnapPoint[] {
  const half = num(part, 'lengthM') / 2;
  return [
    { name: 'in', position: [-half, 0, 0], normalYDeg: 180, accepts: ACCEPTS },
    { name: 'out', position: [half, 0, 0], normalYDeg: 0, accepts: ACCEPTS },
  ];
}

/** The machining centre (PRT-001 Stations row): not registered here, Task K10 registers it. */
export const machiningParts: readonly RuntimePartDefinition[] = [
  {
    id: 'machining-centre',
    family: 'stations',
    names: { en: 'Machining centre', es: 'Centro de mecanizado' },
    config,
    signals,
    actions: ['doorStuck', 'cycleSlow', 'readyStuckOff', 'stall'],
    snapPoints,
    doc: {
      en:
        'A station that turns a workpiece into a lid or a base. Its position is the centre of the top surface of its integrated belt, ' +
        'which runs along +x while feed is TRUE; the chamber is lengthM by widthM, with a door at each end that rises in 0.4 s. A blank ' +
        'is a workpiece (an item with a colour and no tag; boxes, lids and bases are not blanks). ready is TRUE when exactly one blank ' +
        'lies at rest in the chamber and nothing else does, so stop the belt first. A rising edge of start while ready closes the ' +
        'doors and starts a cycle of cycleMs: the belt holds and busy is TRUE. At the end of the cycle the blank is removed and one ' +
        'product (a lid or a base, as product says, 1 kg) appears in its place at the chamber centre in the same step, the doors lower ' +
        'and done is TRUE until the product leaves the chamber or the next start. This swap is a model event, not physics: it ' +
        'changes what the item is, not where it is, as the level of a tank is a model; everything else is carried, blocked and pushed ' +
        'by the physics. A start while not ready only adds one to misfires. Limits: one blank at a time. Signals: feed, start, ready, ' +
        'busy, done, doorClosed. Facts: produced counts finished cycles; misfires counts refused start edges. Faults: doorStuck, ' +
        'cycleSlow, readyStuckOff, stall.',
      es:
        'Una estación que convierte una pieza en una tapa o en una base. Su posición es el centro de la superficie superior de su cinta ' +
        'integrada, que corre a lo largo de +x mientras feed es TRUE; la cámara mide lengthM por widthM, con una puerta en cada ' +
        'extremo que sube en 0,4 s. Una pieza en bruto es una pieza (un elemento con color y sin etiqueta; las cajas, las tapas y las ' +
        'bases no lo son). ready es TRUE cuando exactamente una pieza en bruto está en reposo en la cámara y nada más lo está, así que ' +
        'detenga primero la cinta. Un flanco ascendente de start con ready cierra las puertas e inicia un ciclo de cycleMs: la cinta ' +
        'se detiene y busy es TRUE. Al final del ciclo la pieza en bruto se retira y un producto (una tapa o una base, según product, ' +
        '1 kg) aparece en su lugar en el centro de la cámara en el mismo paso, las puertas bajan y done es TRUE hasta que el ' +
        'producto sale de la cámara o hasta el siguiente start. Este cambio es un evento del modelo, no física: cambia lo que es el ' +
        'elemento, no dónde está, como el nivel de un tanque es un modelo; todo lo demás lo llevan, lo bloquean y lo empujan la física. ' +
        'Un start sin ready solo suma uno a misfires. Límites: una pieza en bruto a la vez. Señales: feed, start, ready, busy, done, ' +
        'doorClosed. Hechos: produced cuenta los ciclos terminados; misfires cuenta los flancos de start rechazados. Fallas: ' +
        'doorStuck, cycleSlow, readyStuckOff, stall.',
    },
    runtime,
  },
];
