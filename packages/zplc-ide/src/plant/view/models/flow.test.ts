/** The flow control, source and sink models (plan-vis C2; VIS-014): the emitter of belt-to-sensor as the real plant core publishes it. */
import { describe, expect, it } from 'bun:test';
import type { PartView, ScenePart } from '../../contracts';
import { LEVELLING_FOOT, rotate } from './shared';
import { ALIGNER, ARM, BLADE, EMITTER, FLOW, PUSHER } from './flow';
import { partModel, pieceExtent } from './index';
import { beltToSensor, bottom, slot } from './models.fixtures';

const plant = beltToSensor();

describe('flow control, source and sink models (VIS-014)', () => {
  it('PRT-009 the flow family draws the emitter, stop blade, pusher, diverter arm, aligner, chute and remover', () => {
    expect(Object.keys(FLOW)).toEqual(['emitter', 'stop-blade', 'pusher', 'diverter-arm', 'aligner', 'chute', 'remover']);
  });

  it('VIS-014 the emitter marks the zone where items appear with four flat corner marks, not a cage', async () => {
    const emitter = (await plant.views()).emitter!;
    const pieces = partModel(emitter)!;
    expect(pieces.length).toBe(8);
    expect(new Set(pieces.map((p) => p.role))).toEqual(new Set(['zone']));
    for (const p of pieces) {
      expect(bottom(p)).toBeGreaterThanOrEqual(0);
      expect(p.at[1] + pieceExtent(p)[1]).toBeLessThanOrEqual(0.005); // lying on the surface the items appear on
      expect(Math.max(Math.abs(p.at[0]), Math.abs(p.at[2])) + 1e-9).toBeGreaterThanOrEqual(EMITTER.size / 2 - EMITTER.mark);
    }
  });
});

const SURFACE = 0.9; // the belt surface the three parts stand beside, in world y
const Q: PartView['pose']['q'] = [0, 0, 0, 1];
const view = (part: string, size: PartView['pose']['size'], p: PartView['pose']['p'], state: PartView['state']): PartView => ({
  id: part,
  part,
  name: part,
  pose: { id: part, part, kind: 'box', size, p, q: Q },
  state,
  signals: {},
});
/** The stop blade as the plant core publishes it: `f` of its 0.4 s travel, 0 retracted. */
const blade = (f: number) =>
  view('stop-blade', [0.05, 0.3, 0.6], [0, SURFACE + 0.15 - (1 - f) * (0.3 + BLADE.sink), 0], {
    travelMs: f * BLADE.travelMs,
    stuck: false,
  });
/** The pusher: its plate has moved `f` of the 0.6 m stroke along +z. */
const pusher = (f: number, stroke: number = PUSHER.stroke) =>
  view('pusher', [0.4, 0.25, 0.05], [0, SURFACE + 0.005 + 0.125, f * stroke], { fraction: f });
const arm = (f: number) => view('diverter-arm', [0.8, 0.25, 0.05], [0.4, SURFACE + 0.13, 0], { fraction: f });
const world = (v: PartView, p: { at: readonly number[] }, i: number) => v.pose.p[i]! + p.at[i]!;
/** The x/z box, in the world, of the pieces that stand still (all but the moving plate and rod of a pusher). */
const footprint = (v: PartView) => {
  const pieces = partModel(v)!.filter((p) => p.slot !== 'plate' && p.slot !== 'rod');
  const lo = [Infinity, Infinity];
  const hi = [-Infinity, -Infinity];
  for (const p of pieces)
    for (const [k, i] of [
      [0, 0],
      [1, 2],
    ] as const) {
      lo[k] = Math.min(lo[k]!, world(v, p, i) - pieceExtent(p)[i]!);
      hi[k] = Math.max(hi[k]!, world(v, p, i) + pieceExtent(p)[i]!);
    }
  return [...lo, ...hi].map((x) => Math.round(x * 1e6) / 1e6);
};

describe('stop blade, pusher and diverter arm models (VIS-014)', () => {
  it('VIS-014 a stop blade is a steel blade on a cylinder under the belt, raised or lowered by its height, not its colour', () => {
    const [down, up] = [partModel(blade(0))!, partModel(blade(1))!];
    expect(slot(down, 'blade').role).toBe('steel');
    expect(slot(down, 'cylinder').role).toBe('housing');
    expect(slot(down, 'rod').role).toBe('steel');
    expect(down.filter((p) => p.slot.startsWith('bracket')).every((p) => p.role === 'frame' && p.shape.kind === 'extrusion')).toBe(true);
    // The blade rises by its height and the sink under the belt; the cylinder and its bracket stay where they are in the world.
    expect(world(blade(1), slot(up, 'blade'), 1) - world(blade(0), slot(down, 'blade'), 1)).toBeCloseTo(0.3 + BLADE.sink, 9);
    for (const s of ['cylinder', 'bracket']) expect(world(blade(1), slot(up, s), 1)).toBeCloseTo(world(blade(0), slot(down, s), 1), 9);
    // The rod shows the travel, and the cylinder sits under the belt surface.
    expect(pieceExtent(slot(up, 'rod'))[1] - pieceExtent(slot(down, 'rod'))[1]).toBeCloseTo((0.3 + BLADE.sink) / 2, 9);
    expect(world(blade(0), slot(down, 'cylinder'), 1)).toBeLessThan(SURFACE);
    expect(footprint(blade(1))).toEqual(footprint(blade(0)));
  });

  it('VIS-014 a pusher is a cylinder on a slotted stand with a plate at the rod end that moves by the whole stroke', () => {
    const [back, out] = [partModel(pusher(0))!, partModel(pusher(1))!];
    expect(slot(back, 'plate').role).toBe('painted');
    expect(slot(back, 'cylinder').role).toBe('housing');
    expect(slot(back, 'rod').role).toBe('steel');
    expect(back.some((p) => p.slot.startsWith('leg-') && p.shape.kind === 'extrusion' && p.role === 'frame')).toBe(true);
    // The plate moves the whole stroke in the world; the cylinder does not.
    expect(world(pusher(1), slot(out, 'plate'), 2) - world(pusher(0), slot(back, 'plate'), 2)).toBeCloseTo(PUSHER.stroke, 9);
    expect(world(pusher(1), slot(out, 'cylinder'), 2)).toBeCloseTo(world(pusher(0), slot(back, 'cylinder'), 2), 9);
    expect(pieceExtent(slot(out, 'rod'))[2] - pieceExtent(slot(back, 'rod'))[2]).toBeCloseTo(PUSHER.stroke / 2, 9);
    expect(pieceExtent(slot(back, 'plate'))).toEqual([0.2, 0.125, 0.025]);
    expect(footprint(pusher(0))).toEqual(footprint(pusher(1)));
  });

  it('VIS-014 a diverter arm is a painted arm with a rubber edge on a vertical shaft under a motor housing, turning about its end', () => {
    const pieces = partModel(arm(0))!;
    expect(slot(pieces, 'arm').role).toBe('painted');
    expect(slot(pieces, 'edge').role).toBe('rubber');
    expect(slot(pieces, 'shaft').role).toBe('steel');
    expect(slot(pieces, 'motor').role).toBe('housing');
    expect(world(arm(0), slot(pieces, 'motor'), 1)).toBeGreaterThan(SURFACE + 0.25); // the motor sits above the arm
    // The shaft stands on the arm's pivot (its end, the part position), and the arm ends there too.
    expect(slot(pieces, 'shaft').at[0]).toBeCloseTo(-ARM.length / 2, 9);
    expect(slot(pieces, 'arm').at[0] - pieceExtent(slot(pieces, 'arm'))[0]).toBeCloseTo(-ARM.length / 2, 9);
    // The pose turns the arm; the model is the same in every state, because everything but the arm is round about the shaft.
    expect(partModel(arm(1))).toEqual(pieces);
    expect(footprint(arm(1))).toEqual(footprint(arm(0)));
  });

  it('VIS-014 the three models draw in Low quality and High contrast as in any other state: no piece is hidden or below the floor', () => {
    for (const v of [blade(0), blade(1), pusher(0), pusher(1), arm(0), arm(1)])
      for (const p of partModel(v)!) {
        expect(p.visible).toBe(true);
        expect(world(v, p, 1) - pieceExtent(p)[1]).toBeGreaterThanOrEqual(-1e-9);
      }
  });
});

describe('the pusher takes its stroke from the scene (VIS-014)', () => {
  const scenePart = (strokeM: number): ScenePart => ({
    id: 'pusher',
    part: 'pusher',
    name: 'pusher',
    position: [0, SURFACE, 0],
    rotationYDeg: 0,
    config: { strokeM },
  });
  for (const stroke of [1, 0.8])
    it(`VIS-014 with strokeM ${stroke} the cylinder and stand stand still and the plate travels the stroke`, () => {
      const context = { travel: 0, scenePart: scenePart(stroke) };
      const [back, out] = [partModel(pusher(0, stroke), context)!, partModel(pusher(1, stroke), context)!];
      for (const p of back.filter((q) => q.slot !== 'plate' && q.slot !== 'rod')) {
        const q = slot(out, p.slot);
        expect(world(pusher(1, stroke), q, 2)).toBeCloseTo(world(pusher(0, stroke), p, 2), 9);
      }
      expect(world(pusher(1, stroke), slot(out, 'plate'), 2) - world(pusher(0, stroke), slot(back, 'plate'), 2)).toBeCloseTo(stroke, 9);
      expect(pieceExtent(slot(out, 'rod'))[2] - pieceExtent(slot(back, 'rod'))[2]).toBeCloseTo(stroke / 2, 9);
    });
});

// ---------------------------------------------------------------------------------------------------------------------
// Aligner, chute and remover
// ---------------------------------------------------------------------------------------------------------------------

/** The x/z half extents, in the part's frame, of all its pieces. */
const reach = (pieces: ReturnType<typeof partModel> & {}) => {
  const out = [0, 0];
  for (const p of pieces)
    for (const [k, i] of [
      [0, 0],
      [1, 2],
    ] as const)
      out[k] = Math.max(out[k]!, Math.abs(p.at[i]!) + pieceExtent(p)[i]!);
  return out;
};
const GUIDE = { height: 0.15, thickness: 0.05 };
/** The aligner as the plant core publishes it: its guides `f` closed from `width` apart to `gap` apart. */
const aligner = (f: number, width = 0.7, gap = 0.35, length = 0.4) =>
  view('aligner', [length, GUIDE.height, width + GUIDE.thickness * 2], [0, SURFACE + GUIDE.height / 2, 0], {
    fraction: f,
    gapM: width - (width - gap) * f,
    widthM: width,
    lengthM: length,
  });
/** The chute as the plant core publishes it: the plate tilted `tilt` degrees, descending towards +x, its top surface at `top`. */
const chute = (tilt = 20, length = 1, width = 0.6, top = 1) => {
  const t = (-tilt * Math.PI) / 360;
  const thick = 0.02;
  const tau = (-tilt * Math.PI) / 180;
  const v = view('chute', [length, thick, width], [(thick / 2) * Math.sin(tau), top - (thick / 2) * Math.cos(tau), 0], {
    tiltDeg: tilt,
    lengthM: length,
    widthM: width,
  });
  v.pose.q = [0, 0, Math.sin(t), Math.cos(t)];
  return v;
};
/** The remover: a volume of the declared size whose bottom is `lift` over the floor. */
const remover = (size: PartView['pose']['size'] = [0.6, 0.6, 0.6], lift = 0.1) =>
  view('remover', size, [0, lift + size[1] / 2, 0], { delivered: 0 });

describe('aligner, chute and remover models (VIS-014)', () => {
  it('VIS-014 an aligner is two slotted rails with a rubber strip on their inner faces, held on brackets from the belt sides', () => {
    const pieces = partModel(aligner(0))!;
    for (const s of ['a', 'b']) {
      expect(slot(pieces, `rail-${s}`).role).toBe('frame');
      expect(slot(pieces, `rail-${s}`).shape.kind).toBe('extrusion');
      expect(slot(pieces, `strip-${s}`).role).toBe('rubber');
    }
    const brackets = pieces.filter((p) => p.slot.startsWith('bracket'));
    expect(brackets.length).toBeGreaterThanOrEqual(2);
    expect(brackets.every((p) => p.role === 'frame' && p.shape.kind === 'extrusion')).toBe(true);
    // The strip is on the inner face: it lies between the rails.
    expect(Math.abs(slot(pieces, 'strip-a').at[2])).toBeLessThan(Math.abs(slot(pieces, 'rail-a').at[2]));
  });

  it('VIS-014 the aligner bounds are its declared size, and its rails close by (width - gap) / 2 each, brackets standing still', () => {
    const [open, shut] = [partModel(aligner(0))!, partModel(aligner(1))!];
    const [rx, rz] = reach(open);
    expect(rx).toBeCloseTo(0.2, 9);
    expect(rz).toBeCloseTo(0.35 + GUIDE.thickness, 9);
    for (const s of ['a', 'b']) {
      const moved = Math.abs(slot(open, `rail-${s}`).at[2]) - Math.abs(slot(shut, `rail-${s}`).at[2]);
      expect(moved).toBeCloseTo((0.7 - 0.35) / 2, 9);
      expect(Math.abs(slot(shut, `strip-${s}`).at[2]) - 0.006).toBeCloseTo(0.35 / 2, 9); // the strip face is the gap
    }
    for (const p of open.filter((q) => q.slot.startsWith('bracket'))) expect(slot(shut, p.slot).at).toEqual(p.at);
    expect(ALIGNER.strip).toBeGreaterThan(0);
  });

  it('VIS-014 a chute is a steel slide with two low side walls on a slotted stand with levelling feet, falling the way items move', () => {
    const v = chute();
    const pieces = partModel(v)!;
    expect(slot(pieces, 'slide').role).toBe('steel');
    expect(slot(pieces, 'wall-a').role).toBe('steel');
    expect(slot(pieces, 'wall-b').role).toBe('steel');
    expect(pieces.some((p) => p.slot.startsWith('leg-') && p.role === 'frame' && p.shape.kind === 'extrusion')).toBe(true);
    expect(pieces.some((p) => p.slot.startsWith('foot-') && p.role === 'rubber')).toBe(true);
    // The pose carries the incline: the +x end of the slide, where items go, is lower than its -x end in the world.
    const end = (sign: number) => v.pose.p[1] + rotate(v.pose.q, [sign * 0.5, 0, 0])[1];
    expect(end(1)).toBeLessThan(end(-1));
    expect(end(-1) - end(1)).toBeCloseTo(Math.sin((20 * Math.PI) / 180), 9);
    const walls = [slot(pieces, 'wall-a'), slot(pieces, 'wall-b')];
    expect(walls.every((w) => w.at[1] > slot(pieces, 'slide').at[1])).toBe(true); // the walls stand up from the surface
    // The slide, walls and rails stay in the declared box; the stand is upright in the world, so it hangs from the tilted slide.
    expect(reach(pieces.filter((p) => !p.q))).toEqual([0.5, 0.3].map((x) => expect.closeTo(x, 9)));
  });

  it('VIS-014 the chute stand stands upright in the world at any tilt: legs vertical, feet on the floor', () => {
    for (const tilt of [0, 20, 35]) {
      const v = chute(tilt, 1, 0.6, 1.2);
      const pieces = partModel(v)!;
      const stand = pieces.filter((p) => /^(leg|stem|foot)-/.test(p.slot));
      expect(stand.length).toBeGreaterThan(0);
      for (const p of stand) {
        const axis = rotate(v.pose.q, rotate(p.q ?? [0, 0, 0, 1], [0, 1, 0]));
        expect(axis[0]).toBeCloseTo(0, 9);
        expect(axis[1]).toBeCloseTo(1, 9);
        expect(axis[2]).toBeCloseTo(0, 9);
      }
      for (const p of stand.filter((q) => q.slot.startsWith('foot-'))) {
        const y = v.pose.p[1] + rotate(v.pose.q, p.at)[1];
        expect(y - LEVELLING_FOOT.padHeight / 2).toBeCloseTo(0, 9); // the pad is a vertical disc: its bottom is half its height down
      }
    }
  });

  it('VIS-014 a remover is an open-top bin of its declared size on four feet: painted walls, a housing floor', () => {
    const v = remover([0.8, 0.5, 0.6], 0.1);
    const pieces = partModel(v)!;
    const walls = pieces.filter((p) => p.slot.startsWith('wall-'));
    expect(walls.length).toBe(4);
    expect(walls.every((p) => p.role === 'painted')).toBe(true);
    expect(slot(pieces, 'floor').role).toBe('housing');
    expect(pieces.filter((p) => p.slot.startsWith('foot-')).length).toBe(4);
    expect(reach(pieces)).toEqual([0.4, 0.3].map((x) => expect.closeTo(x, 9)));
    // Open top: nothing covers the bin above the floor, and the feet reach the floor of the world.
    expect(Math.max(...pieces.map((p) => p.at[1] + pieceExtent(p)[1]))).toBeCloseTo(0.25, 9);
    expect(Math.min(...pieces.map((p) => world(v, p, 1) - pieceExtent(p)[1]))).toBeCloseTo(0, 9);
  });

  it('VIS-014 the aligner, chute and remover draw in Low quality and High contrast: every piece visible and above the floor', () => {
    for (const v of [aligner(0), aligner(1), remover()])
      for (const p of partModel(v)!) {
        expect(p.visible).toBe(true);
        expect(world(v, p, 1) - pieceExtent(p)[1]).toBeGreaterThanOrEqual(-1e-9);
      }
    // A chute's stand is drawn in the tilted frame: a foot centre stays over the floor of the world, give or take its pad radius.
    for (const v of [chute(), chute(35, 2, 1, 1.4)])
      for (const p of partModel(v)!) {
        expect(p.visible).toBe(true);
        if (p.slot.startsWith('foot-')) expect(v.pose.p[1] + rotate(v.pose.q, p.at)[1]).toBeGreaterThanOrEqual(-1e-9);
      }
  });
});
