import type { ConfigField, FactValue, PartView, PlantSignalDef, ScenePart, SnapPoint, Vec3 } from '../../contracts';
import type { PhysicsWorld } from '../world';
import { PLANT_STEP_MS } from '../world';
import { AT_LIMIT_M, stepAxis, type AxisState } from './axis';
import { createGripper, type Gripper } from './gripper';
import { cfg, cfgNumber, ITEM_FRICTION, rotateY, yawQuat, type PartRuntime, type RuntimePartDefinition } from './items';
import { marker } from './sensors';

const DT_S = PLANT_STEP_MS / 1000;
const PAD_SIZE: Vec3 = [0.3, 0.03, 0.2];
const PAD_HALF_FOOTPRINT: readonly [number, number] = [PAD_SIZE[0] / 2, PAD_SIZE[2] / 2];
const FLAT_FOOTPRINT_Z_M = 0.6; // plan-view width of a two-axis part (it has no Z stroke)
const RAIL_ABOVE_M = 0.3; // the frame rail and the beam sit this far above the top of the Y stroke
const ACCEPTS = ['belt', 'roller', 'curved', 'emitter', 'remover'];
const LETTERS = ['x', 'y', 'z'] as const;
const ACTIONS = ['gripFail', 'dropLoad', 'grippedStuckOn', 'grippedStuckOff'];

const configOf = (axes: 2 | 3): Record<string, ConfigField> => ({
  variant: { kind: 'enum', values: ['digital', 'numeric'], default: 'digital' },
  gripper: { kind: 'enum', values: ['vacuum', 'clamp'], default: 'vacuum' },
  strokeXM: { kind: 'number', min: 0.4, max: 3, default: 1.2, unit: 'm' },
  strokeYM: { kind: 'number', min: 0.2, max: 1.2, default: 0.5, unit: 'm' },
  ...(axes === 3 ? { strokeZM: { kind: 'number', min: 0.4, max: 3, default: 1, unit: 'm' } satisfies ConfigField } : {}),
  speedMps: { kind: 'number', min: 0.1, max: 2, default: 0.8, unit: 'm/s' },
  accelMps2: { kind: 'number', min: 0.5, max: 10, default: 3, unit: 'm/s2' },
  maxLoadKg: { kind: 'number', min: 1, max: 25, default: 5, unit: 'kg' },
});
const FIELDS = { 2: configOf(2), 3: configOf(3) } as const;

const strokes = (part: ScenePart, axes: 2 | 3): number[] =>
  LETTERS.slice(0, axes).map((l) => cfgNumber(part, FIELDS[axes], `stroke${l.toUpperCase()}M`));

function signals(part: ScenePart, axes: 2 | 3): PlantSignalDef[] {
  const n = part.name;
  const L = LETTERS.slice(0, axes);
  const range = strokes(part, axes);
  const out: PlantSignalDef[] = [];
  if (cfg(part, FIELDS[axes], 'variant') === 'numeric') {
    L.forEach((l, i) =>
      out.push({ name: `${n}.${l}Set`, direction: 'command', type: 'REAL', unit: 'm', range: { min: 0, max: range[i]! } }),
    );
    L.forEach((l, i) =>
      out.push({ name: `${n}.${l}Pos`, direction: 'sensor', type: 'REAL', unit: 'm', range: { min: 0, max: range[i]! } }),
    );
  } else {
    for (const l of L)
      out.push(
        { name: `${n}.${l}Plus`, direction: 'command', type: 'BOOL' },
        { name: `${n}.${l}Minus`, direction: 'command', type: 'BOOL' },
      );
    for (const l of L)
      out.push(
        { name: `${n}.${l}AtMin`, direction: 'sensor', type: 'BOOL' },
        { name: `${n}.${l}AtMax`, direction: 'sensor', type: 'BOOL' },
      );
  }
  out.push({ name: `${n}.grip`, direction: 'command', type: 'BOOL' }, { name: `${n}.gripped`, direction: 'sensor', type: 'BOOL' });
  return out;
}

const round3 = (v: number): number => Math.round(v * 1000) / 1000;
const fixed2 = (v: number): string => (Math.round(v * 100) / 100).toFixed(2);

function runtimeOf(axes: 2 | 3, partId: 'pick-place' | 'gantry') {
  const fields = FIELDS[axes];
  return (part: ScenePart): PartRuntime => {
    const n = part.name;
    const numeric = cfg(part, fields, 'variant') === 'numeric';
    const kind = cfg(part, fields, 'gripper') === 'clamp' ? 'clamp' : 'vacuum';
    const stroke = strokes(part, axes);
    const spec = (i: number) => ({
      strokeM: stroke[i]!,
      speedMps: cfgNumber(part, fields, 'speedMps'),
      accelMps2: cfgNumber(part, fields, 'accelMps2'),
    });
    const padId = `${part.id}-pad`;
    const state: AxisState[] = stroke.map(() => ({ p: 0, v: 0 }));
    const target: number[] = stroke.map(() => 0);
    const stuck: boolean[] = stroke.map(() => false);
    let gripStuck: boolean | undefined;
    let world: PhysicsWorld | undefined;
    let gripper: Gripper | undefined;

    const pos = (i: number): number => state[i]?.p ?? 0;
    /** Bottom-face centre of the pad, world frame. Local +x runs along the part, local +z across it. */
    const bottom = (): Vec3 => {
      const [dx, dz] = rotateY(part.rotationYDeg, pos(0), pos(2));
      return [part.position[0] + dx, part.position[1] + pos(1), part.position[2] + dz];
    };
    const gripped = (): boolean => gripStuck ?? (gripper?.held().length ?? 0) > 0;
    const pose = (): { p: Vec3; q: ReturnType<typeof yawQuat> } => {
      const b = bottom();
      return { p: [b[0], b[1] + PAD_SIZE[1] / 2, b[2]], q: yawQuat(part.rotationYDeg) };
    };
    const sensed = (): Record<string, boolean | number> => {
      const out: Record<string, boolean | number> = {};
      state.forEach((s, i) => {
        const l = LETTERS[i]!;
        if (numeric) out[`${n}.${l}Pos`] = s.p;
        else {
          out[`${n}.${l}AtMin`] = s.p <= AT_LIMIT_M;
          out[`${n}.${l}AtMax`] = s.p >= stroke[i]! - AT_LIMIT_M;
        }
      });
      out[`${n}.gripped`] = gripped();
      return out;
    };
    const local = (x: number, y: number, z: number): Vec3 => {
      const [dx, dz] = rotateY(part.rotationYDeg, x, z);
      return [part.position[0] + dx, part.position[1] + y, part.position[2] + dz];
    };

    return {
      build(w) {
        world = w;
        const p = pose();
        // Kinematic in the static layer, as the stop blade: it carries items, and a sensor beam never mistakes it for an item.
        w.addBody({
          id: padId,
          kind: 'box',
          half: [PAD_SIZE[0] / 2, PAD_SIZE[1] / 2, PAD_SIZE[2] / 2],
          position: p.p,
          rotationYDeg: part.rotationYDeg,
          massKg: 0,
          friction: ITEM_FRICTION,
          motion: 'kinematic',
          layer: 'static',
        });
        gripper = createGripper(w, { kind, maxLoadKg: cfgNumber(part, fields, 'maxLoadKg'), maxItems: 1 });
      },
      beforeStep(commands) {
        state.forEach((s, i) => {
          const l = LETTERS[i]!;
          let cmd: Parameters<typeof stepAxis>[1];
          if (numeric) {
            const v = commands[`${n}.${l}Set`];
            if (typeof v === 'number' && Number.isFinite(v)) target[i] = Math.max(0, Math.min(stroke[i]!, v));
            cmd = { mode: 'goto', target: target[i]! };
          } else {
            const plus = commands[`${n}.${l}Plus`] === true;
            const minus = commands[`${n}.${l}Minus`] === true;
            cmd = { mode: 'jog', dir: plus === minus ? 0 : plus ? 1 : -1 };
          }
          state[i] = stepAxis(s, cmd, spec(i), DT_S, stuck[i]!);
        });
        const p = pose();
        // A kinematic body keeps its last velocity: pose it every step.
        world?.setKinematicPose(padId, p.p, p.q);
        gripper?.update(commands[`${n}.grip`] === true, { id: padId, centre: bottom(), half: PAD_HALF_FOOTPRINT });
      },
      afterStep() {
        gripper?.settle();
      },
      sense: sensed,
      facts() {
        const c = gripper?.counts() ?? { picked: 0, placed: 0, drops: 0 };
        const out: Record<string, FactValue> = { [`picked:${n}`]: c.picked, [`placed:${n}`]: c.placed, [`drops:${n}`]: c.drops };
        state.forEach((s, i) => (out[`axis:${n}:${LETTERS[i]}`] = round3(s.p)));
        return out;
      },
      act(action) {
        const axis = LETTERS.indexOf(action.replace('stuck', '').toLowerCase() as 'x');
        if (/^stuck[XYZ]$/.test(action) && axis < axes) stuck[axis] = true;
        else if (action === 'gripFail' || action === 'dropLoad') gripper?.act(action);
        else if (action === 'grippedStuckOn') gripStuck = true;
        else if (action === 'grippedStuckOff') gripStuck = false;
        else throw new Error(`part "${n}" has no action "${action}"`);
      },
      views(): readonly PartView[] {
        const p = pose();
        const [x, y, z] = [round3(pos(0)), round3(pos(1)), round3(pos(2))];
        const text = `X ${fixed2(x)} m, Y ${fixed2(y)} m${axes === 3 ? `, Z ${fixed2(z)} m` : ''}`;
        const signalsNow: Record<string, boolean | number> = {};
        for (const [k, v] of Object.entries(sensed())) signalsNow[k.slice(n.length + 1)] = v;
        const holding = gripped();
        const railY = stroke[1]! + RAIL_ABOVE_M;
        const midZ = axes === 3 ? stroke[2]! / 2 : 0;
        const secondary = (suffix: 'frame' | 'beam', size: Vec3, at: Vec3): PartView => {
          const view = `manipulator-${suffix}`;
          const base = marker(part, view, size, at);
          return { id: `${part.id}-${suffix}`, part: view, name: n, pose: { ...base, id: `${part.id}-${suffix}` }, state: {}, signals: {} };
        };
        return [
          {
            id: part.id,
            part: partId,
            name: n,
            pose: { ...marker(part, partId, PAD_SIZE, p.p) },
            state: {
              x,
              y,
              z,
              strokeX: stroke[0]!,
              strokeY: stroke[1]!,
              strokeZ: axes === 3 ? stroke[2]! : 0,
              fraction: x / stroke[0]!,
              text,
              holding,
              gripper: kind,
              variant: numeric ? 'numeric' : 'digital',
              closeFraction: gripper?.closeFraction() ?? 0,
            },
            signals: signalsNow,
          },
          secondary('frame', [stroke[0]! + 0.3, 0.06, 0.06], local(stroke[0]! / 2, railY, midZ)),
          secondary('beam', axes === 3 ? [0.08, 0.08, stroke[2]! + 0.3] : [0.08, 0.08, 0.08], local(pos(0), railY - 0.1, midZ)),
        ];
      },
    };
  };
}

function snapPoints(part: ScenePart, axes: 2 | 3): SnapPoint[] {
  const [sx] = strokes(part, axes);
  const [z0, z1] = axes === 3 ? [0, strokes(part, axes)[2]!] : [-FLAT_FOOTPRINT_Z_M / 2, FLAT_FOOTPRINT_Z_M / 2];
  const corner = (name: string, x: number, z: number): SnapPoint => ({ name, position: [x, 0, z], normalYDeg: 0, accepts: [] });
  return [
    corner('corner0', 0, z0),
    corner('corner1', sx!, z0),
    corner('corner2', sx!, z1),
    corner('corner3', 0, z1),
    { name: 'pickLow', position: [0, 0, 0], normalYDeg: 0, accepts: ACCEPTS },
    { name: 'placeLow', position: [sx!, 0, 0], normalYDeg: 0, accepts: ACCEPTS },
  ];
}

const define = (axes: 2 | 3, id: 'pick-place' | 'gantry'): RuntimePartDefinition => {
  const z = axes === 3;
  const stuck = z ? ['stuckX', 'stuckY', 'stuckZ'] : ['stuckX', 'stuckY'];
  return {
    id,
    family: 'manipulators',
    names: z ? { en: 'Three-axis gantry', es: 'Pórtico de tres ejes' } : { en: 'Two-axis pick and place', es: 'Manipulador de dos ejes' },
    config: FIELDS[axes],
    signals: (part) => signals(part, axes),
    actions: [...stuck, ...ACTIONS],
    snapPoints: (part) => snapPoints(part, axes),
    doc: {
      en:
        `A ${z ? 'three' : 'two'}-axis manipulator with a vacuum or clamp gripper (setting gripper). X runs along the part, Y is up` +
        `${z ? ', Z runs across it' : ''}. Its position is the floor point under the pad at axis position 0; the pad bottom is at the ` +
        'part height plus the Y position. Digital variant: hold-to-move commands (xPlus, xMinus, yPlus, yMinus) and limit sensors ' +
        '(xAtMin, xAtMax, yAtMin, yAtMax); both directions together do not move. Numeric variant: setpoints (xSet, ySet) and positions ' +
        '(xPos, yPos) in metres, clamped to the stroke. Both variants have grip (vacuum on or jaws close) and gripped. A grip on a ' +
        'moving ' +
        `item misses, and an item above maxLoadKg is never held. Faults: ${[...stuck, ...ACTIONS].join(', ')}. Facts: picked, placed ` +
        'and drops per part (picked:Name, placed:Name, drops:Name) and the axis positions (axis:Name:x, axis:Name:y' +
        `${z ? ', axis:Name:z' : ''}) in metres, rounded to 0.001.`,
      es:
        `Un manipulador de ${z ? 'tres' : 'dos'} ejes con pinza de vacío o de mordazas (ajuste gripper). X corre a lo largo de la pieza, ` +
        `Y es vertical${z ? ' y Z corre a través de ella' : ''}. Su posición es el punto del piso bajo la ventosa en la posición 0 de ` +
        `los ` +
        'ejes; la cara inferior de la ventosa queda a la altura de la pieza más la posición Y. Variante digital: órdenes que mueven ' +
        'mientras se mantienen (xPlus, xMinus, yPlus, yMinus) y sensores de límite (xAtMin, xAtMax, yAtMin, yAtMax); con ambos sentidos ' +
        'a la vez no se mueve. Variante numérica: consignas (xSet, ySet) y posiciones (xPos, yPos) en metros, limitadas a la carrera. ' +
        'Ambas variantes tienen grip (vacío activo o mordazas cerradas) y gripped. Un agarre sobre una pieza en movimiento falla, y una ' +
        `pieza por encima de maxLoadKg nunca se sujeta. Fallas: ${[...stuck, ...ACTIONS].join(', ')}. Hechos: picked, placed y drops ` +
        'por pieza (picked:Nombre, placed:Nombre, drops:Nombre) y las posiciones de los ejes (axis:Nombre:x, axis:Nombre:y' +
        `${z ? ', axis:Nombre:z' : ''}) en metros, redondeadas a 0,001.`,
    },
    equations: {
      en:
        'Per axis and plant step dt = 0.005 s: the velocity moves toward the target velocity by at most accel * dt, then p = p + v * dt, ' +
        'clamped to 0..stroke (v = 0 at a stop). Jog: target velocity is the held direction times speed. Setpoint: the axis brakes when ' +
        'the remaining distance is at most v * v / (2 * accel), and snaps to the setpoint within 0.5 mm. A stuck axis does not move.',
      es:
        'Por eje y por paso de la planta dt = 0,005 s: la velocidad se acerca a la velocidad objetivo en como máximo accel * dt y luego ' +
        'p = p + v * dt, limitada a 0..carrera (v = 0 en un tope). Con orden mantenida, la velocidad objetivo es el sentido por speed. ' +
        'Con consigna, el eje frena cuando la distancia restante es como máximo v * v / (2 * accel) y se ajusta a la consigna a menos de ' +
        '0,5 mm. Un eje atascado no se mueve.',
    },
    runtime: runtimeOf(axes, id),
  };
};

/** Two-axis pick and place and three-axis gantry (PRT-001, PRT-004). Not registered here: the core registers them. */
export const manipulatorParts: readonly RuntimePartDefinition[] = [define(2, 'pick-place'), define(3, 'gantry')];
