/**
 * The conveyor models (plan-vis C1; VIS-014, VIS-016): the belt of belt-to-sensor, the chain transfer, turntable and lifts of the
 * reference scenes, and a roller and a curved conveyor in a line of their own, as the real plant core publishes them.
 */
import { describe, expect, it } from 'bun:test';
import type { PartView, PlantSceneFile, ScenePart } from '../../contracts';
import { createPlantCore } from '../../core/plantCore';
import beltScene from '../../../../plant-scenes/belt-to-sensor/scene.json';
import chainScene from '../../../../plant-scenes/height-sorting-chain/scene.json';
import liftScene from '../../../../plant-scenes/lift-stacking/scene.json';
import tableScene from '../../../../plant-scenes/height-sorting-turntable/scene.json';
import { levellingLeg, slotted, type Piece } from './shared';
import { BELT, CHAIN, CONVEYORS, CURVE, LIFT, ROLLER } from './conveyors';
import { modelBounds, partModel, pieceExtent } from './index';
import { beltToSensor, bottom, shown, slot, top } from './models.fixtures';

const plant = beltToSensor();

describe('conveyor models (VIS-014)', () => {
  it('PRT-009 the conveyor family draws the belt, roller conveyor, curved conveyor, chain transfer, turntable and lift', () => {
    expect(Object.keys(CONVEYORS)).toEqual(['belt', 'roller', 'curved', 'chain-transfer', 'turntable', 'lift']);
  });

  it('VIS-014 a belt has a band, two side frames, two end drums, and legs with feet and braces that stand on the floor', async () => {
    const belt = (await plant.views()).belt!;
    const pieces = partModel(belt)!;
    const floor = -belt.pose.p[1];
    expect(['band', 'rail-a', 'rail-b', 'drum-a', 'drum-b'].map((s) => slot(pieces, s).role)).toEqual([
      'band',
      'frame',
      'frame',
      'steel',
      'steel',
    ]);
    const legs = pieces.filter((p) => p.slot.startsWith('leg-'));
    expect(legs.length).toBe(6); // a 2.4 m belt: three pairs
    const feet = pieces.filter((p) => p.slot.startsWith('foot-'));
    expect(feet.length).toBe(legs.length);
    for (const foot of feet) expect(bottom(foot)).toBeCloseTo(floor, 9);
    expect(pieces.filter((p) => p.slot.startsWith('brace-')).length).toBe(legs.length / 2);
    // The top of the band is the conveying surface the physics uses.
    const band = slot(pieces, 'band');
    expect(band.at[1] + pieceExtent(band)[1]).toBeCloseTo(belt.pose.size[1] / 2, 9);
  });

  it('VIS-014 the band wraps a steel drum at each end, and the side frames stop at the drum axis so the end shows', async () => {
    const belt = (await plant.views()).belt!;
    const pieces = partModel(belt)!;
    const [length, thickness, width] = belt.pose.size;
    for (const end of ['a', 'b']) {
      const wrap = slot(pieces, `wrap-${end}`);
      const drum = slot(pieces, `drum-${end}`);
      expect(wrap.role).toBe('band');
      expect(wrap.at[1] + pieceExtent(wrap)[1]).toBeCloseTo(thickness / 2, 9); // the band runs over the top of the drum
      expect(Math.abs(wrap.at[0]) + pieceExtent(wrap)[0]).toBeCloseTo(length / 2, 9); // and round the end of the belt
      expect(pieceExtent(wrap)[2]).toBeCloseTo(width / 2, 9);
      expect(drum.at).toEqual(wrap.at); // one axis
      expect(pieceExtent(drum)[2]).toBeGreaterThan(width / 2); // the steel shows beside the band
      for (const rail of ['rail-a', 'rail-b']) expect(pieceExtent(slot(pieces, rail))[0]).toBeLessThanOrEqual(Math.abs(drum.at[0]) + 1e-9);
    }
    // A round end cap on each side of each end holds a drum.
    const caps = pieces.filter((p) => p.slot.startsWith('cap-'));
    expect(caps.length).toBe(4);
    for (const cap of caps) expect(Math.abs(cap.at[2])).toBeGreaterThan(width / 2);
  });

  it('VIS-014 the frame of a belt is slotted aluminium profile on levelling feet, in the boxes the plain frame filled', async () => {
    const belt = (await plant.views()).belt!;
    const pieces = partModel(belt)!;
    const [length, thickness] = belt.pose.size;
    const { rail, drum, leg } = BELT;
    const railBottom = thickness / 2 + rail.lip - rail.height;
    for (const s of ['rail-a', 'rail-b']) {
      const r = slot(pieces, s);
      expect(r.shape).toEqual(slotted(rail.width, rail.height, length - 2 * drum, 'x'));
      expect(r.role).toBe('frame');
      expect(pieceExtent(r)).toEqual([length / 2 - drum, rail.height / 2, rail.width / 2]); // the sensor bracket and the bounds hold
    }
    for (const k of [0, 1, 2])
      for (const side of ['a', 'b'] as const) {
        const legPieces = pieces.filter((p) => p.slot.endsWith(`-${k}-${side}`) && /^(leg|stem|foot)-/.test(p.slot));
        const at = slot(pieces, `leg-${k}-${side}`).at;
        expect(legPieces).toEqual(levellingLeg(`${k}-${side}`, at[0], at[2], railBottom, -belt.pose.p[1], leg));
      }
    for (const k of [0, 1, 2]) {
      const brace = slot(pieces, `brace-${k}`);
      expect(brace.shape.kind).toBe('extrusion');
      expect(brace.role).toBe('frame');
    }
    // The model fills the box the pilot's belt filled (the feet 0.04 m out from the rail's centre line), so the first view of every
    // scene stays as it was (VIS-002).
    const railZ = belt.pose.size[2] / 2 + rail.width / 2;
    const bounds = modelBounds(belt)!;
    const ends = length / 2 + 0.008; // the end caps, 8 mm wider than the drums
    const expected = [-ends, ends, -belt.pose.p[1], -railZ - 0.04, railZ + 0.04];
    [bounds.min[0], bounds.max[0], bounds.min[1], bounds.min[2], bounds.max[2]].forEach((v, i) => expect(v).toBeCloseTo(expected[i]!, 9));
  });

  it('VIS-014 a belt close to the floor has no legs', async () => {
    const belt = (await plant.views()).belt!;
    const low = { ...belt, pose: { ...belt.pose, p: [0, 0.08, 0] as const } };
    expect(partModel(low)!.some((p) => p.slot.startsWith('leg-'))).toBe(false);
  });

  it('VIS-016 a stopped belt shows no direction mark; a running one shows marks that point its way and travel with the band', async () => {
    const belt = (await plant.views()).belt!;
    expect(shown(partModel(belt)!, 'mark-')).toEqual([]);
    const running = { ...belt, state: { ...belt.state, speedMps: 0.5 } };
    const at0 = shown(partModel(running, { travel: 0 })!, 'mark-');
    const at1 = shown(partModel(running, { travel: 0.1 })!, 'mark-');
    expect(at0.length).toBeGreaterThan(4);
    expect(at0.every((m) => m.yaw === Math.PI / 2)).toBe(true);
    const x = (marks: Piece[], s: string) => marks.find((m) => m.slot === s)?.at[0];
    expect(x(at1, 'mark-3')! - x(at0, 'mark-3')!).toBeCloseTo(0.1, 9);
    // Each mark stays on the band, wrapping round at the end.
    const length = belt.pose.size[0];
    for (const travel of [0, 0.7, 5.3, -2])
      for (const m of shown(partModel(running, { travel })!, 'mark-'))
        expect(Math.abs(m.at[0]) + BELT.markRadius).toBeLessThanOrEqual(length / 2 + 1e-9);
    const back = { ...belt, state: { ...belt.state, speedMps: -0.5 } };
    expect(shown(partModel(back)!, 'mark-').every((m) => m.yaw === -Math.PI / 2)).toBe(true);
  });
});

/** A part view as the real plant core publishes it after `commands` held for `ms`. */
async function viewOf(scene: unknown, id: string, commands: Record<string, boolean> = {}, ms = 0): Promise<PartView> {
  const core = await createPlantCore(scene as PlantSceneFile);
  try {
    core.apply(commands);
    if (ms > 0) core.advance(ms);
    return core.snapshot().parts.find((p) => p.id === id)!;
  } finally {
    core.dispose();
  }
}

const scenePart = (id: string, part: string, config: ScenePart['config'] = {}): ScenePart => ({
  id,
  part,
  name: id[0]!.toUpperCase() + id.slice(1),
  position: [0, 0.5, 0],
  rotationYDeg: 0,
  config,
});
/** A roller conveyor and a curved one: no reference scene uses them. */
const lineScene = {
  ...beltScene,
  parts: [scenePart('roller', 'roller', { length: 2, width: 0.6 }), scenePart('arc', 'curved', { radius: 1, width: 0.6 })],
};
/** The world height of a piece of a part view. */
const worldY = (view: PartView, p: Piece) => view.pose.p[1] + p.at[1];
const feetOnFloor = (view: PartView, pieces: readonly Piece[]) => {
  const feet = pieces.filter((p) => p.slot.startsWith('foot-'));
  expect(feet.length).toBeGreaterThanOrEqual(4);
  for (const foot of feet) expect(bottom(foot)).toBeCloseTo(-view.pose.p[1], 9);
};
const running = (view: PartView, speedMps = 0.5): PartView => ({ ...view, state: { ...view.state, speedMps } });

describe('roller conveyor model (VIS-014, VIS-016)', () => {
  it('VIS-014 a roller conveyor is steel rollers standing proud of two slotted side frames, on levelling legs', async () => {
    const view = await viewOf(lineScene, 'roller');
    const pieces = partModel(view)!;
    const [length, thickness, width] = view.pose.size;
    const rollers = pieces.filter((p) => p.slot.startsWith('roller-'));
    expect(rollers.length).toBe(Math.round(length / ROLLER.pitch));
    for (const r of rollers) {
      expect(r.role).toBe('steel');
      expect(r.shape).toEqual({ kind: 'cylinder', radius: ROLLER.radius, length: width, axis: 'z' });
      expect(top(r)).toBeCloseTo(thickness / 2, 9); // the tops of the rollers are the conveying surface
      expect(Math.abs(r.at[0]) + ROLLER.radius).toBeLessThanOrEqual(length / 2 + 1e-9);
    }
    for (const s of ['rail-a', 'rail-b']) {
      const rail = slot(pieces, s);
      expect(rail.role).toBe('frame');
      expect(rail.shape).toEqual(slotted(ROLLER.rail.width, ROLLER.rail.height, length, 'x'));
      expect(top(rail)).toBeLessThan(thickness / 2 - 0.005);
      expect(Math.abs(rail.at[2])).toBeCloseTo(width / 2 + ROLLER.rail.width / 2, 9);
    }
    feetOnFloor(view, pieces);
    const bounds = modelBounds(view)!;
    expect([bounds.min[0], bounds.max[0]]).toEqual([-length / 2, length / 2]);
    expect(bounds.max[1]).toBeCloseTo(thickness / 2, 9);
  });

  it('VIS-016 a stopped roller conveyor shows no direction mark; a running one shows marks that point its way and travel', async () => {
    const view = await viewOf(lineScene, 'roller');
    expect(shown(partModel(view)!, 'mark-')).toEqual([]);
    const at0 = shown(partModel(running(view), { travel: 0 })!, 'mark-');
    const at1 = shown(partModel(running(view), { travel: 0.1 })!, 'mark-');
    expect(at0.length).toBeGreaterThanOrEqual(5);
    expect(at0.every((m) => m.yaw === Math.PI / 2 && m.at[1] > view.pose.size[1] / 2)).toBe(true);
    const x = (marks: Piece[], s: string) => marks.find((m) => m.slot === s)!.at[0];
    expect(x(at1, 'mark-2') - x(at0, 'mark-2')).toBeCloseTo(0.1, 9);
    expect(shown(partModel(running(view, -0.5))!, 'mark-').every((m) => m.yaw === -Math.PI / 2)).toBe(true);
  });

  it("VIS-016 a running roller conveyor shows marks bigger than a belt's, so the change reads from the scene's first view", async () => {
    const view = await viewOf(lineScene, 'roller');
    const marks = shown(partModel(running(view))!, 'mark-');
    expect(marks.length).toBeGreaterThanOrEqual(5);
    for (const m of marks) expect(m.shape).toMatchObject({ radius: ROLLER.mark.radius });
    expect(ROLLER.mark.radius).toBeGreaterThanOrEqual(1.5 * BELT.markRadius);
  });
});

describe('curved conveyor model (VIS-014, VIS-016)', () => {
  it('VIS-014 a curved conveyor is a quarter-turn band of the published radii between curved side frames, on levelling legs', async () => {
    const view = await viewOf(lineScene, 'arc');
    const pieces = partModel(view)!;
    const width = view.pose.size[0];
    const outer = view.state.radius as number;
    const inner = outer - width;
    // The band: the published annulus over the quarter turn x >= 0, z <= 0 about the view's origin, its top the conveying surface.
    const band = slot(pieces, 'band');
    expect(band.role).toBe('band');
    if (band.shape.kind !== 'extrusion') throw new Error('the band is not an extrusion');
    expect(band.shape.axis).toBe('y');
    expect(top(band)).toBeCloseTo(view.pose.size[1] / 2, 9);
    const radii = band.shape.section.map(([a, b]) => Math.hypot(band.at[0] + a, band.at[2] + b));
    expect(Math.min(...radii)).toBeCloseTo(inner, 6);
    expect(Math.max(...radii)).toBeCloseTo(outer, 6);
    for (const [a, b] of band.shape.section) {
      expect(band.at[0] + a).toBeGreaterThanOrEqual(-1e-9);
      expect(band.at[2] + b).toBeLessThanOrEqual(1e-9);
    }
    // Side frames: slotted profile in straight lengths along the inner and the outer edge.
    const rails = pieces.filter((p) => p.slot.startsWith('rail-'));
    expect(rails.length).toBe(2 * CURVE.railSegments);
    for (const r of rails) {
      expect(r.role).toBe('frame');
      const radius = Math.hypot(r.at[0], r.at[2]);
      const edge = r.slot.startsWith('rail-in') ? inner - BELT.rail.width / 2 : outer + BELT.rail.width / 2;
      expect(Math.abs(radius - edge)).toBeLessThan(0.01);
    }
    feetOnFloor(view, pieces);
    const bounds = modelBounds(view)!;
    // The quarter turn's own square, with the margin the turned pieces take (their extents are measured as if they could turn).
    expect(bounds.min[0]).toBeGreaterThan(-0.2);
    expect(bounds.max[0]).toBeLessThan(outer + 0.2);
    expect(bounds.min[2]).toBeGreaterThan(-outer - 0.2);
    expect(bounds.max[2]).toBeLessThan(0.2);
  });

  it('VIS-016 a running curved conveyor shows marks along its centreline that point along the arc and travel round it', async () => {
    const view = await viewOf(lineScene, 'arc');
    expect(shown(partModel(view)!, 'mark-')).toEqual([]);
    const centre = (view.state.radius as number) - view.pose.size[0] / 2;
    const at0 = shown(partModel(running(view), { travel: 0 })!, 'mark-');
    const at1 = shown(partModel(running(view), { travel: 0.1 })!, 'mark-');
    expect(at0.length).toBeGreaterThanOrEqual(4);
    for (const m of at0) {
      expect(Math.hypot(m.at[0], m.at[2])).toBeCloseTo(centre, 9);
      // The arrow's tip, (sin yaw, cos yaw), is along the arc: square to the radius.
      expect(m.at[0] * Math.sin(m.yaw) + m.at[2] * Math.cos(m.yaw)).toBeCloseTo(0, 9);
    }
    // Forward runs from the 'in' end (on -z) to the 'out' end (on +x) of a right-hand curve: x grows, and the tip leads.
    const a = at0.find((m) => m.slot === 'mark-1')!;
    const b = at1.find((m) => m.slot === 'mark-1')!;
    expect(Math.hypot(b.at[0] - a.at[0], b.at[2] - a.at[2])).toBeCloseTo(0.1, 2);
    expect(b.at[0]).toBeGreaterThan(a.at[0]);
    expect((b.at[0] - a.at[0]) * Math.sin(a.yaw) + (b.at[2] - a.at[2]) * Math.cos(a.yaw)).toBeGreaterThan(0);
  });
});

describe('chain transfer model (VIS-014, VIS-016)', () => {
  it('VIS-014 a chain transfer is a roller bed with dark chain strands, in a slotted frame on levelling legs', async () => {
    const view = await viewOf(chainScene, 'chain');
    expect(view.state.text).toBe('lowered');
    const pieces = partModel(view)!;
    const [length, thickness, width] = view.pose.size;
    const rollers = pieces.filter((p) => p.slot.startsWith('roller-'));
    const strands = pieces.filter((p) => p.slot.startsWith('strand-'));
    expect(rollers.length).toBe(Math.round(length / CHAIN.pitch));
    expect(strands.length).toBeGreaterThanOrEqual(3);
    for (const r of rollers) expect(top(r)).toBeCloseTo(thickness / 2, 9);
    for (const s of strands) {
      expect(s.role).toBe('rubber');
      expect(pieceExtent(s)[2]).toBeCloseTo(width / 2, 9); // across the module, the way they carry
      expect(top(s)).toBeLessThan(thickness / 2); // lowered: under the tops of the rollers
      for (const r of rollers) expect(Math.abs(s.at[0] - r.at[0])).toBeGreaterThan(pieceExtent(s)[0] + CHAIN.radius); // in a gap
    }
    for (const s of ['rail-a', 'rail-b']) expect(top(slot(pieces, s))).toBeLessThan(thickness / 2); // items pass over, either way
    feetOnFloor(view, pieces);
    const bounds = modelBounds(view)!;
    expect([bounds.min[0], bounds.max[0]]).toEqual([-length / 2, length / 2]);
  });

  it('VIS-016 a raised chain transfer lifts its strands above the rollers, while the rollers, frame and legs stay in place', async () => {
    const lowered = await viewOf(chainScene, 'chain');
    const raised = await viewOf(chainScene, 'chain', { 'Chain1.lift': true }, 600);
    expect(raised.state.text).toBe('raised');
    const [a, b] = [partModel(lowered)!, partModel(raised)!];
    const surface = raised.pose.size[1] / 2;
    for (const s of b.filter((p) => p.slot.startsWith('strand-'))) expect(top(s)).toBeCloseTo(surface, 9);
    for (const r of b.filter((p) => p.slot.startsWith('roller-'))) expect(top(r)).toBeCloseTo(surface - CHAIN.lift, 9);
    for (const fixed of ['roller-0', 'rail-a', 'rail-b', 'leg-0-a', 'foot-1-b'])
      expect(worldY(raised, slot(b, fixed))).toBeCloseTo(worldY(lowered, slot(a, fixed)), 9);
    const lift = (s: string) => worldY(raised, slot(b, s)) - worldY(lowered, slot(a, s));
    expect(lift('strand-0')).toBeCloseTo(CHAIN.lift + CHAIN.sink, 9);
  });

  it('VIS-016 a running chain transfer shows marks along its rollers lowered, and across along its strands raised', async () => {
    const lowered = await viewOf(chainScene, 'chain', { 'Chain1.run': true }, 600);
    const along = shown(partModel(lowered)!, 'mark-');
    expect(along.length).toBeGreaterThanOrEqual(2);
    expect(along.every((m) => m.yaw === Math.PI / 2 && m.at[2] === 0)).toBe(true);
    expect(shown(partModel({ ...lowered, state: { ...lowered.state, speedMps: 0 } })!, 'mark-')).toEqual([]);
    const raised = await viewOf(chainScene, 'chain', { 'Chain1.lift': true, 'Chain1.moveRight': true }, 1500);
    expect(raised.state.axis).toBe('z');
    expect(raised.state.speedMps).toBeGreaterThan(0);
    const across = shown(partModel(raised)!, 'mark-');
    expect(across.length).toBeGreaterThanOrEqual(2);
    expect(across.every((m) => m.yaw === 0 && m.at[0] === 0)).toBe(true);
  });
});

describe('turntable model (VIS-014, VIS-016)', () => {
  it('VIS-014 a turntable is a roller deck on a slewing ring over a fixed base frame on levelling legs, inside its square', async () => {
    const view = await viewOf(tableScene, 'table');
    const pieces = partModel(view)!;
    const [size, thickness] = view.pose.size;
    const rollers = pieces.filter((p) => p.slot.startsWith('roller-'));
    expect(rollers.length).toBeGreaterThanOrEqual(5);
    for (const r of rollers) {
      expect(top(r)).toBeCloseTo(thickness / 2, 9);
      expect(r.shape.kind === 'cylinder' && r.shape.axis).toBe('z');
    }
    expect(slot(pieces, 'ring').role).toBe('steel');
    feetOnFloor(view, pieces);
    const bounds = modelBounds(view)!;
    [bounds.min[0], bounds.max[0], bounds.min[2], bounds.max[2]].forEach((v, i) =>
      expect(v).toBeCloseTo([-1, 1, -1, 1][i]! * (size / 2), 9),
    );
  });

  it('VIS-016 a turned turntable turns its rollers with the platform, while its base frame and legs stay in place', async () => {
    const centre = await viewOf(tableScene, 'table');
    const right = await viewOf(tableScene, 'table', { 'Table1.toRight': true }, 2000);
    expect(right.state.text).toBe('right');
    const [a, b] = [partModel(centre)!, partModel(right)!];
    /** A piece's centre and yaw in the scene: the platform's pose turns about +y. */
    const world = (view: PartView, p: Piece) => {
      const yaw = 2 * Math.atan2(view.pose.q[1], view.pose.q[3]);
      const [x, z] = [p.at[0], p.at[2]];
      return [x * Math.cos(yaw) + z * Math.sin(yaw), -x * Math.sin(yaw) + z * Math.cos(yaw), yaw + p.yaw];
    };
    const same = (s: string) => world(right, slot(b, s)).forEach((v, i) => expect(v).toBeCloseTo(world(centre, slot(a, s))[i]!, 6));
    for (const s of ['frame-a', 'frame-b', 'leg-0', 'foot-3', 'leg-2']) same(s);
    // The rollers turned a quarter turn with the platform (they lie across the scene's x now, not along z).
    const turned = world(right, slot(b, 'roller-0'))[2]! - world(centre, slot(a, 'roller-0'))[2]!;
    expect(Math.abs(turned)).toBeCloseTo(Math.PI / 2, 2);
  });

  it('VIS-016 a turntable carries one arrow along its rollers, so the turned platform shows its quarter turn', async () => {
    const centre = await viewOf(tableScene, 'table');
    const right = await viewOf(tableScene, 'table', { 'Table1.toRight': true }, 2000);
    const yawOf = (view: PartView) => 2 * Math.atan2(view.pose.q[1], view.pose.q[3]) + slot(partModel(view)!, 'arrow').yaw;
    expect(slot(partModel(centre)!, 'arrow').role).toBe('mark');
    expect(Math.abs(yawOf(right) - yawOf(centre))).toBeCloseTo(Math.PI / 2, 2);
  });

  it('VIS-016 a stopped turntable shows no direction mark; a running one shows marks along its platform', async () => {
    const view = await viewOf(tableScene, 'table');
    expect(shown(partModel(view)!, 'mark-')).toEqual([]);
    const marks = shown(partModel(running(view))!, 'mark-');
    expect(marks.length).toBeGreaterThanOrEqual(2);
    expect(marks.every((m) => m.yaw === Math.PI / 2 && m.at[2] === 0)).toBe(true);
  });
});

describe('lift model (VIS-014, VIS-016)', () => {
  it('VIS-014 a lift is a belt platform carried between four posts on levelling feet that reach above its top level', async () => {
    const view = await viewOf(liftScene, 'lift');
    const pieces = partModel(view)!;
    const [length, thickness, width] = view.pose.size;
    expect(['band', 'rail-a', 'rail-b', 'drum-a', 'drum-b'].map((s) => slot(pieces, s).role)).toEqual([
      'band',
      'frame',
      'frame',
      'steel',
      'steel',
    ]);
    expect(top(slot(pieces, 'band'))).toBeCloseTo(thickness / 2, 9);
    const posts = pieces.filter((p) => p.slot.startsWith('leg-post'));
    expect(posts.length).toBe(4);
    const stroke = view.state.strokeM as number;
    for (const post of posts) {
      expect(top(post)).toBeGreaterThan(thickness / 2 + stroke); // above the platform at the top level
      expect(Math.abs(post.at[2])).toBeGreaterThan(width / 2 + BELT.rail.width); // beside the platform, not in its way
      expect(Math.abs(post.at[0])).toBeLessThan(length / 2);
    }
    feetOnFloor(view, pieces);
    const bounds = modelBounds(view)!;
    expect(bounds.max[2]).toBeLessThan(width / 2 + LIFT.post + 0.1);
  });

  it('VIS-016 a lift at its upper level draws the platform one pitch higher, and its posts stay where they stand', async () => {
    const low = await viewOf(liftScene, 'lift');
    const high = await viewOf(liftScene, 'lift', { 'Lift1.up': true }, 3000);
    expect(high.state.text).toBe('level 2');
    const [a, b] = [partModel(low)!, partModel(high)!];
    expect(worldY(high, slot(b, 'band')) - worldY(low, slot(a, 'band'))).toBeCloseTo(high.state.levelPitchM as number, 6);
    for (const fixed of ['leg-post-0', 'foot-post-3', 'beam-a', 'motor'])
      expect(worldY(high, slot(b, fixed))).toBeCloseTo(worldY(low, slot(a, fixed)), 9);
    // The box that holds the lift does not change as it travels: its posts hold every level.
    const box = (v: PartView) => {
      const m = modelBounds(v)!;
      return [m.min[1] + v.pose.p[1], m.max[1] + v.pose.p[1]];
    };
    box(high).forEach((v, i) => expect(v).toBeCloseTo(box(low)[i]!, 9));
  });

  it('VIS-016 a stopped lift shows no direction mark; a running one shows marks on its platform that point its way', async () => {
    const view = await viewOf(liftScene, 'lift');
    expect(shown(partModel(view)!, 'mark-')).toEqual([]);
    const marks = shown(partModel(running(view))!, 'mark-');
    expect(marks.length).toBeGreaterThanOrEqual(3);
    expect(marks.every((m) => m.yaw === Math.PI / 2)).toBe(true);
  });
});
