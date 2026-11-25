/**
 * Stations (plan-vis C6): the stacker crane with its mast and its high-bay rack; the layer palletizer and the machining centre come
 * in a later unit. The three views of the crane are drawn once each: the rack as uprights and load beams with the cell rails between
 * them (cells stay open, so stored items show), the mast on a floor rail with a top guide rail, the carriage with its forks.
 *
 * The mast and the crane are posed where they are, so the rails (the aisle) are drawn at the offset of the part's own origin from the
 * pose, which needs the scene part: they stay put in the world while the mast and the carriage move.
 */
import type { PartView, ScenePart, Vec3 } from '../../contracts';
import { box, piece, rotate, type ModelBuilder, type ModelContext, type ModelFamily, type Piece } from './shared';

/** The sizes of the stacker crane's frame, in metres; the cell rail sizes are the core's (they hold the stored items). */
export const STACKER = {
  upright: 0.05,
  beam: 0.08,
  beamDepth: 0.04,
  basePlate: 0.14,
  basePlateHeight: 0.012,
  cellRail: { width: 0.05, height: 0.1, length: 0.6, offset: 0.12 }, // offset: from the bay centre, as the core's rails
  aisleMargin: 0.3, // the aisle rails reach this far beyond the first and the last bay
  rail: { width: 0.08, height: 0.04 },
  truck: { size: 0.3, height: 0.08 },
  mastTopGap: 0.04, // the mast column ends under the top guide rail
  carriage: { size: 0.22, height: 0.3 },
  fork: { width: 0.05, thickness: 0.04, length: 0.6, offset: 0.055 }, // the fork plate of the core: 0.16 wide, 0.6 long, 0.04 thick
  slide: { width: 0.1, thickness: 0.03 },
} as const;
const FORK_DEFAULT_STROKE = 0.8;
const DEFAULTS = { columns: 4, bayPitchM: 1, forkStrokeM: FORK_DEFAULT_STROKE };

const num = (v: unknown, fallback = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
/** A number of the crane's scene part config, else the default. */
const setting = (context: ModelContext, key: keyof typeof DEFAULTS): number => num(context.scenePart?.config[key], DEFAULTS[key]);

/** The rack: `columns` bays of `levels` levels, every cell a pair of rails on a load beam at each face. */
const rack: ModelBuilder = (view) => {
  const { upright: u, beam, beamDepth, basePlate, basePlateHeight: bh, cellRail: rail } = STACKER;
  const [w, h] = view.pose.size;
  const cols = Math.max(1, Math.round(num(view.state.columns, 1)));
  const levels = Math.max(1, Math.round(num(view.state.levels, 1)));
  const [bay, level] = [num(view.state.bayPitchM), num(view.state.levelPitchM)];
  const floor = -view.pose.p[1];
  // The view is the plate behind the cells: the cells lie in front of it, in -z, from the rail ends to the plate.
  const back = -0.025 - u / 2;
  const faces = [
    ['front', back - rail.length + u],
    ['back', back],
  ] as const;
  // An upright at each end of the rack and at the boundary between two bays; bay c is centred on `(c - (cols + 1) / 2) * bay`.
  const xs = [-w / 2, ...Array.from({ length: cols - 1 }, (_, i) => (i + 1.5 - (cols + 1) / 2) * bay), w / 2];
  const out: Piece[] = [];
  for (const [face, z] of faces)
    xs.forEach((x, i) => {
      out.push(piece(`upright-${face}-${i}`, box([u, h / 2 - floor - bh, u]), [x, (h / 2 + floor + bh) / 2, z], 'painted'));
      out.push(piece(`base-${face}-${i}`, box([basePlate, bh, basePlate]), [x, floor + bh / 2, z], 'steel'));
    });
  for (let l = 1; l <= levels; l++) {
    const top = floor + l * level; // the top of the level's beams, under the cell rails
    for (const [face, z] of faces) out.push(piece(`beam-${face}-${l}`, box([w, beam, beamDepth]), [0, top - beam / 2, z], 'steel'));
    for (let c = 1; c <= cols; c++)
      for (const side of [-1, 1])
        out.push(
          piece(
            `cell-${c}-${l}-${side < 0 ? 'a' : 'b'}`,
            box([rail.width, rail.height, rail.length]),
            [(c - (cols + 1) / 2) * bay + side * rail.offset, top + rail.height / 2, back - rail.length / 2 + u / 2],
            'steel',
          ),
        );
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

/** The mast on its truck, between the floor rail and the top guide rail of the aisle, which do not move. */
const mast: ModelBuilder = (view, context) => {
  const { rail, truck, mastTopGap, aisleMargin } = STACKER;
  const [w, h] = view.pose.size;
  const floor = -view.pose.p[1];
  const [ox, , oz] = aisleOrigin(view, context.scenePart);
  const length = setting(context, 'columns') * setting(context, 'bayPitchM') + 2 * aisleMargin;
  const cx = ox - aisleMargin + length / 2;
  const top = h / 2;
  const columnBottom = floor + rail.height + truck.height;
  const columnTop = top - mastTopGap;
  return [
    piece('rail-floor', box([length, rail.height, rail.width]), [cx, floor + rail.height / 2, oz], 'steel'),
    piece('rail-top', box([length, rail.height, rail.width]), [cx, top - rail.height / 2, oz], 'steel'),
    piece('truck', box([truck.size, truck.height, truck.size]), [0, floor + rail.height + truck.height / 2, 0], 'housing'),
    piece('mast', box([w, columnTop - columnBottom, w]), [0, (columnTop + columnBottom) / 2, 0], 'painted'),
  ];
};

/** The carriage on the mast, and the forks that run out of it toward the rack by the part's fork position. */
const carriage: ModelBuilder = (view, context) => {
  const { carriage: car, fork, slide } = STACKER;
  const reach = Math.max(-1, Math.min(1, num(view.state.fraction))) * setting(context, 'forkStrokeM');
  // The view is posed at the fork plate, the carriage stays on the mast: `reach` behind it.
  const out: Piece[] = [
    piece('carriage', box([car.size, car.height, car.size]), [0, -fork.thickness / 2 - car.height / 2, -reach], 'housing'),
  ];
  for (const side of [-1, 1])
    out.push(piece(`fork-${side < 0 ? 'a' : 'b'}`, box([fork.width, fork.thickness, fork.length]), [side * fork.offset, 0, 0], 'steel'));
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

export const STATIONS: ModelFamily = { 'stacker-crane': carriage, 'stacker-mast': mast, 'stacker-rack': rack };
