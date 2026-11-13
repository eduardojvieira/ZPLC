import type { ConfigField, FactValue, PartView, Quat, ScenePart, SnapPoint, Vec3 } from '../../contracts';
import type { PhysicsWorld } from '../world';
import { cfg, cfgNumber, ITEM_FRICTION, type PartRuntime, type RuntimePartDefinition } from './items';
import { YAW_STEP_DEG, yawEntry } from './yawTable';

const DT = 0.005; // one plant step, seconds
const THICKNESS = 0.1; // the platform is 0.1 m thick; the part position is the centre of its top surface
const JAM_HEIGHT = 0.3;
const RAMP_S = 0.5; // the angular rate ramps over 500 ms: a step start leaves a lag and then slips (probe of Task A2)
const AT_DEG = 0.5;
const ACCEPTS = ['belt', 'roller', 'curved', 'emitter', 'remover'];

const config: Record<string, ConfigField> = {
  sizeM: { kind: 'number', min: 0.6, max: 1.2, default: 0.9, unit: 'm' },
  speedMps: { kind: 'number', min: 0.1, max: 1, default: 0.5, unit: 'm/s' },
  accelMps2: { kind: 'number', min: 0.1, max: 5, default: 1, unit: 'm/s2' },
  angleDeg: { kind: 'number', min: 30, max: 90, default: 90, unit: 'deg' },
  degPerS: { kind: 'number', min: 30, max: 120, default: 90, unit: 'deg/s' },
  allowReverse: { kind: 'boolean', default: false },
};

/**
 * The yaw of `deg` between the two table entries around it (a normalised blend, `+ - * /` and `sqrt` only). A pose that jumps in
 * 0.25 degree steps makes the kinematic velocity jitter by more than friction can follow, and a box on the platform slips; blending
 * keeps the angular rate smooth and stays on the table (error under 1e-5 degrees).
 */
function yawBlend(deg: number): { q: Quat; cos: number; sin: number } {
  const lo = Math.floor(deg / YAW_STEP_DEG) * YAW_STEP_DEG;
  const t = (deg - lo) / YAW_STEP_DEG;
  const a = yawEntry(lo);
  const b = yawEntry(lo + YAW_STEP_DEG);
  const cos = a.cos + (b.cos - a.cos) * t;
  const sin = a.sin + (b.sin - a.sin) * t;
  const n = Math.sqrt(cos * cos + sin * sin);
  const c = cos / n;
  // Half-angle identities: cos(a/2) = sqrt((1 + cos a) / 2), sin(a/2) = sqrt((1 - cos a) / 2) with the sign of sin a.
  const hc = Math.sqrt(Math.max(0, (1 + c) / 2));
  const hs = Math.sqrt(Math.max(0, (1 - c) / 2)) * (sin < 0 ? -1 : 1);
  return { q: [0, hs, 0, hc], cos: c, sin: sin / n };
}

function runtime(part: ScenePart): PartRuntime {
  const size = cfgNumber(part, config, 'sizeM');
  const speed = cfgNumber(part, config, 'speedMps');
  const maxAngle = cfgNumber(part, config, 'angleDeg');
  const maxRate = cfgNumber(part, config, 'degPerS');
  const reverse = cfg(part, config, 'allowReverse') === true;
  const id = `${part.id}-table`;
  const rampDegPerS2 = maxRate / RAMP_S;
  const centre: Vec3 = [part.position[0], part.position[1] - THICKNESS / 2, part.position[2]];
  let world: PhysicsWorld | undefined;
  let angle = 0; // degrees, positive towards local +z (right); the yaw of the body is rotationYDeg minus this
  let rate = 0; // deg/s
  let stalled = false;
  let jammed = false;
  let turnStuck = false;
  const entry = () => yawBlend(part.rotationYDeg - angle);
  const pose = (): void => {
    const e = entry();
    world?.setKinematicPose(id, centre, e.q);
    world?.setBeltAxis(id, [e.cos, 0, -e.sin]);
  };
  const near = (a: number): boolean => Math.abs(angle - a) <= AT_DEG;
  const text = (): string =>
    near(maxAngle) || angle > maxAngle / 2 ? 'right' : near(-maxAngle) || angle < -maxAngle / 2 ? 'left' : 'centre';
  return {
    build(w) {
      world = w;
      const e = entry();
      w.addBody({
        id,
        kind: 'box',
        half: [size / 2, THICKNESS / 2, size / 2],
        position: centre,
        rotationYDeg: part.rotationYDeg,
        massKg: 0,
        friction: ITEM_FRICTION,
        motion: 'kinematic',
        layer: 'static',
      });
      w.addBelt({ id, bodyId: id, axis: [e.cos, 0, -e.sin], accelMps2: cfgNumber(part, config, 'accelMps2') });
    },
    beforeStep(commands) {
      const left = commands[`${part.name}.toLeft`] === true;
      const right = commands[`${part.name}.toRight`] === true;
      const target = left && right ? angle : right ? maxAngle : left ? -maxAngle : 0;
      const turning = !turnStuck && (angle !== target || rate !== 0);
      const fwd = commands[`${part.name}.run`] === true;
      const back = reverse && commands[`${part.name}.runReverse`] === true;
      // The surface stops before the platform turns, and the platform waits for it (rule R4-T2).
      world?.setBeltTarget(id, stalled || turning || fwd === back ? 0 : fwd ? speed : -speed);
      if (turning && Math.abs(world?.beltSpeed(id) ?? 0) === 0) {
        const remaining = target - angle;
        const sign = remaining < 0 ? -1 : 1;
        // Brake so the rate reaches 0 at the target: v = sqrt(2 a d).
        const wanted = sign * Math.min(maxRate, Math.sqrt(2 * rampDegPerS2 * Math.abs(remaining)));
        const dv = rampDegPerS2 * DT;
        rate += Math.min(dv, Math.max(-dv, wanted - rate));
        const next = angle + rate * DT;
        if ((next - target) * sign >= 0) {
          angle = target;
          rate = 0;
        } else angle = next;
      }
      // MoveKinematic keeps its last velocity: the pose is set every step, also to hold it.
      pose();
    },
    afterStep() {},
    sense: () => ({
      [`${part.name}.atCentre`]: near(0),
      [`${part.name}.atLeft`]: near(-maxAngle),
      [`${part.name}.atRight`]: near(maxAngle),
    }),
    facts: (): Record<string, FactValue> => ({}),
    act(action) {
      if (action === 'stall') stalled = true;
      else if (action === 'turnStuck') turnStuck = true;
      else if (action === 'jam') {
        if (jammed || !world) return;
        jammed = true;
        // A fixed bar across the middle of the platform: items are blocked by the physics, not by a script.
        world.addBody({
          id: `${part.id}-jam`,
          kind: 'box',
          half: [0.025, JAM_HEIGHT / 2, size / 2],
          position: [part.position[0], part.position[1] + JAM_HEIGHT / 2, part.position[2]],
          rotationYDeg: part.rotationYDeg,
          massKg: 0,
          friction: ITEM_FRICTION,
          motion: 'static',
          layer: 'static',
        });
      } else throw new Error(`part "${part.name}" has no action "${action}"`);
    },
    views(): readonly PartView[] {
      const s = this.sense();
      const pose: PartView['pose'] = {
        id: part.id,
        part: 'turntable',
        kind: 'box',
        size: [size, THICKNESS, size],
        p: centre,
        q: entry().q,
      };
      return [
        {
          id: part.id,
          part: 'turntable',
          name: part.name,
          pose,
          state: {
            fraction: angle / maxAngle,
            text: text(),
            angleDeg: angle,
            speedMps: world?.beltSpeed(id) ?? 0,
            stalled,
            jammed,
            turnStuck,
          },
          signals: {
            atCentre: s[`${part.name}.atCentre`] === true,
            atLeft: s[`${part.name}.atLeft`] === true,
            atRight: s[`${part.name}.atRight`] === true,
          },
        },
      ];
    },
  };
}

const snaps = (part: ScenePart): SnapPoint[] => {
  const h = cfgNumber(part, config, 'sizeM') / 2;
  return [
    { name: 'in', position: [-h, 0, 0], normalYDeg: 180, accepts: ACCEPTS },
    { name: 'out', position: [h, 0, 0], normalYDeg: 0, accepts: ACCEPTS },
    { name: 'left', position: [0, 0, -h], normalYDeg: 90, accepts: ACCEPTS },
    { name: 'right', position: [0, 0, h], normalYDeg: -90, accepts: ACCEPTS },
  ];
};

/** The turntable (PRT-001): a square platform that turns to three positions and carries items by a belt surface. */
export const turntableParts: readonly RuntimePartDefinition[] = [
  {
    id: 'turntable',
    family: 'conveyors',
    names: { en: 'Turntable', es: 'Mesa giratoria' },
    config,
    signals: (part) => [
      { name: `${part.name}.run`, direction: 'command', type: 'BOOL' },
      ...(cfg(part, config, 'allowReverse') === true
        ? [{ name: `${part.name}.runReverse`, direction: 'command' as const, type: 'BOOL' as const }]
        : []),
      { name: `${part.name}.toLeft`, direction: 'command', type: 'BOOL' },
      { name: `${part.name}.toRight`, direction: 'command', type: 'BOOL' },
      { name: `${part.name}.atCentre`, direction: 'sensor', type: 'BOOL' },
      { name: `${part.name}.atLeft`, direction: 'sensor', type: 'BOOL' },
      { name: `${part.name}.atRight`, direction: 'sensor', type: 'BOOL' },
    ],
    actions: ['stall', 'turnStuck', 'jam'],
    snapPoints: snaps,
    doc: {
      en:
        'A square platform whose position is the centre of its top surface. It turns about its vertical axis to three positions: ' +
        "centre, left (towards -z) and right (towards +z, the side of a belt's right edge), and its surface carries items along its own " +
        '+x. ' +
        'toLeft or toRight chooses the position, neither returns to the centre, both hold the angle. The surface stops before the ' +
        'platform ' +
        'turns and starts again once it has arrived, so run can stay TRUE. Contradictory commands do nothing. Angles use a table in ' +
        'steps of ' +
        '0.25 degrees. Signals: run, runReverse, toLeft, toRight, atCentre, atLeft, atRight (within 0.5 degrees). Faults: stall, ' +
        'turnStuck, jam.',
      es:
        'Una plataforma cuadrada cuya posición es el centro de su superficie superior. Gira sobre su eje vertical a tres posiciones: ' +
        'centro, izquierda (hacia -z) y derecha (hacia +z), y su superficie lleva las piezas a lo largo de su propio +x. toLeft o ' +
        'toRight ' +
        'eligen la posición, sin ninguna vuelve al centro y con ambas conserva el ángulo. La superficie se detiene antes de que la ' +
        'plataforma ' +
        'gire y arranca de nuevo al llegar, de modo que run puede seguir en TRUE. Las órdenes contradictorias no hacen nada. Los ángulos ' +
        'usan una tabla en pasos de 0,25 grados. Señales: run, runReverse, toLeft, toRight, atCentre, atLeft, atRight (a 0,5 grados). ' +
        'Fallas: stall, turnStuck, jam.',
    },
    runtime,
  },
];
