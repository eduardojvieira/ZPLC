/**
 * The operator panel models (plan-vis C4; VIS-014, VIS-016): the push button of belt-to-sensor and the panel parts of the shipped
 * scenes (and a selector switch, which no scene uses yet) as the real plant core publishes them.
 */
import { afterEach, describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PartView, PlantCore, PlantSceneFile } from '../../contracts';
import { controlStation } from '../controlStations';
import { createPlantCore } from '../../core/plantCore';
import { cameraPosition, firstViewCamera, fitCamera } from '../camera';
import { snapshotBounds } from '../geometry';
import { modelBounds, partModel, pieceExtent, rotate } from './index';
import { rasterize, worldBoxes } from './raster.fixtures';
import { beltToSensor, bottom, slot, top } from './models.fixtures';
import { EMERGENCY_STOP, isStand, OPERATOR, POTENTIOMETER, PUSH_BUTTON } from './operator';

const plant = beltToSensor();

const cores: PlantCore[] = [];
afterEach(() => cores.splice(0).forEach((core) => core.dispose()));
/** A fresh plant core of `scene`, disposed after the test. */
async function coreOf(scene: PlantSceneFile): Promise<PlantCore> {
  const core = await createPlantCore(scene);
  cores.push(core);
  return core;
}
const viewOf = (core: PlantCore, id: string): PartView => core.snapshot().parts.find((p) => p.id === id)!;
/** A scene of one panel part at `y`, as the editor would place it. */
const lone = (part: string, config: Record<string, number | string> = {}, y = 0.5): PlantSceneFile => ({
  schemaVersion: 1,
  name: 'panel',
  parts: [{ id: 'it', part, name: 'It', position: [0, y, 0], rotationYDeg: 0, config }],
  cameras: [],
});
const twice = (pieces: readonly { at: unknown; shape: unknown; yaw: number }[]) => {
  const keys = pieces.map((p) => JSON.stringify([p.at, p.shape, p.yaw]));
  return keys.filter((k, i) => keys.indexOf(k) !== i);
};
const deg = (rad: number) => (rad * 180) / Math.PI;

describe('operator panel models (VIS-014)', () => {
  it('PRT-009 the operator panel family draws the seven operator parts', () => {
    expect(Object.keys(OPERATOR)).toEqual([
      'push-button',
      'selector-switch',
      'emergency-stop',
      'indicator-light',
      'stack-light',
      'potentiometer',
      'numeric-display',
    ]);
  });

  it('VIS-016 the head of a pressed push button travels into its collar', async () => {
    const v = await plant.views();
    const head = (view: PartView) => slot(partModel(view)!, 'head');
    const released = head(v.start!);
    const core = plant.core();
    core.operate('StartButton.pressed', true);
    core.advance(5);
    const pressed = head(core.snapshot().parts.find((p) => p.id === 'start')!);
    expect(released.at[1] - pressed.at[1]).toBeCloseTo(PUSH_BUTTON.released - PUSH_BUTTON.pressed, 9);
    expect(released.at[1] - pressed.at[1]).toBeGreaterThanOrEqual(0.015);
  });

  it('VIS-014 the push button is a control box on a stand: a square column on a base plate bolted to the floor', async () => {
    const start = (await plant.views()).start!;
    const pieces = partModel(start)!;
    const floor = -start.pose.p[1];
    const post = slot(pieces, 'stand-post');
    const base = slot(pieces, 'stand-base');
    expect(post.shape.kind).toBe('box');
    expect(pieceExtent(post)[0]).toBeCloseTo(pieceExtent(post)[2], 9);
    expect(bottom(base)).toBeCloseTo(floor, 9);
    expect(bottom(post)).toBeCloseTo(top(base), 9);
    expect(top(post)).toBeCloseTo(bottom(slot(pieces, 'enclosure')), 9);
    const bolts = pieces.filter((p) => p.slot.startsWith('stand-bolt-'));
    expect(bolts.length).toBe(4);
    for (const b of bolts) expect(bottom(b)).toBeCloseTo(top(base), 9);
    // The stand is the post, the plate and the bolts, nothing of the control itself.
    expect(pieces.filter((p) => isStand(p.slot)).map((p) => p.slot)).toEqual([
      'stand-post',
      'stand-base',
      ...[0, 1, 2, 3].map((k) => `stand-bolt-${k}`),
    ]);
  });

  it('VIS-016 the lever of a selector switch points at the selected position, a quarter turn from end to end', async () => {
    const core = await coreOf(lone('selector-switch', { positions: 3 }));
    const lever = () => slot(partModel(viewOf(core, 'it'))!, 'lever');
    expect(deg(lever().yaw)).toBeCloseTo(45, 9); // position 0: to the left of an operator in front of the box (+z)
    core.operate('It.pos1', true);
    core.advance(5);
    expect(deg(lever().yaw)).toBeCloseTo(0, 9); // straight ahead
    core.operate('It.pos2', true);
    core.advance(5);
    expect(deg(lever().yaw)).toBeCloseTo(-45, 9);
    // The lever stands up from its knob, so it reads from the low first view of a scene, not only from above.
    expect(pieceExtent(lever())[1] * 2).toBeGreaterThanOrEqual(0.035);
  });

  it('VIS-014 a selector switch has one white mark per position around its knob, in the direction of that position', async () => {
    for (const positions of [2, 3, 4]) {
      const pieces = partModel(viewOf(await coreOf(lone('selector-switch', { positions })), 'it'))!;
      const marks = pieces.filter((p) => p.slot.startsWith('detent-'));
      expect(marks.map((m) => m.role)).toEqual(Array(positions).fill('mark'));
      const yaws = marks.map((m) => deg(m.yaw));
      expect(yaws[0]).toBeCloseTo(45, 9);
      expect(yaws.at(-1)!).toBeCloseTo(-45, 9);
      for (const m of marks) expect(Math.atan2(-m.at[0], -m.at[2])).toBeCloseTo(m.yaw, 9);
    }
  });

  it('VIS-016 the emergency stop is modelled; latched, its mushroom head sits lower by its travel, not only another colour', async () => {
    expect(Object.keys(OPERATOR)).toContain('emergency-stop');
    const core = await coreOf(lone('emergency-stop'));
    const pieces = () => partModel(viewOf(core, 'it'))!;
    const up = slot(pieces(), 'head');
    const upBounds = modelBounds(viewOf(core, 'it'))!;
    core.operate('It.pressed', true);
    core.advance(5);
    const down = slot(pieces(), 'head');
    expect(up.at[1] - down.at[1]).toBeCloseTo(EMERGENCY_STOP.travel, 9);
    expect(up.role).toBe(down.role);
    // The footprint of the model does not change with the state.
    const downBounds = modelBounds(viewOf(core, 'it'))!;
    for (const i of [0, 2]) {
      expect(downBounds.min[i]!).toBeCloseTo(upBounds.min[i]!, 9);
      expect(downBounds.max[i]!).toBeCloseTo(upBounds.max[i]!, 9);
    }
  });

  it('VIS-016 a lit indicator light adds a halo behind its lens and lights the lens; unlit it has neither', async () => {
    expect(Object.keys(OPERATOR)).toContain('indicator-light');
    const core = await coreOf(lone('indicator-light'));
    const pieces = () => partModel(viewOf(core, 'it'))!;
    const unlit = pieces();
    expect(unlit.some((p) => p.slot === 'halo')).toBe(false);
    expect(slot(unlit, 'lens').role).toBe('lampOff');
    core.apply({ 'It.lit': true });
    core.advance(5);
    const lit = pieces();
    expect(lit.length).toBe(unlit.length + 1);
    expect(slot(lit, 'halo').role).toBe('lamp');
    expect(slot(lit, 'lens').role).toBe('lamp');
    expect(pieceExtent(slot(lit, 'halo'))[0]).toBeGreaterThan(pieceExtent(slot(lit, 'lens'))[0]);
    expect(twice(lit)).toEqual([]);
  });

  it('VIS-016 a lit stack light segment lights up and grows; one segment per signal, red on top, green at the bottom', async () => {
    const core = await coreOf(lone('stack-light'));
    const pieces = () => partModel(viewOf(core, 'it'))!;
    const off = pieces();
    const segs = ['red', 'amber', 'green'].map((c) => slot(off, `segment-${c}`));
    // Each segment keeps its own colour, lit or not: a dim cover when off, a coloured light when on.
    expect(segs.map((p) => p.role)).toEqual(['signalRedOff', 'signalAmberOff', 'signalGreenOff']);
    expect(segs[0]!.at[1]).toBeGreaterThan(segs[1]!.at[1]);
    expect(segs[1]!.at[1]).toBeGreaterThan(segs[2]!.at[1]);
    const bounds = modelBounds(viewOf(core, 'it'))!;
    for (const c of ['red', 'amber', 'green']) {
      core.apply({ [`It.${c}`]: true });
      core.advance(5);
      const lit = slot(pieces(), `segment-${c}`);
      expect(String(lit.role)).toBe(`signal${c[0]!.toUpperCase()}${c.slice(1)}`);
      expect(pieceExtent(lit)[0]).toBeGreaterThan(pieceExtent(slot(off, `segment-${c}`))[0]);
      const b = modelBounds(viewOf(core, 'it'))!;
      for (const i of [0, 2]) {
        expect(b.min[i]!).toBeCloseTo(bounds.min[i]!, 9);
        expect(b.max[i]!).toBeCloseTo(bounds.max[i]!, 9);
      }
      core.apply({ [`It.${c}`]: false });
      core.advance(5);
    }
  });

  it('VIS-016 the pointer of a potentiometer turns from -135 degrees at the minimum to +135 at the maximum', async () => {
    const core = await coreOf(lone('potentiometer', { min: 0, max: 100 }));
    const pointer = () => slot(partModel(viewOf(core, 'it'))!, 'pointer');
    expect(pointer().role).toBe('mark');
    for (const [value, angle] of [
      [0, -135],
      [50, 0],
      [100, 135],
    ] as const) {
      core.operate('It.value', value);
      core.advance(5);
      expect(deg(pointer().yaw)).toBeCloseTo(angle, 9);
    }
  });

  it('VIS-016 a potentiometer is a black rotary knob with a white pointer and a printed scale of three ticks', async () => {
    const core = await coreOf(lone('potentiometer', { min: 0, max: 100 }));
    const at = (value: number) => {
      core.operate('It.value', value);
      core.advance(5);
      return partModel(viewOf(core, 'it'))!;
    };
    const [low, high] = [at(0), at(100)];
    expect(slot(low, 'knob').role).toBe('rubber');
    expect(Math.abs(deg(slot(high, 'pointer').yaw - slot(low, 'pointer').yaw))).toBeGreaterThanOrEqual(180);
    const ticks = low.filter((p) => p.slot.startsWith('tick-'));
    expect(ticks.map((p) => Math.round(deg(p.yaw))).sort((a, b) => a - b)).toEqual([-135, 0, 135]);
    expect(ticks.every((p) => p.role === 'mark')).toBe(true);
  });

  it(
    'VIS-014 a potentiometer has a dark dial plate, asymmetric 270-degree scale, tall overhanging pointer wing, and front meter ' +
      'window',
    async () => {
      const core = await coreOf(lone('potentiometer', { min: 0, max: 100 }));
      const pieces = partModel(viewOf(core, 'it'))!;
      const dial = slot(pieces, 'dial-plate');
      expect(dial).toBeDefined();
      expect(dial.role).toBe('lens');
      expect(pieceExtent(dial)[0]).toBeGreaterThanOrEqual(0.05);

      // Asymmetric 270-degree scale: intermediate radial marks plus a distinct max-end accent.
      const scaleMarks = pieces.filter((p) => p.slot.startsWith('scale-'));
      expect(scaleMarks.length).toBeGreaterThanOrEqual(7);
      const scaleMax = slot(pieces, 'scale-max');
      expect(scaleMax).toBeDefined();
      expect(scaleMax.role).toBe('safety');
      expect(Math.round(deg(scaleMax.yaw))).toBe(135);

      // Tall pointer wing extending past the knob radius with an overhanging pointer tip.
      const pointer = slot(pieces, 'pointer');
      expect(2 * pieceExtent(pointer)[1]).toBeGreaterThanOrEqual(0.012);
      const pointerTip = slot(pieces, 'pointer-tip');
      expect(pointerTip).toBeDefined();
      expect(pointerTip.role).toBe('mark');
      expect(Math.hypot(pointerTip.at[0], pointerTip.at[2])).toBeGreaterThan(POTENTIOMETER.radius);

      // Prominent front meter window with 6 bargraph segments on the +z face.
      const win = slot(pieces, 'meter-window');
      expect(win).toBeDefined();
      expect(win.role).toBe('lens');
      expect(2 * pieceExtent(win)[0]).toBeGreaterThanOrEqual(0.1);
      expect(2 * pieceExtent(win)[1]).toBeGreaterThanOrEqual(0.05);
      expect(win.at[2]).toBeGreaterThan(0.05);
      const bars = pieces.filter((p) => p.slot.startsWith('bar-'));
      expect(bars.length).toBe(6);
    },
  );

  it('VIS-016 the potentiometer front bargraph and overhanging pointer unmistakably distinguish min, half and max', async () => {
    const core = await coreOf(lone('potentiometer', { min: 0, max: 100 }));
    const at = (value: number) => {
      core.operate('It.value', value);
      core.advance(5);
      return partModel(viewOf(core, 'it'))!;
    };
    const [min, half, max] = [at(0), at(50), at(100)];
    const litBars = (pieces: ReturnType<typeof at>) => pieces.filter((p) => p.slot.startsWith('bar-') && p.role === 'lamp');
    const offBars = (pieces: ReturnType<typeof at>) => pieces.filter((p) => p.slot.startsWith('bar-') && p.role === 'lampOff');
    expect(litBars(min).length).toBe(0);
    expect(offBars(min).length).toBe(6);
    expect(litBars(half).length).toBe(3);
    expect(offBars(half).length).toBe(3);
    expect(litBars(max).length).toBe(6);
    expect(offBars(max).length).toBe(0);

    // At max, the glowing bargraph face area meets the diffuse sensor scene-visibility benchmark (>= 0.0015 m2).
    const glowingArea = litBars(max).reduce((sum, p) => {
      const [hx, hy] = pieceExtent(p);
      return sum + 4 * hx * hy;
    }, 0);
    expect(glowingArea).toBeGreaterThanOrEqual(0.0015);

    // Pointer tip turns cleanly across -135, 0, +135 degrees.
    expect(deg(slot(min, 'pointer-tip').yaw)).toBeCloseTo(-135, 9);
    expect(deg(slot(half, 'pointer-tip').yaw)).toBeCloseTo(0, 9);
    expect(deg(slot(max, 'pointer-tip').yaw)).toBeCloseTo(135, 9);
  });
});

describe('numeric display model (VIS-014, F5)', () => {
  const lit = async (config: Record<string, number | string>, value: number): Promise<string[]> => {
    const core = await coreOf(lone('numeric-display', config));
    // The core refuses a value outside the range, so the view is the core's with the value set by hand.
    const view = viewOf(core, 'it');
    const pieces = partModel({ ...view, state: { ...view.state, value } })!;
    return pieces.filter((p) => p.slot.startsWith('d') && p.slot.includes('-')).map((p) => p.slot);
  };
  const range = { type: 'INT', min: 0, max: 100, unit: '%' };

  it('is modelled under its catalogue id, a dark window on a control box', async () => {
    expect(OPERATOR['numeric-display']).toBeDefined();
    const core = await coreOf(lone('numeric-display', range));
    const pieces = partModel(viewOf(core, 'it'))!;
    expect(slot(pieces, 'window').role).toBe('lens');
  });

  it('lights the segments of each digit, right-aligned in as many digits as the range needs', async () => {
    expect((await lit(range, 0)).sort()).toEqual(['d2-a', 'd2-b', 'd2-c', 'd2-d', 'd2-e', 'd2-f']);
    expect((await lit(range, 42)).sort()).toEqual(['d1-f', 'd1-g', 'd1-b', 'd1-c', 'd2-a', 'd2-b', 'd2-g', 'd2-e', 'd2-d'].sort());
    expect((await lit(range, 100)).sort()).toEqual(
      ['d0-b', 'd0-c', 'd1-a', 'd1-b', 'd1-c', 'd1-d', 'd1-e', 'd1-f', 'd2-a', 'd2-b', 'd2-c', 'd2-d', 'd2-e', 'd2-f'].sort(),
    );
  });

  it('shows dashes on every digit outside the range, and a minus segment for a negative', async () => {
    expect((await lit(range, 500)).sort()).toEqual(['d0-g', 'd1-g', 'd2-g']);
    const signed = { ...range, min: -10, max: 10 };
    expect((await lit(signed, -5)).sort()).toEqual(['d1-g', 'd2-a', 'd2-c', 'd2-d', 'd2-f', 'd2-g'].sort());
  });

  it('VIS-014 controls that stand together share one station body instead of a pedestal each', async () => {
    const pair = (part: string, id: string, x: number) => ({
      id,
      part,
      name: id,
      position: [x, 0.5, 0] as [number, number, number],
      rotationYDeg: 0,
      config: {},
    });
    const scene: PlantSceneFile = {
      schemaVersion: 1,
      name: 'station',
      parts: [pair('push-button', 'a', 0), pair('push-button', 'b', 0.4), pair('push-button', 'far', 5)],
      cameras: [],
    };
    const core = await coreOf(scene);
    const parts = core.snapshot().parts;
    const build = (id: string) => partModel(viewOf(core, id), { travel: 0, station: controlStation(viewOf(core, id), parts) })!;
    const [a, b, far] = [build('a'), build('b'), build('far')];
    expect(b.filter((p) => isStand(p.slot))).toEqual([]);
    expect(b.some((p) => p.slot === 'station-body')).toBe(false);
    expect(far.some((p) => p.slot === 'stand-post')).toBe(true);
    const body = slot(a, 'station-body');
    expect(a.filter((p) => isStand(p.slot))).toEqual([]);
    expect(body.role).toBe('steel');
    expect(body.at[0] - pieceExtent(body)[0]).toBeLessThan(0);
    expect(body.at[0] + pieceExtent(body)[0]).toBeGreaterThan(0.4);
    expect(bottom(slot(a, 'station-plate'))).toBeCloseTo(-0.5, 9);
    expect(top(body)).toBeCloseTo(bottom(slot(a, 'enclosure')), 9);
  });
});

describe('operator devices in their scenes (C10)', () => {
  it('C10 in tank-level-control, timed-tank and stacker-crane-warehouse every operator device stands beside the plant', async () => {
    // The planar box of a part in the world, from its model's bounds turned by its pose.
    const planar = (v: PartView, parts: readonly PartView[]) => {
      const b = modelBounds(v, parts)!;
      const corners = [b.min, b.max].flatMap((x) => [b.min, b.max].map((z) => rotate(v.pose.q, [x[0], 0, z[2]])));
      const xs = corners.map((c) => c[0] + v.pose.p[0]);
      const zs = corners.map((c) => c[2] + v.pose.p[2]);
      return { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) };
    };
    const gap = (a: ReturnType<typeof planar>, b: ReturnType<typeof planar>) =>
      Math.hypot(Math.max(0, a.x0 - b.x1, b.x0 - a.x1), Math.max(0, a.z0 - b.z1, b.z0 - a.z1));
    const far: string[] = [];
    for (const id of ['tank-level-control', 'timed-tank', 'stacker-crane-warehouse']) {
      const scene = JSON.parse(readFileSync(join(import.meta.dir, '../../../../plant-scenes', id, 'scene.json'), 'utf8')) as PlantSceneFile;
      const parts = (await coreOf(scene)).snapshot().parts;
      const plantParts = parts.filter((p) => !Object.hasOwn(OPERATOR, p.part)).map((p) => planar(p, parts));
      for (const control of parts.filter((p) => Object.hasOwn(OPERATOR, p.part))) {
        const nearest = Math.min(...plantParts.map((b) => gap(planar(control, parts), b)));
        // Beside: within 0.4 m of the plant, and not on it.
        if (!(nearest > 0 && nearest <= 0.4)) far.push(`${id} ${control.id} ${nearest.toFixed(2)} m`);
      }
    }
    expect(far).toEqual([]);
  });

  it('C10 in the opening view of stacker-crane-warehouse no operator device stands in front of the infeed or the outfeed belt', async () => {
    const scene = JSON.parse(
      readFileSync(join(import.meta.dir, '../../../../plant-scenes/stacker-crane-warehouse/scene.json'), 'utf8'),
    ) as PlantSceneFile;
    const snapshot = (await coreOf(scene)).snapshot();
    const fit = fitCamera(firstViewCamera(scene.cameras[0]!), snapshotBounds(snapshot)!, 16 / 9);
    const camera = { position: cameraPosition(fit), target: fit.target };
    const parts = snapshot.parts;
    const context = (v: PartView) => ({ travel: 0, station: controlStation(v, parts) });
    const cell = { w: 640, h: 360 };
    const frame = (views: PartView[]) => {
      const depth = new Float64Array(cell.w * cell.h);
      return { pixels: rasterize(worldBoxes(views, context), camera, depth, cell), depth };
    };
    const belts = frame(parts.filter((p) => p.part === 'belt'));
    const devices = frame(parts.filter((p) => Object.hasOwn(OPERATOR, p.part)));
    let inFront = 0;
    for (let i = 0; i < belts.pixels.length; i++)
      if (belts.pixels[i]! >= 0 && devices.pixels[i]! >= 0 && devices.depth[i]! < belts.depth[i]!) inFront++;
    expect(inFront).toBe(0);
  });
});
