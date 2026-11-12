import { describe, expect, it } from 'bun:test';
import type * as THREE from 'three';
import type { BodyPose, PartView, PlantSceneFile } from '../contracts';
import { createFrameStats, createRenderer, loadRenderer, watchContext } from './renderer';
import { instanceColors, instanceMatrices, partShape, boxShape, palletShape } from './geometry';

const scene: PlantSceneFile = { schemaVersion: 1, name: 't', parts: [], cameras: [] };

function fakeCanvas(gl: unknown = null) {
  const handlers = new Map<string, (e: Event) => void>();
  const canvas = {
    width: 100,
    height: 100,
    getContext: () => gl,
    addEventListener: (n: string, h: (e: Event) => void) => {
      handlers.set(n, h);
    },
    removeEventListener: (n: string) => {
      handlers.delete(n);
    },
  };
  return { canvas: canvas as unknown as HTMLCanvasElement, handlers };
}

const pose = (over: Partial<BodyPose> = {}): BodyPose => ({
  id: 'b',
  part: 'box',
  kind: 'box',
  size: [0.4, 0.3, 0.2],
  p: [1, 2, 3],
  q: [0, 0, 0, 1],
  ...over,
});
const view = (part: string, over: Partial<BodyPose> = {}, state: PartView['state'] = {}): PartView => ({
  id: 'v',
  part,
  name: 'V',
  pose: pose({ part, ...over }),
  state,
  signals: {},
});

describe('renderer', () => {
  it('VIS-006 no WebGL 2 reports unavailable with a message, not an exception', async () => {
    const { canvas } = fakeCanvas(null);
    const r = createRenderer(canvas, scene, { quality: 'low' }, {} as typeof THREE);
    expect('unavailable' in r && r.unavailable.length > 0).toBe(true);
    const lazy = await loadRenderer(canvas, scene, { quality: 'low' });
    expect('unavailable' in lazy).toBe(true);
  });

  it('VIS-006 a lost context emits lost and a restored one emits restored', () => {
    const { canvas, handlers } = fakeCanvas();
    const events: string[] = [];
    const stop = watchContext(canvas, (e) => events.push(e), 10_000);
    let prevented = false;
    handlers.get('webglcontextlost')?.({
      preventDefault: () => {
        prevented = true;
      },
    } as Event);
    expect(prevented).toBe(true);
    handlers.get('webglcontextrestored')?.({} as Event);
    expect(events).toEqual(['lost', 'restored']);
    stop();
    expect(handlers.size).toBe(0);
  });

  it('VIS-006 a context that stays lost reports unavailable', async () => {
    const { canvas, handlers } = fakeCanvas();
    const events: string[] = [];
    const stop = watchContext(canvas, (e) => events.push(e), 5);
    handlers.get('webglcontextlost')?.({ preventDefault: () => {} } as Event);
    await new Promise((r) => setTimeout(r, 30));
    expect(events).toEqual(['lost', 'unavailable']);
    stop();
  });

  it('VIS-004 frame statistics report the current rate and the rate of the slowest 5 % of frames', () => {
    const s = createFrameStats();
    expect(s.fps()).toEqual({ current: 0, p5: 0 });
    let t = 0;
    for (let i = 0; i < 90; i++) {
      s.frame(t);
      t += 10;
    }
    for (let i = 0; i < 10; i++) {
      s.frame(t);
      t += 100;
    } // 10 % of the frames take 100 ms
    const { current, p5 } = s.fps();
    expect(current).toBeGreaterThan(30);
    expect(current).toBeLessThan(60);
    expect(p5).toBeCloseTo(10, 0);
  });
});

describe('geometry', () => {
  it('PRT-009 geometry is generated: every shape function is pure and returns sizes from the snapshot', () => {
    expect(boxShape(pose())).toEqual({ shape: 'box', size: [0.4, 0.3, 0.2] });
    expect(palletShape(pose({ size: [1.2, 0.15, 0.8] }))).toEqual({ shape: 'box', size: [1.2, 0.15, 0.8] });
    expect(partShape(view('belt', { size: [2, 0.1, 0.5] }))).toEqual({ shape: 'box', size: [2, 0.1, 0.5] });
    expect(partShape(view('roller', { size: [2, 0.1, 0.5] }))).toEqual({ shape: 'cylinder', radius: 0.05, length: 2 });
    expect(partShape(view('curve', { size: [0.5, 0.1, 0.5] }, { radius: 1.5, angleDeg: 45 }))).toEqual({
      shape: 'curve',
      innerRadius: 1,
      outerRadius: 1.5,
      height: 0.1,
      angleDeg: 45,
    });
    for (const p of ['blade', 'sensor', 'unknown']) {
      expect(partShape(view(p, { size: [3, 4, 5] }))).toEqual({ shape: 'box', size: [3, 4, 5] });
    }
    const v = view('belt');
    expect(partShape(v)).toEqual(partShape(v));
    expect(Object.isFrozen(v)).toBe(false); // the builders read, never write
  });

  it('PRT-009 a snapshot maps to one scaled, translated instance matrix per item', () => {
    const half = Math.SQRT1_2;
    const items = [pose(), pose({ q: [0, half, 0, half], p: [0, 0, 0], size: [1, 1, 1] })];
    const m = instanceMatrices(items);
    expect(m.length).toBe(32);
    expect(Array.from(m.slice(0, 16))).toEqual(
      [expect.closeTo(0.4), 0, 0, 0, 0, expect.closeTo(0.3), 0, 0, 0, 0, expect.closeTo(0.2), 0, 1, 2, 3, 1].map((v) => v),
    );
    // A quarter turn about Y sends +X to -Z.
    expect(m[16]).toBeCloseTo(0);
    expect(m[18]).toBeCloseTo(-1);
    expect(instanceColors([pose({ kind: 'pallet' }), pose({ kind: 'item' })]).length).toBe(6);
  });
});
