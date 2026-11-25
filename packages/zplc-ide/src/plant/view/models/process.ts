/**
 * Process and items (plan-vis C7): the tank with its pipes, on/off and proportional valves, level meter and flow meter. Items are
 * drawn by the renderer's item layers, not here.
 *
 * The tank is a glass vessel inscribed in the pose box on four levelling legs, with a dished cap, an inlet pipe into the cap and
 * an outlet pipe near the bottom, each with a valve. A composed model replaces the renderer's single pose box and its liquid box, so the
 * vessel is `glass` (clear, 0.3 opacity) with the `liquid` column inside it, and an overflow ring of liquid shows at the rim.
 * The valves' openings are not published, so a valve looks the same open or shut. Pieces stay within the pose box except the pipe stubs,
 * which reach `STUB` m beyond the vessel along x.
 */
import type { PartView } from '../../contracts';
import { catalogue } from '../../core/catalogue';
import { box, levellingLeg, piece, rod, type ModelContext, type ModelFamily, type Piece } from './shared';

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

/** The size of the parts of the tank, in metres. */
export const TANK = { margin: 0.03, stub: 0.25, pipe: 0.015, leg: 0.12, cap: 0.05, top: 0.1, steps: 50 } as const;

/** A config value of the tank's scene part, else the default the catalogue declares for it, else `fallback`. */
function setting<T extends string | number>(context: ModelContext, key: string, fallback: T): T {
  const set = context.scenePart?.config[key];
  if (typeof set === typeof fallback) return set as T;
  const def = catalogue.get('tank')?.config[key]?.default;
  return typeof def === typeof fallback ? (def as T) : fallback;
}

/** A pipe along x from `x0` to `x1` at height `y`. */
const pipe = (slotName: string, x0: number, x1: number, y: number): Piece =>
  piece(slotName, rod(TANK.pipe, Math.abs(x1 - x0), 'x'), [(x0 + x1) / 2, y, 0], 'steel');

/** An on/off valve (a pneumatic actuator on top) or a proportional one (a positioner box on top) on a pipe at (x, y). */
function valve(name: string, x: number, y: number, numeric: boolean): Piece[] {
  return [
    piece(`${name}-valve`, box([0.07, 0.07, 0.07], 0.006), [x, y, 0], 'housing'),
    piece(`${name}-stem`, rod(0.006, 0.03, 'y'), [x, y + 0.05, 0], 'steel'),
    numeric
      ? piece(`${name}-positioner`, box([0.06, 0.05, 0.045], 0.004), [x, y + 0.09, 0], 'housing')
      : piece(`${name}-actuator`, rod(0.025, 0.05, 'y'), [x, y + 0.09, 0], 'housing'),
  ];
}

/** An inline flow meter: a body on the pipe and a small display head on top. */
const meter = (name: string, x: number, y: number): Piece[] => [
  piece(`${name}-meter`, box([0.06, 0.06, 0.06], 0.006), [x, y, 0], 'housing'),
  piece(`${name}-meter-head`, box([0.04, 0.03, 0.04], 0.004), [x, y + 0.045, 0], 'painted'),
];

function tankModel(view: PartView, context: ModelContext): Piece[] {
  const { margin, stub, leg, cap, top, steps } = TANK;
  const [width, height, depth] = view.pose.size;
  const numeric = setting<string>(context, 'variant', 'numeric') !== 'digital';
  const fraction = Math.round(clamp01(typeof view.state.fraction === 'number' ? view.state.fraction : 0) * steps) / steps;
  const spilling = view.state.spilling === true;
  const r = Math.min(width, depth) / 2 - margin;
  const floor = -height / 2;
  const legHeight = Math.min(leg, 0.2 * height);
  const bodyBottom = floor + legHeight;
  const bodyTop = height / 2 - top - cap; // the cap and the room for the valves' actuators are above it
  const body = bodyTop - bodyBottom;
  const capTop = bodyTop + cap;
  const inletY = capTop - 0.025;
  const outletY = bodyBottom + 0.05;
  const end = r + stub;
  const pieces: Piece[] = [
    piece('vessel', rod(r, body, 'y'), [0, bodyBottom + body / 2, 0], 'glass'),
    piece('cap-lower', rod(r, cap / 2, 'y'), [0, bodyTop + cap / 4, 0], 'steel'),
    piece('cap-upper', rod(0.6 * r, cap / 2, 'y'), [0, bodyTop + (3 * cap) / 4, 0], 'steel'),
    pipe('inlet-pipe', -end, -0.3 * r, inletY),
    pipe('outlet-pipe', r - 0.01, end, outletY),
    ...valve('inlet', -(r + 0.09), inletY, numeric),
    ...valve('outlet', r + 0.09, outletY, numeric),
    // Overflow: a thin ring at the rim, drawn only while the tank spills.
    piece('overflow', rod(r + 0.012, 0.01, 'y'), [0, bodyTop + 0.005, 0], 'liquid', spilling),
  ];
  for (const [id, sx, sz] of [
    ['a', -1, -1],
    ['b', 1, -1],
    ['c', -1, 1],
    ['d', 1, 1],
  ] as const)
    pieces.push(...levellingLeg(id, sx * 0.65 * r, sz * 0.65 * r, bodyBottom, floor));

  // ponytail: the column height is quantised to `steps`, so a changing level makes at most steps + 1 geometries, not one per frame.
  const column = Math.max(fraction * body, 0.001);
  pieces.push(piece('liquid', rod(0.96 * r, column, 'y'), [0, bodyBottom + column / 2, 0], 'liquid', fraction > 0));

  if (numeric) {
    pieces.push(
      piece('transmitter', rod(0.02, 0.06, 'y'), [0, capTop + 0.03, 0], 'housing'),
      piece('transmitter-head', box([0.06, 0.03, 0.06], 0.004), [0, capTop + 0.075, 0], 'painted'),
      ...meter('inlet', -(r + 0.19), inletY),
      ...meter('outlet', r + 0.19, outletY),
    );
  } else {
    // The switches sit on the back (-z) wall at the heights of the core's levelLow and levelHigh, as fractions of the vessel.
    for (const [id, key, fallback] of [
      ['low', 'lowFraction', 0.2],
      ['high', 'highFraction', 0.8],
    ] as const)
      pieces.push(
        piece(
          `level-switch-${id}`,
          box([0.05, 0.05, 0.04], 0.004),
          [0, bodyBottom + setting<number>(context, key, fallback) * body, -(r + 0.009)],
          'housing',
        ),
      );
  }
  return pieces;
}

export const PROCESS: ModelFamily = { tank: tankModel };
