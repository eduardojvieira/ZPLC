import type { ConfigField, PartDefinition, PartView, PlantSignalDef, ScenePart, SnapPoint, Vec3 } from '../../contracts';
import type { PhysicsWorld } from '../world';
import { cfg, cfgNumber, ITEM_FRICTION, rotateY, yawQuat, type PartRuntime, type RuntimePartDefinition } from './items';

const THICKNESS = 0.1; // a belt body is 0.1 m thick; its part position is the centre of the top surface
const JAM_HEIGHT = 0.3;
const SEGMENT_DEG = 7.5; // plan choice: the curved conveyor is a ring of straight belts of at most 7.5 degrees
type Layout = 'belt' | 'roller' | 'curved';
const ACCEPTS = ['belt', 'roller', 'curved', 'emitter', 'remover'];

const common: Record<string, ConfigField> = {
  width: { kind: 'number', min: 0.4, max: 0.8, default: 0.6, unit: 'm' },
  speedMps: { kind: 'number', min: 0.1, max: 1.0, default: 0.5, unit: 'm/s' },
  accelMps2: { kind: 'number', min: 0.1, max: 5, default: 1.0, unit: 'm/s2' },
  allowReverse: { kind: 'boolean', default: false },
};
const straightConfig: Record<string, ConfigField> = {
  length: { kind: 'number', min: 0.5, max: 8, default: 2, unit: 'm' },
  ...common,
};
const curvedConfig: Record<string, ConfigField> = {
  radius: { kind: 'number', min: 0.5, max: 3, default: 1, unit: 'm' },
  hand: { kind: 'enum', values: ['right', 'left'], default: 'right' },
  ...common,
};

interface Segment {
  centre: [number, number]; // local x, z of the segment centre
  yaw: number; // local heading as a rotation about +y, degrees
  length: number;
  width: number;
  ratio: number; // surface speed relative to the centreline speed
  turnPerMps?: number;
}

function layout(layoutId: Layout, part: ScenePart, fields: Record<string, ConfigField>): Segment[] {
  const width = cfgNumber(part, fields, 'width');
  if (layoutId !== 'curved') return [{ centre: [0, 0], yaw: 0, length: cfgNumber(part, fields, 'length'), width, ratio: 1 }];
  const r = cfgNumber(part, fields, 'radius');
  const sign = cfg(part, fields, 'hand') === 'right' ? 1 : -1;
  const out: Segment[] = [];
  for (let i = 0; i < 90 / SEGMENT_DEG; i += 1) {
    const phi = (i + 0.5) * SEGMENT_DEG;
    const rad = (phi * Math.PI) / 180;
    out.push({
      centre: [r * Math.sin(rad), sign * (r - r * Math.cos(rad))],
      yaw: -sign * phi,
      // Covers the outer edge of the wedge between neighbours: no gap an item could fall into.
      length: 2 * (r + width / 2) * Math.tan((SEGMENT_DEG * Math.PI) / 360),
      width,
      ratio: 1,
      turnPerMps: -sign / r, // linear speed along the tangent plus this spin about the segment centre = rigid rotation about the arc centre
    });
  }
  return out;
}

function runtime(layoutId: Layout, fields: Record<string, ConfigField>): (part: ScenePart) => PartRuntime {
  return (part) => {
    let world: PhysicsWorld | undefined;
    const width = cfgNumber(part, fields, 'width');
    const speed = cfgNumber(part, fields, 'speedMps');
    const reverse = cfg(part, fields, 'allowReverse') === true;
    const segments = layout(layoutId, part, fields);
    const ids = segments.map((_, i) => `${part.id}-${i}`);
    let target = 0;
    let stalled = false;
    let jammed = false;
    const place = (s: Segment): { position: Vec3; yaw: number } => {
      const [x, z] = rotateY(part.rotationYDeg, s.centre[0], s.centre[1]);
      return { position: [part.position[0] + x, part.position[1] - THICKNESS / 2, part.position[2] + z], yaw: part.rotationYDeg + s.yaw };
    };
    return {
      build(w) {
        world = w;
        segments.forEach((s, i) => {
          const { position, yaw } = place(s);
          const a = (yaw * Math.PI) / 180;
          w.addBody({
            id: ids[i]!,
            kind: 'box',
            half: [s.length / 2, THICKNESS / 2, s.width / 2],
            position,
            rotationYDeg: yaw,
            massKg: 0,
            friction: ITEM_FRICTION,
            motion: 'static',
            layer: 'static',
          });
          w.addBelt({
            id: ids[i]!,
            bodyId: ids[i]!,
            axis: [Math.cos(a), 0, -Math.sin(a)],
            accelMps2: cfgNumber(part, fields, 'accelMps2'),
            ...(s.turnPerMps === undefined ? {} : { turnPerMps: s.turnPerMps }),
          });
        });
      },
      beforeStep(commands) {
        const fwd = commands[`${part.name}.run`] === true;
        const back = reverse && commands[`${part.name}.runReverse`] === true;
        target = stalled ? 0 : fwd ? speed : back ? -speed : 0;
        ids.forEach((id, i) => world?.setBeltTarget(id, target * segments[i]!.ratio));
      },
      afterStep() {},
      sense: () => ({}),
      facts: () => ({}),
      act(action) {
        if (action === 'stall') stalled = true;
        else if (action === 'jam' && !jammed && world) {
          jammed = true;
          // A fixed bar across the middle of the belt: items are blocked by the physics, not by a script.
          const mid = segments[Math.floor(segments.length / 2)] ?? segments[0]!;
          const { position, yaw } = place(mid);
          world.addBody({
            id: `${part.id}-jam`,
            kind: 'box',
            half: [0.025, JAM_HEIGHT / 2, width / 2],
            position: [position[0], part.position[1] + JAM_HEIGHT / 2, position[2]],
            rotationYDeg: yaw,
            massKg: 0,
            friction: ITEM_FRICTION,
            motion: 'static',
            layer: 'static',
          });
        } else if (action !== 'stall' && action !== 'jam') throw new Error(`part "${part.name}" has no action "${action}"`);
      },
      views() {
        const first = segments[0]!;
        const curved = layoutId === 'curved';
        const radius = curved ? cfgNumber(part, fields, 'radius') : 0;
        const sign = curved && cfg(part, fields, 'hand') === 'left' ? -1 : 1;
        // A curved view is an arc drawn about its own centre, `sign * radius` to the side of the 'in' point: `size[0]` is the
        // belt width (the band the view reads), and the pose turns the view's quarter turn (0..90 degrees) onto the belt for either hand.
        const size: Vec3 = curved ? [width, THICKNESS, radius + width] : [first.length, THICKNESS, width];
        const arc: Record<string, number> = curved ? { radius: radius + width / 2, angleDeg: 90 } : {};
        const [cx, cz] = curved ? rotateY(part.rotationYDeg, 0, sign * radius) : [0, 0];
        const pose: PartView['pose'] = {
          id: part.id,
          part: layoutId,
          kind: 'box',
          size,
          p: [part.position[0] + cx, part.position[1] - THICKNESS / 2, part.position[2] + cz],
          q: yawQuat(part.rotationYDeg + (sign < 0 ? -90 : 0)),
        };
        return [{ id: part.id, part: layoutId, name: part.name, pose, state: { speedMps: target, stalled, jammed, ...arc }, signals: {} }];
      },
    };
  };
}

function signals(part: ScenePart, fields: Record<string, ConfigField>): PlantSignalDef[] {
  const out: PlantSignalDef[] = [{ name: `${part.name}.run`, direction: 'command', type: 'BOOL' }];
  if (cfg(part, fields, 'allowReverse') === true) out.push({ name: `${part.name}.runReverse`, direction: 'command', type: 'BOOL' });
  return out;
}

function define(
  id: Layout,
  names: PartDefinition['names'],
  fields: Record<string, ConfigField>,
  snap: (part: ScenePart) => SnapPoint[],
  doc: PartDefinition['doc'],
): RuntimePartDefinition {
  return {
    id,
    family: 'conveyors',
    names,
    config: fields,
    signals: (part) => signals(part, fields),
    actions: ['stall', 'jam'],
    snapPoints: snap,
    doc,
    runtime: runtime(id, fields),
  };
}

const straightSnap = (part: ScenePart): SnapPoint[] => {
  const half = cfgNumber(part, straightConfig, 'length') / 2;
  return [
    { name: 'in', position: [-half, 0, 0], normalYDeg: 180, accepts: ACCEPTS },
    { name: 'out', position: [half, 0, 0], normalYDeg: 0, accepts: ACCEPTS },
  ];
};

/** Belt, roller and curved conveyor: a static top with a surface velocity (no scripted item motion). */
export const conveyorParts: readonly RuntimePartDefinition[] = [
  define('belt', { en: 'Belt conveyor', es: 'Cinta transportadora' }, straightConfig, straightSnap, {
    en: 'A belt conveyor. Its position is the centre of the top surface; it runs along +x. Signals: run, runReverse.',
    es: 'Una cinta transportadora. Su posición es el centro de la superficie superior; corre a lo largo de +x. Señales: run, runReverse.',
  }),
  define('roller', { en: 'Roller conveyor', es: 'Transportador de rodillos' }, straightConfig, straightSnap, {
    en: 'A roller conveyor. It moves items like a belt; the rollers are decoration. Signals: run, runReverse.',
    es: 'Un transportador de rodillos. Mueve las piezas como una cinta; los rodillos son decoración. Señales: run, runReverse.',
  }),
  define(
    'curved',
    { en: 'Curved conveyor', es: 'Transportador curvo' },
    curvedConfig,
    (part) => {
      const r = cfgNumber(part, curvedConfig, 'radius');
      const sign = cfg(part, curvedConfig, 'hand') === 'right' ? 1 : -1;
      return [
        { name: 'in', position: [0, 0, 0], normalYDeg: 180, accepts: ACCEPTS },
        { name: 'out', position: [r, 0, sign * r], normalYDeg: -sign * 90, accepts: ACCEPTS },
      ];
    },
    {
      en: 'A quarter-turn conveyor with the given centreline radius. Items travel at the catalogue speed along the centreline.',
      es:
        'Un transportador de cuarto de vuelta con el radio de línea central indicado. Las piezas viajan a la velocidad del catálogo ' +
        'por la línea central.',
    },
  ),
];
