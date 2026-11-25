/**
 * Conveyors (plan-vis C1): the belt, the roller conveyor, the curved conveyor, the chain transfer, the turntable and the lift. Every
 * frame is slotted aluminium profile on levelling feet (the shared helpers), and every one of them shows that it runs the same way:
 * white arrow heads on its conveying surface that point its way and travel with it (VIS-016).
 */
import type { PartView, Vec3 } from '../../contracts';
import {
  box,
  extrusion,
  levellingLeg,
  MIN_STAND,
  piece,
  rod,
  slotted,
  type ModelContext,
  type ModelFamily,
  type Piece,
  type PieceShape,
} from './shared';

const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const speedOf = (view: PartView): number => num(view.state.speedMps, 0);

/** The direction mark of the new conveyors: larger than the belt's, so the change is seen from the first view of a scene (VIS-016). */
const MARK = { radius: 0.09, pitch: 0.3 } as const;

/** A flat arrow head of radius `r` whose tip points along +z at yaw 0 (a three-sided cylinder). */
const arrow = (r: number): PieceShape => ({ kind: 'cylinder', radius: r, length: 0.003, axis: 'y', sides: 3 });

interface MarkOptions {
  axis?: 'x' | 'z';
  margin?: number;
  radius?: number;
  pitch?: number;
}

/**
 * Direction marks on a straight conveying surface `length` long along `axis`, at height `y`: arrow heads shown only while it runs
 * (shape, not colour, says "running"), that point its way and travel with it; under reduced motion `travel` stays put and they are a
 * still direction mark (VIS-016). `margin` keeps them off the drums at the ends.
 */
function directionMarks(length: number, y: number, speed: number, travel: number, options: MarkOptions = {}): Piece[] {
  const { axis = 'x', margin = 0, radius = MARK.radius, pitch = MARK.pitch } = options;
  const running = Math.abs(speed) > 1e-6;
  const marks = Math.max(1, Math.floor(length / pitch));
  const step = length / marks;
  const yaw = axis === 'x' ? (speed >= 0 ? Math.PI / 2 : -Math.PI / 2) : speed >= 0 ? 0 : Math.PI;
  const out: Piece[] = [];
  for (let i = 0; i < marks; i++) {
    const u = ((((i + 0.5) * step + travel) % length) + length) % length;
    const shown = running && u > margin + radius && u < length - margin - radius;
    if (!shown) continue; // a stopped part carries no mark, so its bounds stay its declared size (VIS-002)
    const along = -length / 2 + u;
    out.push(piece(`mark-${i}`, arrow(radius), axis === 'x' ? [along, y, 0] : [0, y, along], 'mark', true, yaw));
  }
  return out;
}

/**
 * Legs under a straight frame whose two side rails lie at z = +-`railZ` and end at `railBottom`: pairs of slotted profile legs on
 * levelling feet, at most 1.5 m apart, each pair with a cross brace. None for a frame close to the floor.
 */
function frameLegs(length: number, railZ: number, railBottom: number, floor: number): Piece[] {
  const legLength = railBottom - floor;
  if (legLength <= MIN_STAND) return [];
  const out: Piece[] = [];
  const pairs = Math.max(2, Math.ceil(length / 1.5) + 1);
  const span = Math.max(0, length - 0.3);
  for (let k = 0; k < pairs; k++) {
    const x = -span / 2 + (span * k) / (pairs - 1);
    for (const [side, z] of [
      ['a', -railZ],
      ['b', railZ],
    ] as const)
      out.push(...levellingLeg(`${k}-${side}`, x, z, railBottom, floor, BELT.leg));
    out.push(piece(`brace-${k}`, slotted(0.03, 0.03, 2 * railZ, 'z'), [x, floor + legLength * 0.3, 0], 'frame'));
  }
  return out;
}

/** Steel rollers across a bed `length` long and `span` wide (along z), their tops at `top`: as many as fit at `pitch`, evenly spread. */
function rollers(length: number, span: number, top: number, radius: number, pitch: number): Piece[] {
  const n = Math.max(1, Math.round(length / pitch));
  return Array.from({ length: n }, (_, k) =>
    piece(`roller-${k}`, rod(radius, span, 'z'), [-length / 2 + ((k + 0.5) * length) / n, top - radius, 0], 'steel'),
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Belt: a band that wraps a steel drum at each end, side frames of slotted aluminium profile that stop at the drum axes, round
// end caps that hold the drums, legs on levelling feet with cross braces, and direction marks that travel with the band
// ---------------------------------------------------------------------------------------------------------------------

export const BELT = {
  band: 0.012,
  rail: { height: 0.13, width: 0.03, lip: 0.012 },
  /** Radius of the band where it wraps an end drum; the steel drum inside it is one band thinner. */
  drum: 0.05,
  leg: 0.04,
  /** Distance between two direction marks along the band, and the radius of each arrow head. */
  markPitch: 0.3,
  markRadius: 0.065,
} as const;

/** The band, its return run, the side frames, and the end drums with their caps, of a belt `length` by `width` whose top is `top`. */
function beltBed(length: number, width: number, top: number): Piece[] {
  const { band, rail, drum } = BELT;
  const railZ = width / 2 + rail.width / 2;
  const axle = length / 2 - drum; // x of each drum's axis; the band's flat runs lie between the two
  const axleY = top - drum;
  const pieces: Piece[] = [
    piece('band', box([2 * axle, band, width], 0.002), [0, top - band / 2, 0], 'band'),
    piece('return', box([2 * axle, band, width], 0.002), [0, axleY - drum + band / 2, 0], 'band'),
    piece('rail-a', slotted(rail.width, rail.height, 2 * axle, 'x'), [0, top + rail.lip - rail.height / 2, -railZ], 'frame'),
    piece('rail-b', slotted(rail.width, rail.height, 2 * axle, 'x'), [0, top + rail.lip - rail.height / 2, railZ], 'frame'),
  ];
  for (const [end, x] of [
    ['a', -axle],
    ['b', axle],
  ] as const) {
    pieces.push(piece(`wrap-${end}`, rod(drum, width, 'z'), [x, axleY, 0], 'band'));
    pieces.push(piece(`drum-${end}`, rod(drum - band, width + 2 * rail.width, 'z'), [x, axleY, 0], 'steel'));
    for (const side of [-1, 1]) {
      const z = side * (railZ + rail.width / 2);
      pieces.push(piece(`cap-${end}${side}`, rod(drum + 0.008, 0.008, 'z'), [x, axleY, z + side * 0.004], 'steel'));
      pieces.push(piece(`nut-${end}${side}`, rod(0.012, 0.01, 'z'), [x, axleY, z + side * 0.013], 'steel'));
    }
  }
  return pieces;
}

function beltModel(view: PartView, context: ModelContext): Piece[] {
  const [length, thickness, width] = view.pose.size;
  const top = thickness / 2;
  const { rail, drum } = BELT;
  return [
    ...beltBed(length, width, top),
    ...frameLegs(length, width / 2 + rail.width / 2, top + rail.lip - rail.height, -view.pose.p[1]),
    ...directionMarks(length, top + 0.002, speedOf(view), context.travel, {
      margin: drum,
      radius: BELT.markRadius,
      pitch: BELT.markPitch,
    }),
  ];
}

// ---------------------------------------------------------------------------------------------------------------------
// Roller conveyor: a row of steel rollers that stand proud of two slotted side frames, on levelling legs
// ---------------------------------------------------------------------------------------------------------------------

export const ROLLER = { radius: 0.025, pitch: 0.1, rail: { width: 0.03, height: 0.1 }, proud: 0.01 } as const;

function rollerModel(view: PartView, context: ModelContext): Piece[] {
  const [length, thickness, width] = view.pose.size;
  const top = thickness / 2;
  const { rail, proud } = ROLLER;
  const railZ = width / 2 + rail.width / 2;
  const railTop = top - proud;
  return [
    ...rollers(length, width, top, ROLLER.radius, ROLLER.pitch),
    piece('rail-a', slotted(rail.width, rail.height, length, 'x'), [0, railTop - rail.height / 2, -railZ], 'frame'),
    piece('rail-b', slotted(rail.width, rail.height, length, 'x'), [0, railTop - rail.height / 2, railZ], 'frame'),
    ...frameLegs(length, railZ, railTop - rail.height, -view.pose.p[1]),
    ...directionMarks(length, top + 0.002, speedOf(view), context.travel),
  ];
}

// ---------------------------------------------------------------------------------------------------------------------
// Curved conveyor: a quarter-turn band between end drums, side frames in straight lengths of slotted profile along both edges,
// and legs on levelling feet with radial braces. The view's origin is the arc's centre; the band sweeps x >= 0, z <= 0.
// ---------------------------------------------------------------------------------------------------------------------

/** Straight lengths of profile per side frame, and the steps of each edge of the band's outline. */
export const CURVE = { railSegments: 8, steps: 24 } as const;

/**
 * A flat annular sector between radii `inner` and `outer` and the angles `from` to `to` (from +x towards -z), `height` thick, its
 * top at `top`. The outline is centred on its own box, so the piece's bounds are the sector's.
 */
function sector(slot: string, inner: number, outer: number, from: number, to: number, height: number, top: number): Piece {
  const n = CURVE.steps;
  const at = (r: number, i: number): [number, number] => {
    const t = from + ((to - from) * i) / n;
    return [r * Math.cos(t), -r * Math.sin(t)];
  };
  const outline = [
    ...Array.from({ length: n + 1 }, (_, i) => at(outer, i)),
    ...Array.from({ length: n + 1 }, (_, i) => at(inner, n - i)),
  ];
  const mid = (k: 0 | 1) => (Math.min(...outline.map((p) => p[k])) + Math.max(...outline.map((p) => p[k]))) / 2;
  const [cx, cz] = [mid(0), mid(1)];
  return piece(slot, extrusion(outline.map(([x, z]) => [x - cx, z - cz] as const), height, 'y'), [cx, top - height / 2, cz], 'band');
}

function curvedModel(view: PartView, context: ModelContext): Piece[] {
  const [width, thickness] = view.pose.size;
  const outer = num(view.state.radius, width);
  const inner = Math.max(0, outer - width);
  const centre = (inner + outer) / 2;
  // ponytail: the core builds quarter turns only (angleDeg 90), which keeps the end drums square to the axes; read angleDeg if
  // another sweep is ever published.
  const sweep = Math.PI / 2;
  const top = thickness / 2;
  const floor = -view.pose.p[1];
  const { band, rail, drum } = BELT;
  const end = drum / centre; // the flat run of the band stops a drum's radius short of each end, where it wraps the drum
  const axleY = top - drum;
  const at = (r: number, theta: number, y: number): Vec3 => [r * Math.cos(theta), y, -r * Math.sin(theta)];
  const pieces: Piece[] = [
    sector('band', inner, outer, end, sweep - end, band, top),
    sector('return', inner, outer, end, sweep - end, band, axleY - drum + band),
  ];
  // The end drums, each along the radius at its end: 'a' on -z (the 'in' end of a right-hand curve), 'b' on +x.
  for (const [e, at0, axis] of [
    ['a', [drum, axleY, -centre], 'z'],
    ['b', [centre, axleY, -drum], 'x'],
  ] as const) {
    pieces.push(piece(`wrap-${e}`, rod(drum, width, axis), [...at0], 'band'));
    pieces.push(piece(`drum-${e}`, rod(drum - band, width + 2 * rail.width, axis), [...at0], 'steel'));
  }
  // Side frames: straight lengths of profile tangent to each edge, a little longer than the chord so their outer faces meet.
  const step = (sweep - 2 * end) / CURVE.railSegments;
  const railY = top + rail.lip - rail.height / 2;
  const edges = [
    ['in', inner - rail.width / 2],
    ['out', outer + rail.width / 2],
  ] as const;
  for (const [side, r] of edges) {
    const length = (2 * r + rail.width) * Math.tan(step / 2);
    for (let k = 0; k < CURVE.railSegments; k++) {
      const theta = end + (k + 0.5) * step;
      const shape = slotted(rail.width, rail.height, length, 'x');
      pieces.push(piece(`rail-${side}-${k}`, shape, at(r, theta, railY), 'frame', true, theta + Math.PI / 2));
    }
  }
  // Legs under both side frames, 0.25 m in from each end along the centreline, with a radial brace between each pair.
  const railBottom = top + rail.lip - rail.height;
  const legLength = railBottom - floor;
  const arc = centre * sweep;
  if (legLength > MIN_STAND) {
    const pairs = Math.max(2, Math.ceil(arc / 1.5) + 1);
    const first = Math.min(0.25, arc / 4) / centre;
    for (let k = 0; k < pairs; k++) {
      const theta = first + ((sweep - 2 * first) * k) / (pairs - 1);
      for (const [side, r] of edges) {
        const [x, , z] = at(r, theta, 0);
        pieces.push(...levellingLeg(`${k}-${side}`, x, z, railBottom, floor, BELT.leg));
      }
      const brace = slotted(0.03, 0.03, width + rail.width, 'x');
      pieces.push(piece(`brace-${k}`, brace, at(centre, theta, floor + legLength * 0.3), 'frame', true, theta));
    }
  }
  // Direction marks round the centreline, tangent to it, from the 'in' end on -z to the 'out' end on +x.
  // ponytail: the view does not publish the hand; a left-hand curve runs from +x to -z, so its marks point backwards until the core
  // publishes `hand` in the curved view's state.
  const speed = speedOf(view);
  const marks = Math.max(1, Math.floor(arc / MARK.pitch));
  for (let i = 0; i < marks; i++) {
    const s = ((((i + 0.5) * (arc / marks) + context.travel) % arc) + arc) % arc;
    const theta = sweep - s / centre;
    const shown = Math.abs(speed) > 1e-6 && s > drum + MARK.radius && s < arc - drum - MARK.radius;
    const yaw = speed >= 0 ? theta : theta + Math.PI;
    pieces.push(piece(`mark-${i}`, arrow(MARK.radius), at(centre, theta, top + 0.002), 'mark', shown, yaw));
  }
  return pieces;
}

// ---------------------------------------------------------------------------------------------------------------------
// Chain transfer: a roller bed in a slotted frame on levelling legs, with dark chain strands between the rollers that rise above
// them to carry items across. The view's pose rises with the strands; the bed, the frame and the legs stay where they stand.
// ---------------------------------------------------------------------------------------------------------------------

export const CHAIN = {
  radius: 0.025,
  pitch: 0.125,
  /**
   * How far the strands rise: the catalogue default of liftM. ponytail: the view does not publish liftM, so a chain transfer with
   * another lift draws its bed that much off its place while it rises; publish liftM in the view if a scene ever sets it.
   */
  lift: 0.05,
  /** How far the tops of the strands lie under the tops of the rollers while lowered. */
  sink: 0.008,
  strand: { width: 0.03, height: 0.09 },
  rail: { width: 0.03, height: 0.1 },
} as const;

function chainModel(view: PartView, context: ModelContext): Piece[] {
  const [length, thickness, width] = view.pose.size;
  const top = thickness / 2;
  const f = Math.min(1, Math.max(0, num(view.state.fraction, 0)));
  const bed = top - f * CHAIN.lift; // the tops of the rollers, which do not rise
  const { rail, strand } = CHAIN;
  const railZ = width / 2 + rail.width / 2;
  const railTop = bed - CHAIN.radius; // at the rollers' axes: a raised item passes over the frame
  const n = Math.max(1, Math.round(length / CHAIN.pitch));
  const pieces: Piece[] = rollers(length, width, bed, CHAIN.radius, CHAIN.pitch);
  // A strand in every other gap between two rollers, its top under the rollers' while lowered and the conveying surface raised.
  const strandTop = top - (1 - f) * CHAIN.sink;
  for (let k = 0; 2 * k + 1 < n; k++) {
    const x = -length / 2 + ((2 * k + 1) * length) / n;
    pieces.push(piece(`strand-${k}`, box([strand.width, strand.height, width], 0.003), [x, strandTop - strand.height / 2, 0], 'rubber'));
  }
  pieces.push(
    piece('rail-a', slotted(rail.width, rail.height, length, 'x'), [0, railTop - rail.height / 2, -railZ], 'frame'),
    piece('rail-b', slotted(rail.width, rail.height, length, 'x'), [0, railTop - rail.height / 2, railZ], 'frame'),
    ...frameLegs(length, railZ, railTop - rail.height, -view.pose.p[1]),
  );
  // Lowered, the rollers carry along x; raised, the strands carry across, along z.
  const across = view.state.axis === 'z';
  const marks = directionMarks(across ? width : length, top + 0.002, speedOf(view), context.travel, { axis: across ? 'z' : 'x' });
  return [...pieces, ...marks];
}

// ---------------------------------------------------------------------------------------------------------------------
// Turntable: a deck of rollers between two slotted rails on a slewing ring, over a square base frame on levelling legs. The view's
// pose turns with the deck; the base frame and its legs turn back by the same angle, so they stay where they stand.
// ---------------------------------------------------------------------------------------------------------------------

export const TABLE = { radius: 0.025, pitch: 0.1, rail: { width: 0.03, height: 0.08 }, deck: 0.015, ring: 0.03, base: 0.04 } as const;

function turntableModel(view: PartView, context: ModelContext): Piece[] {
  const [size, thickness] = view.pose.size;
  const top = thickness / 2;
  const floor = -view.pose.p[1];
  const { rail, deck, ring, base } = TABLE;
  const railTop = top - ROLLER.proud;
  const railZ = size / 2 - rail.width / 2;
  const deckTop = railTop - rail.height;
  const ringTop = deckTop - deck;
  const pieces: Piece[] = [
    ...rollers(size, size - 2 * rail.width, top, TABLE.radius, TABLE.pitch),
    piece('rail-a', slotted(rail.width, rail.height, size, 'x'), [0, railTop - rail.height / 2, -railZ], 'frame'),
    piece('rail-b', slotted(rail.width, rail.height, size, 'x'), [0, railTop - rail.height / 2, railZ], 'frame'),
    piece('deck', box([size, deck, size], 0.003), [0, deckTop - deck / 2, 0], 'painted'),
    piece('ring', rod(0.3 * size, ring, 'y'), [0, ringTop - ring / 2, 0], 'steel'),
  ];
  // The base, in its own frame: a square of profile under the ring and a leg on a levelling foot at each corner.
  const b = size / 2 - 0.07;
  const frameY = ringTop - ring - base / 2;
  const fixed: Piece[] = [
    piece('frame-a', slotted(base, base, 2 * b + base, 'x'), [0, frameY, -b], 'frame'),
    piece('frame-b', slotted(base, base, 2 * b + base, 'x'), [0, frameY, b], 'frame'),
    piece('frame-c', slotted(base, base, 2 * b - base, 'z'), [-b, frameY, 0], 'frame'),
    piece('frame-d', slotted(base, base, 2 * b - base, 'z'), [b, frameY, 0], 'frame'),
  ];
  const corners = [
    [-b, -b],
    [b, -b],
    [-b, b],
    [b, b],
  ] as const;
  if (frameY - base / 2 - floor > MIN_STAND)
    corners.forEach(([x, z], k) => fixed.push(...levellingLeg(String(k), x, z, frameY - base / 2, floor, base)));
  // The deck has turned by angleDeg towards +z from the base; in the deck's frame the base turns back by as much.
  const a = (num(view.state.angleDeg, 0) * Math.PI) / 180;
  const [c, s] = [Math.cos(a), Math.sin(a)];
  for (const p of fixed) pieces.push({ ...p, at: [p.at[0] * c + p.at[2] * s, p.at[1], -p.at[0] * s + p.at[2] * c], yaw: p.yaw + a });
  return [...pieces, ...directionMarks(size, top + 0.002, speedOf(view), context.travel)];
}

// ---------------------------------------------------------------------------------------------------------------------
// Lift: a short belt platform carried by guide blocks between four slotted posts on levelling feet, with a beam along the top of
// each side and the drive on one of them. The view's pose travels with the platform; the posts stand on the floor and reach above
// its top level, so the lift's box does not change as it travels.
// ---------------------------------------------------------------------------------------------------------------------

export const LIFT = {
  post: 0.06,
  /** Between the outer face of the platform's frame and a post: the guide blocks. */
  gap: 0.03,
  /** How far the posts reach above the platform at its top level. */
  headroom: 0.15,
  /** How far each post stands in from an end of the platform. */
  inset: 0.2,
} as const;

function liftModel(view: PartView, context: ModelContext): Piece[] {
  const [length, thickness, width] = view.pose.size;
  const top = thickness / 2;
  const floor = -view.pose.p[1];
  const stroke = num(view.state.strokeM, 0);
  const levelOne = top - num(view.state.fraction, 0) * stroke; // the platform's top at level 1, in the platform's frame
  const { post, gap, headroom, inset } = LIFT;
  const { rail } = BELT;
  const px = length / 2 - inset;
  const pz = width / 2 + rail.width + gap + post / 2;
  const postTop = levelOne + stroke + headroom;
  const railY = top + rail.lip - rail.height / 2;
  const pieces: Piece[] = beltBed(length, width, top);
  const corners = [
    [-px, -pz],
    [px, -pz],
    [-px, pz],
    [px, pz],
  ] as const;
  corners.forEach(([x, z], k) => {
    pieces.push(...levellingLeg(`post-${k}`, x, z, postTop, floor, post));
    const blockZ = Math.sign(z) * (width / 2 + rail.width + gap / 2);
    pieces.push(piece(`guide-${k}`, box([post + 0.02, 0.1, gap], 0.003), [x, railY, blockZ], 'steel'));
  });
  for (const [side, z] of [
    ['a', -pz],
    ['b', pz],
  ] as const) {
    pieces.push(piece(`beam-${side}`, slotted(post, post, 2 * px + post, 'x'), [0, postTop + post / 2, z], 'frame'));
    pieces.push(piece(`sill-${side}`, slotted(0.04, 0.04, 2 * px - post, 'x'), [0, floor + 0.15, z], 'frame'));
  }
  pieces.push(piece('motor', box([0.18, 0.12, 0.1], 0.01), [0, postTop + post + 0.06, -pz], 'painted'));
  return [...pieces, ...directionMarks(length, top + 0.002, speedOf(view), context.travel, { margin: BELT.drum })];
}

export const CONVEYORS: ModelFamily = {
  belt: beltModel,
  roller: rollerModel,
  curved: curvedModel,
  'chain-transfer': chainModel,
  turntable: turntableModel,
  lift: liftModel,
};
