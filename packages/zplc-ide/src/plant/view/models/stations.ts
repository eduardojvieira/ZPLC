/**
 * Stations (plan-vis C6, upgraded for C9 S3-05, S3-06 & S3-07): the stacker crane with its mast and high-bay rack, the layer
 * palletizer (skipping duplicate portals emitted by pick-place/gantry), and the CNC machining centre with its doors.
 */
import type { PartView, Quat, ScenePart, Vec3 } from '../../contracts';
import type { Role } from '../look';
import { STACK_LIGHT } from './operator';
import {
  box,
  levellingLeg,
  piece,
  rod,
  rotate,
  slotted,
  type ModelBuilder,
  type ModelContext,
  type ModelFamily,
  type Piece,
} from './shared';

/** The sizes of the stacker crane's frame, in metres; the cell rail sizes are the core's (they hold the stored items). */
export const STACKER = {
  upright: 0.05,
  beam: 0.09,
  beamDepth: 0.05,
  basePlate: 0.14,
  basePlateHeight: 0.012,
  cellRail: { width: 0.05, height: 0.1, length: 0.6, offset: 0.12 }, // offset: from the bay centre, as the core's rails
  aisleMargin: 0.3, // the aisle rails reach this far beyond the first and the last bay
  rail: { width: 0.08, height: 0.04 },
  truck: { width: 0.5, height: 0.055, depth: 0.24 },
  mastTopGap: 0.4, // matches rackH = mastH - 0.4 cleanly, leaving room for the top guide head
  mastColumnX: 0.19,
  carriage: { width: 0.38, bedHeight: 0.026, sideWidth: 0.08, sideHeight: 0.28, depth: 0.22 },
  fork: { width: 0.05, thickness: 0.04, length: 0.6, offset: 0.055 }, // the fork plate of the core: 0.16 wide, 0.6 long, 0.04 thick
  slide: { width: 0.1, thickness: 0.024 },
} as const;
const FORK_DEFAULT_STROKE = 0.8;
const DEFAULTS = { columns: 4, bayPitchM: 1, forkStrokeM: FORK_DEFAULT_STROKE };

const num = (v: unknown, fallback = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
/** A number of the crane's scene part config, else the default. */
const setting = (context: ModelContext, key: keyof typeof DEFAULTS): number => num(context.scenePart?.config[key], DEFAULTS[key]);

/** A diagonal structural bar from `p0` to `p1` in the `xy` or `yz` plane, rotated via `q`. */
function diagBrace(slotName: string, p0: Vec3, p1: Vec3, thickness: number, role: Role, plane: 'xy' | 'yz'): Piece {
  const [dx, dy, dz] = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
  const len = Math.hypot(dx, dy, dz);
  const mid: Vec3 = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2];
  const angle = plane === 'xy' ? Math.atan2(dy, dx) : -Math.atan2(dy, dz);
  const q: Quat = plane === 'xy' ? [0, 0, Math.sin(angle / 2), Math.cos(angle / 2)] : [Math.sin(angle / 2), 0, 0, Math.cos(angle / 2)];
  const size: Vec3 = plane === 'xy' ? [len, thickness, thickness] : [thickness, thickness, len];
  return { ...piece(slotName, box(size, 0.002), mid, role), q };
}

/** The rack: `columns` bays of `levels` levels, load beams, pallet crossbars, depth ties, and side/back bracing. */
const rack: ModelBuilder = (view) => {
  const { upright: u, beam, beamDepth, basePlate, basePlateHeight: bh, cellRail: rail } = STACKER;
  const [w, h] = view.pose.size;
  const cols = Math.max(1, Math.round(num(view.state.columns, 1)));
  const levels = Math.max(1, Math.round(num(view.state.levels, 1)));
  const [bay, level] = [num(view.state.bayPitchM), num(view.state.levelPitchM)];
  const floor = -view.pose.p[1];
  const back = -0.025 - u / 2;
  const frontZ = back - rail.length + u;
  const cellMidZ = back - rail.length / 2 + u / 2;
  const faces = [
    ['front', frontZ],
    ['back', back],
  ] as const;
  const xs = [-w / 2, ...Array.from({ length: cols - 1 }, (_, i) => (i + 1.5 - (cols + 1) / 2) * bay), w / 2];
  const out: Piece[] = [];

  for (const [face, z] of faces) {
    out.push(piece(`header-${face}`, box([w, 0.05, 0.04], 0.002), [0, h / 2 - 0.025, z], 'painted'));
    xs.forEach((x, i) => {
      out.push(piece(`upright-${face}-${i}`, box([u, h / 2 - floor - bh, u]), [x, (h / 2 + floor + bh) / 2, z], 'painted'));
      out.push(piece(`base-${face}-${i}`, box([basePlate, bh, basePlate]), [x, floor + bh / 2, z], 'steel'));
    });
  }

  for (let l = 1; l <= levels; l++) {
    const top = floor + l * level;
    for (const [face, z] of faces) out.push(piece(`beam-${face}-${l}`, box([w, beam, beamDepth]), [0, top - beam / 2, z], 'steel'));
    xs.forEach((x, i) =>
      out.push(piece(`tie-${i}-${l}`, box([0.04, 0.045, rail.length - u], 0.002), [x, top - 0.025, cellMidZ], 'painted')),
    );
    for (let c = 1; c <= cols; c++) {
      const cx = (c - (cols + 1) / 2) * bay;
      for (const side of [-1, 1])
        out.push(
          piece(
            `cell-${c}-${l}-${side < 0 ? 'a' : 'b'}`,
            box([rail.width, rail.height, rail.length]),
            [cx + side * rail.offset, top + rail.height / 2, cellMidZ],
            'steel',
          ),
        );
      for (const [k, dz] of [-0.2, 0, 0.2].entries())
        out.push(
          piece(`deck-${c}-${l}-${k}`, box([2 * rail.offset + rail.width, 0.024, 0.04], 0.002), [cx, top + 0.012, cellMidZ + dz], 'steel'),
        );
    }
  }
  xs.forEach((x, i) =>
    out.push(piece(`tie-${i}-top`, box([0.04, 0.045, rail.length - u], 0.002), [x, h / 2 - 0.025, cellMidZ], 'painted')),
  );

  // Side end-frame Warren-truss bracing and back-face truss bracing keep all cell fronts open for stored loads.
  const yBounds = [floor + bh, ...Array.from({ length: levels }, (_, l) => floor + (l + 1) * level), h / 2 - 0.025];
  for (let s = 0; s < yBounds.length - 1; s++) {
    const [y0, y1] = [yBounds[s]!, yBounds[s + 1]!];
    const [sy0, sy1] = s % 2 === 0 ? [y0, y1] : [y1, y0];
    for (const [endIdx, x] of [
      [0, xs[0]!],
      [1, xs[xs.length - 1]!],
    ] as const) {
      out.push(diagBrace(`brace-side-${endIdx}-${s}`, [x, sy0, frontZ], [x, sy1, back], 0.022, 'frame', 'yz'));
    }
    for (let i = 0; i < xs.length - 1; i++) {
      const [xa, xb] = [xs[i]!, xs[i + 1]!];
      const [ya, yb] = i % 2 === 0 ? [y0, y1] : [y1, y0];
      out.push(diagBrace(`brace-back-${i}-${s}`, [xa, ya, back], [xb, yb, back], 0.024, 'frame', 'xy'));
    }
  }
  return out;
};

/** Where the part's own origin (bay 0, the foot of the mast) lies in the view's frame; the view's own place without a scene. */
function aisleOrigin(view: PartView, part: ScenePart | null | undefined): Vec3 {
  if (!part) return [0, 0, 0];
  const [x, , z] = part.position;
  const [qx, qy, qz, qw] = view.pose.q;
  return rotate([-qx, -qy, -qz, qw], [x - view.pose.p[0], 0, z - view.pose.p[2]]);
}

/**
 * The twin-column braced mast on its bogie truck and floor rail. When `context.scenePart` is missing (as in `renderer.ts` where the
 * mast view id is `<id>-mast`, or catalogue renders), `rail-floor` stays compact under the truck instead of projecting into empty space.
 */
const mast: ModelBuilder = (view, context) => {
  const { rail, truck, mastTopGap, aisleMargin, mastColumnX } = STACKER;
  const [, h] = view.pose.size;
  const floor = -view.pose.p[1];
  const top = h / 2;
  const columnBottom = floor + rail.height + truck.height;
  const columnTop = Math.max(columnBottom + 0.2, top - mastTopGap);
  const colH = columnTop - columnBottom;
  const colMidY = (columnTop + columnBottom) / 2;
  const out: Piece[] = [];

  if (context.scenePart) {
    const [ox, , oz] = aisleOrigin(view, context.scenePart);
    const length = setting(context, 'columns') * setting(context, 'bayPitchM') + 2 * aisleMargin;
    const cx = ox - aisleMargin + length / 2;
    out.push(
      piece('rail-floor', box([length, rail.height, rail.width]), [cx, floor + rail.height / 2, oz], 'steel'),
      piece('stop-a', box([0.05, 0.07, 0.11], 0.002), [ox - aisleMargin + 0.025, floor + rail.height + 0.015, oz], 'collar'),
      piece('stop-b', box([0.05, 0.07, 0.11], 0.002), [ox - aisleMargin + length - 0.025, floor + rail.height + 0.015, oz], 'collar'),
    );
  } else {
    out.push(piece('rail-floor', box([0.64, rail.height, rail.width]), [0, floor + rail.height / 2, 0], 'steel'));
  }

  // Bogie chassis, flanged rail wheels, and aisle drive motor.
  const truckY = floor + rail.height + truck.height / 2;
  out.push(
    piece('truck', box([truck.width, truck.height, truck.depth]), [0, truckY, 0], 'housing'),
    piece('drive-aisle', box([0.11, 0.1, 0.12], 0.005), [-truck.width / 2 - 0.055, truckY + 0.03, 0], 'painted'),
    piece('drive-aisle-cap', box([0.026, 0.08, 0.09], 0.003), [-truck.width / 2 - 0.123, truckY + 0.03, 0], 'collar'),
  );
  for (const [i, sx] of [-0.2, 0.2].entries())
    for (const [j, sz] of [-0.06, 0.06].entries())
      out.push(piece(`wheel-${i}-${j}`, rod(0.024, 0.03, 'z'), [sx, floor + rail.height + 0.012, sz], 'collar'));

  // Twin braced mast columns flanking the fork aperture, guide rails, top head beam, and hoist drive.
  out.push(
    piece('mast', box([0.06, colH, 0.16]), [-mastColumnX, colMidY, 0], 'painted'),
    piece('mast-b', box([0.06, colH, 0.16]), [mastColumnX, colMidY, 0], 'painted'),
    piece('mast-guide-a', box([0.016, colH, 0.04], 0.002), [-(mastColumnX - 0.038), colMidY, 0], 'steel'),
    piece('mast-guide-b', box([0.016, colH, 0.04], 0.002), [mastColumnX - 0.038, colMidY, 0], 'steel'),
    piece('mast-foot-a', box([0.1, 0.02, 0.2], 0.002), [-mastColumnX, columnBottom + 0.01, 0], 'steel'),
    piece('mast-foot-b', box([0.1, 0.02, 0.2], 0.002), [mastColumnX, columnBottom + 0.01, 0], 'steel'),
    piece('mast-head', box([0.48, 0.065, 0.2], 0.004), [0, columnTop + 0.0325, 0], 'housing'),
    piece('drive-hoist', box([0.11, 0.08, 0.11], 0.005), [0.14, columnTop + 0.105, 0], 'painted'),
    piece('drive-hoist-cap', box([0.085, 0.024, 0.085], 0.003), [0.14, columnTop + 0.157, 0], 'collar'),
  );
  const segs = Math.max(2, Math.round(colH / 0.45));
  for (let k = 0; k < segs; k++) {
    const [y0, y1] = [columnBottom + (k * colH) / segs, columnBottom + ((k + 1) * colH) / segs];
    const [ya, yb] = k % 2 === 0 ? [y0, y1] : [y1, y0];
    for (const [id, x] of [
      ['a', -mastColumnX],
      ['b', mastColumnX],
    ] as const)
      out.push(diagBrace(`mast-brace-${id}-${k}`, [x, ya, -0.07], [x, yb, 0.07], 0.018, 'frame', 'yz'));
  }
  return out;
};

/** The lifting carriage wrapping the twin mast columns, its guide rollers, fork drive, and telescopic forks. */
const carriage: ModelBuilder = (view, context) => {
  const { carriage: car, fork, slide, mastColumnX } = STACKER;
  const reach = Math.max(-1, Math.min(1, num(view.state.fraction))) * setting(context, 'forkStrokeM');
  // The fork bed stays above the floor even at level 0 (pose.p[1] = 0.05), while side cheeks rise around the twin mast columns.
  const out: Piece[] = [
    piece('carriage', box([car.width, car.bedHeight, car.depth]), [0, -fork.thickness / 2 - car.bedHeight / 2, -reach], 'housing'),
    piece('carriage-side-a', box([car.sideWidth, car.sideHeight, car.depth]), [-mastColumnX, 0.1, -reach], 'housing'),
    piece('carriage-side-b', box([car.sideWidth, car.sideHeight, car.depth]), [mastColumnX, 0.1, -reach], 'housing'),
    piece('drive-fork', box([0.08, 0.085, 0.1], 0.004), [mastColumnX + 0.08, 0.1, -reach], 'painted'),
    piece('drive-fork-cap', box([0.024, 0.068, 0.08], 0.003), [mastColumnX + 0.132, 0.1, -reach], 'collar'),
  ];
  for (const [i, sx] of [-mastColumnX, mastColumnX].entries())
    for (const [j, sy] of [0.02, 0.2].entries())
      for (const [k, sz] of [-0.085, 0.085].entries())
        out.push(piece(`roller-${i}-${j}-${k}`, box([0.095, 0.036, 0.042], 0.002), [sx, sy, -reach + sz], 'steel'));

  for (const side of [-1, 1]) {
    const label = side < 0 ? 'a' : 'b';
    out.push(
      piece(`fork-${label}`, box([fork.width, fork.thickness, fork.length]), [side * fork.offset, 0, 0], 'steel'),
      piece(
        `tine-rail-${label}`,
        box([fork.width * 0.72, 0.018, fork.length * 0.92], 0.002),
        [side * fork.offset, -fork.thickness / 2 - 0.009, 0],
        'collar',
      ),
    );
  }
  const shown = Math.abs(reach) > 0.01;
  out.push(
    piece(
      'slide',
      box([slide.width, slide.thickness, Math.max(Math.abs(reach), 0.02)]),
      [0, -fork.thickness / 2 - slide.thickness / 2, -reach / 2],
      'steel',
      shown,
    ),
  );
  return out;
};

/** The sizes of the layer palletizer's parts that its views do not give, in metres (the core's pad, clamp window and rails). */
export const PALLETIZER = {
  padThickness: 0.03,
  jaw: { thickness: 0.02, depth: 0.25, open: 0.14 }, // open: how far a jaw stands off the layer when the clamp is open
  railGap: 0.12, // each of the two rails lies this far from the line the column follows
  rail: 0.05,
  carriage: { length: 0.14, height: 0.1, width: 0.3 },
  pusher: { face: 0.012, rod: 0.012, rodLength: 0.3 },
  rim: { thickness: 0.03, height: 0.04 },
} as const;

/** The two rails of the manipulator on their columns; ignores duplicate 0.06 m secondary views emitted by pick-place/gantry. */
const palletizerRails: ModelBuilder = (view) => {
  if (Math.abs(view.pose.size[1] - 0.06) < 1e-6 && Math.abs(view.pose.size[2] - 0.06) < 1e-6) return [];
  const { rail, railGap } = PALLETIZER;
  const [length] = view.pose.size;
  const floor = -view.pose.p[1];
  const out: Piece[] = [];
  for (const [i, z] of [-railGap, railGap].entries())
    out.push(piece(`rail-${'ab'[i]}`, slotted(rail, rail, length, 'x'), [0, 0, z], 'frame'));
  for (const [i, x] of [-1, 1].entries())
    for (const [j, z] of [-railGap, railGap].entries())
      out.push(...levellingLeg(`${'ab'[i]}${'ab'[j]}`, x * (length / 2 - rail / 2), z, -rail / 2, floor, rail));
  return out;
};

/** The column the pad hangs from; ignores duplicate 0.08 m secondary views emitted by pick-place/gantry. */
const palletizerColumn: ModelBuilder = (view) => {
  if (Math.abs(view.pose.size[0] - 0.08) < 1e-6 && Math.abs(view.pose.size[1] - 0.08) < 1e-6) return [];
  const { carriage: car } = PALLETIZER;
  const [w, h] = view.pose.size;
  return [
    piece('column', slotted(w, w, h, 'y'), [0, 0, 0], 'frame'),
    piece('carriage', box([car.length, car.height, car.width]), [0, h / 2, 0], 'housing'),
  ];
};

/** The squaring pusher: a bar with a rubber face toward the layer (-z) on two guide rods behind it, all moving with the pose. */
const palletizerPusher: ModelBuilder = (view) => {
  const { face, rod: r, rodLength } = PALLETIZER.pusher;
  const [w, h, t] = view.pose.size;
  const out: Piece[] = [
    piece('bar', box([w, h, t - face]), [0, 0, face / 2], 'painted'),
    piece('face', box([w - 0.04, h - 0.06, face]), [0, 0, -(t - face) / 2], 'rubber'),
  ];
  for (const [i, side] of [-1, 1].entries())
    out.push(piece(`guide-${'ab'[i]}`, rod(r, rodLength, 'z'), [side * (w / 4), 0, t / 2 + rodLength / 2], 'steel'));
  return out;
};

/** A fixed forming plate with a low rim along its top on the side of the layer (-x for the far plate, +z for the side plate). */
const palletizerPlate: ModelBuilder = (view) => {
  const { thickness, height } = PALLETIZER.rim;
  const [w, h, d] = view.pose.size;
  const rim =
    d > w
      ? piece('rim', box([thickness, height, d]), [-(w + thickness) / 2, h / 2 - height / 2, 0], 'steel')
      : piece('rim', box([w, height, thickness]), [0, h / 2 - height / 2, (d + thickness) / 2], 'steel');
  return [piece('plate', box(view.pose.size), [0, 0, 0], 'steel'), rim];
};

/**
 * The pad of the clamp head with its two jaws, which close on the layer by the grip's close fraction. No base is drawn: this view
 * is the moving head, and the forming zone lies over the infeed belt.
 */
const palletizerHead: ModelBuilder = (view) => {
  const { padThickness, jaw } = PALLETIZER;
  const [w, , d] = view.pose.size;
  const close = Math.max(0, Math.min(1, num(view.state.closeFraction)));
  const out: Piece[] = [piece('pad', box([w, padThickness, d]), [0, 0, 0], 'steel')];
  for (const [i, side] of [-1, 1].entries())
    out.push(
      piece(
        `jaw-${'ab'[i]}`,
        box([w - 0.04, jaw.depth, jaw.thickness]),
        [0, -(padThickness + jaw.depth) / 2, side * (d / 2 + jaw.thickness / 2 + jaw.open * (1 - close))],
        'painted',
      ),
    );
  return out;
};

/** The sizes of the machining centre's housing, in metres; its length, height and width are the view's. */
export const MACHINING = {
  wall: 0.022,
  inset: 0.76, // the body's share of the view's width: neighbouring machines on adjacent lines stand apart
  roof: { thickness: 0.035, crownHeight: 0.04 },
  plinth: { height: 0.045, depth: 0.038 },
  pillar: 0.15,
  sill: 0.065,
  header: 0.055,
  mullion: 0.018,
  spindle: { radius: 0.038, length: 0.11, drop: 0.1 }, // drop: how far a running cycle lowers the head
  table: { height: 0.04, depth: 0.15 },
  pendant: { size: [0.14, 0.21, 0.045] as const },
} as const;

/** The signal role of a stack light lamp, lit or not. */
const lamp = (colour: 'green' | 'amber' | 'red', on: boolean): Role =>
  `signal${colour[0]!.toUpperCase()}${colour.slice(1)}${on ? '' : 'Off'}` as Role;

/**
 * The enclosed CNC machining centre: grounded base cabinet on levelling feet, coolant-tray plinth, painted enclosure panels with a
 * darker housing stepped crown, framed front viewing window, spindle head + chuck + tool over a ribbed clamping table, front-facing
 * operator control console, and a roof 3-colour stack light on a short pole. Door openings remain completely clear.
 */
const machiningCentre: ModelBuilder = (view) => {
  const { wall, inset, roof, plinth, pillar, sill, header, mullion, spindle, table, pendant } = MACHINING;
  const { segment, off, lit, cap } = STACK_LIGHT;
  const [length, h, viewWidth] = view.pose.size;
  const width = viewWidth * inset;
  const [lo, hi] = [-h / 2, h / 2];
  const floor = -view.pose.p[1];
  const front = width / 2 - wall / 2;
  const busy = view.state.busy === true;
  const done = !busy && view.state.text === 'done';

  const bodyH = h - roof.thickness;
  const winW = Math.max(0.2, length - 2 * pillar);
  const glassH = Math.max(0.08, bodyH - sill - header);
  const winCenterY = lo + sill + glassH / 2;
  const spindleZ = -front + wall + 0.085;
  const headY = hi - roof.thickness - 0.03 - spindle.length / 2 - (busy ? spindle.drop : 0);
  const tableTop = lo + plinth.height + 0.03 + table.height;

  const out: Piece[] = [
    // Enclosure back, front pillars/apron/header, upper end bulkheads above doors, and stepped crown.
    piece('wall-back', box([length, bodyH, wall]), [0, lo + bodyH / 2, -front], 'housing'),
    piece('casing-back', box([length - 0.08, bodyH - 0.05, 0.012], 0.002), [0, lo + bodyH / 2, -front - wall / 2 - 0.004], 'painted'),
    piece('pillar-front-a', box([pillar, bodyH, wall]), [-(length / 2 - pillar / 2), lo + bodyH / 2, front], 'painted'),
    piece('pillar-front-b', box([pillar, bodyH, wall]), [length / 2 - pillar / 2, lo + bodyH / 2, front], 'painted'),
    piece(
      'endcap-a',
      box([0.024, Math.max(0.04, bodyH - 0.3), width]),
      [-(length / 2 - 0.012), lo + 0.3 + (bodyH - 0.3) / 2, 0],
      'painted',
    ),
    piece('endcap-b', box([0.024, Math.max(0.04, bodyH - 0.3), width]), [length / 2 - 0.012, lo + 0.3 + (bodyH - 0.3) / 2, 0], 'painted'),
    piece('sill', box([winW, sill, wall]), [0, lo + sill / 2, front], 'painted'),
    piece('header', box([winW, header, wall]), [0, lo + bodyH - header / 2, front], 'painted'),
    piece('roof', box([length, roof.thickness, width], 0.006), [0, hi - roof.thickness / 2, 0], 'housing'),
    piece('crown-trim', box([length - 0.1, 0.012, width - 0.06], 0.002), [0, hi + 0.002, 0], 'collar'),
    piece('crown', box([length - 0.12, roof.crownHeight, width - 0.08], 0.01), [0, hi + roof.crownHeight / 2, 0], 'housing'),

    // Framed front viewing window with dark mullions.
    piece('window', box([winW - 2 * mullion, glassH - 2 * mullion, wall / 2]), [0, winCenterY, front], 'glass'),
    piece('mullion-top', box([winW, mullion, wall + 0.004], 0.002), [0, lo + sill + glassH - mullion / 2, front], 'collar'),
    piece('mullion-bottom', box([winW, mullion, wall + 0.004], 0.002), [0, lo + sill + mullion / 2, front], 'collar'),
    piece(
      'mullion-left',
      box([mullion, glassH - 2 * mullion, wall + 0.004], 0.002),
      [-(winW / 2 - mullion / 2), winCenterY, front],
      'collar',
    ),
    piece(
      'mullion-right',
      box([mullion, glassH - 2 * mullion, wall + 0.004], 0.002),
      [winW / 2 - mullion / 2, winCenterY, front],
      'collar',
    ),

    // Coolant-tray base plinth.
    piece('plinth-front', box([length, plinth.height, plinth.depth]), [0, lo + plinth.height / 2, front - plinth.depth / 2], 'housing'),
    piece('plinth-back', box([length, plinth.height, plinth.depth]), [0, lo + plinth.height / 2, -front + plinth.depth / 2], 'housing'),

    // Interior headstock column, ribbed work table with clamping vise, and spindle/chuck/tool.
    piece('column', box([0.16, bodyH - 0.06, 0.08], 0.004), [0, lo + (bodyH - 0.06) / 2, -front + wall / 2 + 0.04], 'housing'),
    piece('table-bed', box([length * 0.42, 0.03, table.depth * 0.85]), [0, lo + plinth.height + 0.015, spindleZ], 'housing'),
    piece('table', box([length * 0.44, table.height, table.depth]), [0, tableTop - table.height / 2, spindleZ], 'steel'),
    piece('table-rib-a', box([length * 0.4, 0.012, 0.02], 0.002), [0, tableTop + 0.006, spindleZ - 0.035], 'collar'),
    piece('table-rib-b', box([length * 0.4, 0.012, 0.02], 0.002), [0, tableTop + 0.006, spindleZ + 0.035], 'collar'),
    piece('vise-a', box([0.04, 0.04, 0.075], 0.002), [-0.085, tableTop + 0.02, spindleZ], 'collar'),
    piece('vise-b', box([0.04, 0.04, 0.075], 0.002), [0.085, tableTop + 0.02, spindleZ], 'collar'),
    piece('spindle-head', box([0.17, 0.06, 0.13], 0.004), [0, headY + 0.055, spindleZ], 'housing'),
    piece('spindle', rod(spindle.radius, spindle.length, 'y'), [0, headY, spindleZ], 'steel'),
    piece('chuck', rod(0.024, 0.032, 'y'), [0, headY - spindle.length / 2 - 0.016, spindleZ], 'collar'),
    piece('tool', rod(0.009, 0.04, 'y'), [0, headY - spindle.length / 2 - 0.052, spindleZ], 'steel'),
  ];

  // Grounded machine base cabinet and levelling feet down to floor.
  if (lo - floor > 0.12) {
    const legTop = lo - 0.03;
    const lx = length / 2 - 0.09;
    const lz = width / 2 - 0.06;
    for (const [id, sx, sz] of [
      ['a', -lx, -lz],
      ['b', lx, -lz],
      ['c', -lx, lz],
      ['d', lx, lz],
    ] as const)
      out.push(...levellingLeg(id, sx, sz, legTop, floor, 0.045));
    const cabBot = floor + 0.07;
    const cabH = legTop - cabBot;
    if (cabH > 0.06) {
      out.push(
        piece('base-cabinet', box([length - 0.16, cabH, width - 0.07], 0.006), [0, cabBot + cabH / 2, 0], 'painted'),
        piece('base-door', box([length * 0.44, cabH * 0.72, 0.012], 0.002), [0, cabBot + cabH / 2, (width - 0.07) / 2 + 0.004], 'collar'),
      );
    }
  }

  // Front-right operator control console (visible from the first 3/4 view).
  const px = length / 2 - 0.1;
  const pz = front + wall / 2 + 0.046;
  out.push(
    piece('pendant-arm', box([0.04, 0.04, 0.034], 0.002), [px, 0.02, front + wall / 2 + 0.014], 'steel'),
    piece('pendant', box([...pendant.size], 0.005), [px, 0.02, pz], 'housing'),
    piece('pendant-bezel', box([0.116, 0.096, 0.01], 0.002), [px, 0.065, pz + pendant.size[2] / 2 + 0.003], 'collar'),
    piece('pendant-screen', box([0.094, 0.07, 0.006], 0.001), [px, 0.065, pz + pendant.size[2] / 2 + 0.007], 'zone'),
    piece('pendant-btn-start', rod(0.013, 0.012, 'z'), [px - 0.032, -0.035, pz + pendant.size[2] / 2 + 0.005], 'signalGreen'),
    piece('pendant-btn-stop', rod(0.013, 0.012, 'z'), [px, -0.035, pz + pendant.size[2] / 2 + 0.005], 'signalRed'),
    piece('pendant-btn-estop', rod(0.015, 0.012, 'z'), [px + 0.034, -0.035, pz + pendant.size[2] / 2 + 0.005], 'safety'),
  );

  // Roof 3-colour stack light on a short pole (green=busy, amber=done, red=off).
  const beaconX = length / 2 - 0.11;
  const beaconZ = front - 0.08;
  const crownTop = hi + roof.crownHeight;
  const stackBase = crownTop + 0.072;
  out.push(
    piece('beacon-base', rod(0.034, 0.012, 'y'), [beaconX, crownTop + 0.006, beaconZ], 'collar'),
    piece('beacon-pole', rod(0.011, 0.06, 'y'), [beaconX, crownTop + 0.042, beaconZ], 'steel'),
  );
  for (const [k, colour] of (['green', 'amber', 'red'] as const).entries()) {
    const on = colour === 'green' ? busy : colour === 'amber' ? done : false;
    const base = stackBase + k * segment;
    out.push(
      piece(
        `light-${colour}`,
        rod(on ? lit : off, segment - cap, 'y'),
        [beaconX, base + cap + (segment - cap) / 2, beaconZ],
        lamp(colour, on),
      ),
    );
  }
  out.push(piece('beacon-cap', rod(lit, cap, 'y'), [beaconX, stackBase + 3 * segment + cap / 2, beaconZ], 'collar'));
  return out;
};

/** The door panel with its glass window and a handle on its +x face; it follows the pose the core moves. */
const machiningDoor: ModelBuilder = (view) => {
  const [t, h, w] = view.pose.size;
  return [
    piece('panel', box(view.pose.size), [0, 0, 0], 'painted'),
    piece('window', box([t + 0.004, h * 0.4, w * 0.6]), [0, h * 0.15, 0], 'glass'),
    piece('handle', box([0.02, h * 0.3, 0.02]), [t / 2 + 0.01, -h * 0.1, w * 0.4], 'steel'),
  ];
};

export const STATIONS: ModelFamily = {
  'stacker-crane': carriage,
  'stacker-mast': mast,
  'stacker-rack': rack,
  'layer-palletizer': palletizerHead,
  'manipulator-frame': palletizerRails,
  'manipulator-beam': palletizerColumn,
  'layer-pusher': palletizerPusher,
  'layer-plate': palletizerPlate,
  'machining-centre': machiningCentre,
  'machining-door': machiningDoor,
};
