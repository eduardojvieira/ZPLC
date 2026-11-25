import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as THREE from 'three';
import type { BodyPose, PartView, PlantSceneFile } from '../contracts';
import { createFrameStats, createRenderer, loadRenderer, pieceGeometry, watchContext } from './renderer';
import { paletteFor } from './displayModes';
import { partColour, roleLook } from './look';
import { extrusion, piece, pieceExtent, slotted, slottedSection } from './models/shared';
import { partModel } from './models';
import { instanceMatrices, partDecor, partShape, boxShape, palletShape } from './geometry';

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
    expect(partShape(view('curved', { size: [0.5, 0.1, 0.5] }, { radius: 1.5, angleDeg: 45 }))).toEqual({
      shape: 'curve',
      innerRadius: 1,
      outerRadius: 1.5,
      height: 0.1,
      angleDeg: 45,
    });
    for (const p of ['stop-blade', 'sensor', 'unknown']) {
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
  });
});

// A THREE stand-in that records the colours and camera position the renderer assigns; no WebGL needed.
function fakeThree() {
  class Color {
    hex: number;
    constructor(a: number, b?: number, c?: number) {
      this.hex = b === undefined ? a : (Math.round(a * 255) << 16) | (Math.round(b * 255) << 8) | Math.round((c ?? 0) * 255);
    }
    set(v: number) {
      this.hex = v;
    }
    copy(c: Color) {
      this.hex = c.hex;
      return this;
    }
  }
  class Vec {
    x = 0;
    y = 0;
    z = 0;
    set(x: number, y: number, z: number) {
      [this.x, this.y, this.z] = [x, y, z];
    }
  }
  class Obj {
    position = new Vec();
    scale = new Vec();
    visible = true;
    rotation = { x: 0 };
    quaternion = { set() {} };
    children: unknown[] = [];
    add(...o: unknown[]) {
      this.children.push(...o);
    }
    userData: Record<string, unknown> = {};
    remove(o: unknown) {
      this.children = this.children.filter((c) => c !== o);
    }
    lookAt() {}
  }
  const mats: Material[] = [];
  const scenes: { background: Color | null; children: unknown[] }[] = [];
  class Material {
    color: Color;
    emissive = new Color(0);
    name = '';
    constructor(o: { color?: number } = {}) {
      this.color = new Color(o.color ?? 0xffffff);
      mats.push(this);
    }
    dispose() {}
  }
  class Geometry {
    dispose() {}
    rotateX() {}
    rotateY() {}
    rotateZ() {}
    translate() {}
    getAttribute() {
      return undefined;
    }
  }
  /** The outline of an extruded profile; no arcs, so a curved conveyor still has no shape here. */
  class Outline {
    moveTo() {}
    lineTo() {}
  }
  const drawn: { x: number; y: number; z: number }[] = [];
  const mesh = class extends Obj {
    constructor(
      public geometry: unknown,
      public material: Material,
    ) {
      super();
    }
  };
  const colorsSet: number[] = [];
  // Outline materials are kept apart from `mats` so the creation-order assertions on the filled materials hold.
  class Plain extends Obj {
    color: Color;
    wireframe: boolean;
    constructor(o: { color?: number; wireframe?: boolean } = {}) {
      super();
      this.color = new Color(o.color ?? 0xffffff);
      this.wireframe = o.wireframe ?? false;
    }
    dispose() {}
  }
  const THREE = {
    LineBasicMaterial: Plain,
    MeshBasicMaterial: Plain,
    EdgesGeometry: Geometry,
    LineSegments: class extends Obj {
      isLine = true;
      constructor(
        public geometry: unknown,
        public material: Plain,
      ) {
        super();
      }
    },
    Color,
    Scene: class extends Obj {
      background: Color | null = null;
      constructor() {
        super();
        scenes.push(this);
      }
    },
    PerspectiveCamera: class extends Obj {
      aspect = 1;
      updateProjectionMatrix() {}
    },
    HemisphereLight: class extends Obj {
      color = new Color(0);
      groundColor = new Color(0);
    },
    Group: Obj,
    Fog: class {
      color = new Color(0);
    },
    CylinderGeometry: Geometry,
    ExtrudeGeometry: Geometry,
    Shape: Outline,
    DirectionalLight: class extends Obj {
      shadow = { mapSize: { set() {} } };
    },
    Mesh: mesh,
    InstancedMesh: class extends Obj {
      constructor(
        public geometry: unknown,
        public material: Plain,
      ) {
        super();
      }
      instanceMatrix = { array: new Float32Array(16 * 512), setUsage() {}, needsUpdate: false };
      instanceColor = { needsUpdate: false };
      count = 0;
      setColorAt(_i: number, c: Color) {
        colorsSet.push(c.hex);
      }
      dispose() {}
    },
    PlaneGeometry: Geometry,
    BoxGeometry: Geometry,
    MeshStandardMaterial: Material,
    DynamicDrawUsage: 0,
    WebGLRenderer: class {
      shadowMap = { enabled: false };
      setPixelRatio() {}
      setSize() {}
      dispose() {}
      render(_w: unknown, cam: Obj) {
        drawn.push({ ...cam.position });
      }
    },
  };
  return { THREE: THREE as unknown as typeof import('three'), drawn, colorsSet, mats, scenes };
}

/** Every outline in the scene: edge lines on parts and wireframe instanced passes, with their colours. */
function outlinesOf(world: { children: unknown[] } | undefined): { kind: 'line' | 'items'; hex: number; part?: string }[] {
  const found: { kind: 'line' | 'items'; hex: number; part?: string }[] = [];
  type Node = {
    children?: unknown[];
    isLine?: boolean;
    userData?: { part?: string };
    material?: { wireframe?: boolean; color?: { hex: number } };
  };
  const visit = (o: Node, part: string | undefined): void => {
    const owner = o.userData?.part ?? part;
    if (o.material?.wireframe) found.push({ kind: 'items', hex: o.material.color?.hex ?? -1 });
    else if (o.isLine && o.material?.color) found.push({ kind: 'line', hex: o.material.color.hex, ...(owner ? { part: owner } : {}) });
    for (const c of o.children ?? []) visit(c as Node, owner);
  };
  for (const c of world?.children ?? []) visit(c as Node, undefined);
  return found;
}
/** The parts that have at least one edge line. */
const outlinedParts = (world: { children: unknown[] } | undefined): string[] =>
  [...new Set(outlinesOf(world).flatMap((o) => (o.kind === 'line' && o.part ? [o.part] : [])))].sort();

describe('tank and panel geometry', () => {
  const PANEL = ['tank', 'selector-switch', 'emergency-stop', 'stack-light', 'potentiometer', 'numeric-display'];
  const tank = (fraction: number): PartView => view('tank', { size: [1, 2, 0.5] }, { fraction });

  it(
    'PRT-009 the tank, selector, emergency stop, stack light, potentiometer and display shapes are generated in code and name no ' +
      'asset',
    () => {
      for (const p of PANEL) {
        const spec = partShape(view(p, { size: [1, 2, 0.5] }));
        expect(spec).toEqual({ shape: 'box', size: [1, 2, 0.5] });
        expect(JSON.stringify(spec)).not.toMatch(/\.(glb|gltf|png|svg|obj)|http|url/i);
      }
      // the M1 shapes are unchanged by the new cases
      expect(partShape(view('roller', { size: [2, 0.1, 0.5] }))).toEqual({ shape: 'cylinder', radius: 0.05, length: 2 });
      expect(partDecor(view('belt'))).toEqual([]);
      expect(partDecor(view('sensor'))).toEqual([]);
    },
  );

  it('VIS-003 a tank at 40 percent has a fill of 0.4 of its height, resting on the bottom', () => {
    const [fill] = partDecor(tank(0.4));
    expect(fill?.size[1]).toBeCloseTo(0.8, 9);
    expect(fill?.centre[1]).toBeCloseTo(-1 + 0.4, 9); // bottom of the tank is y = -1 from its centre
    expect(partDecor(tank(0))[0]?.size[1]).toBe(0);
    expect(partDecor(tank(1))[0]?.size[1]).toBeCloseTo(2, 9);
    expect(partDecor(tank(7))[0]?.size[1]).toBeCloseTo(2, 9); // a value above 1 never overfills
    expect(partDecor(tank(-1))[0]?.size[1]).toBe(0);
    expect(partDecor(view('tank', { size: [1, 2, 0.5] }))[0]?.size[1]).toBe(0); // no fraction yet
  });

  it('VIS-003 the stack light draws three lamps, each lit by its own state key', () => {
    const lamps = partDecor(view('stack-light', { size: [0.08, 0.3, 0.08] }, { red: true, amber: false, green: true }));
    expect(lamps.map((l) => [l.slot, l.lit])).toEqual([
      ['red', true],
      ['amber', false],
      ['green', true],
    ]);
    expect(new Set(lamps.map((l) => l.centre[1])).size).toBe(3);
  });
});

describe('display preferences reach the renderer', () => {
  const frames: ((t: number) => void)[] = [];
  const saved = { raf: globalThis.requestAnimationFrame, caf: globalThis.cancelAnimationFrame };
  beforeEach(() => {
    frames.length = 0;
    globalThis.requestAnimationFrame = ((cb: (t: number) => void) => frames.push(cb)) as unknown as typeof requestAnimationFrame;
    globalThis.cancelAnimationFrame = (() => {}) as typeof cancelAnimationFrame;
  });
  afterEach(() => {
    globalThis.requestAnimationFrame = saved.raf;
    globalThis.cancelAnimationFrame = saved.caf;
  });
  const runFrame = (t: number): void => frames.shift()?.(t);
  const cameras = [
    { name: 'a', position: [0, 5, 10], target: [0, 0, 0] },
    { name: 'b', position: [10, 5, 0], target: [0, 0, 0] },
  ] as PlantSceneFile['cameras'];
  const build = () => {
    const f = fakeThree();
    const r = createRenderer(fakeCanvas({}).canvas, { ...scene, cameras }, { quality: 'low' }, f.THREE);
    if ('unavailable' in r) throw new Error(r.unavailable);
    return { ...f, r };
  };
  const snapshot = { items: [pose({ kind: 'item' })], parts: [view('belt'), { ...view('sensor'), id: 's' }] } as unknown as Parameters<
    ReturnType<typeof build>['r']['setSnapshot']
  >[0];

  it('VIS-009 VIS-018 setPalette recolours the floor and the items, and parts keep their own colours, including ones that exist', () => {
    const { r, colorsSet, mats, scenes } = build();
    r.setSnapshot(snapshot);
    colorsSet.length = 0;
    const hc = paletteFor({ mode: 'high-contrast', reducedMotion: false });
    r.setPalette?.(hc);
    expect(colorsSet).toEqual([hc.item]); // the existing item (no colour named) repainted in the high-contrast item tone
    const colour = (name: string) => mats.find((m) => m.name === name)?.color.hex;
    expect(colour('floor')).toBe(0x000000);
    expect(scenes[0]?.background?.hex).toBe(0x000000);
    // The belt's frame keeps its silver aluminium and the sensor's housing its part colour (each lightened for the black floor), never
    // one palette tone.
    expect(colour('frame:belt')).toBe(roleLook('frame', 'belt', hc).colour);
    expect(colour('housing:sensor')).toBe(partColour('sensor', hc));
    expect(colour('frame:belt')).not.toBe(colour('housing:sensor'));
  });

  it('VIS-014 the material of a slotted profile draws the shading of its slots; the other materials of a model do not', () => {
    const { r, mats } = build();
    r.setSnapshot(snapshot);
    const shading = (name: string) =>
      mats.filter((m) => m.name === name).map((m) => (m as { vertexColors?: boolean }).vertexColors === true);
    expect(shading('frame:belt')).toEqual([true]); // rails, legs and braces are all slotted profile
    expect(shading('steel:belt')).toEqual([false]);
    expect(shading('housing:sensor')).toEqual([false]);
  });

  it('VIS-009 parts built after setPalette use the palette colours', () => {
    const { r, colorsSet } = build();
    r.setPalette?.(paletteFor({ mode: 'dark', reducedMotion: false }));
    colorsSet.length = 0;
    r.setSnapshot(snapshot);
    expect(colorsSet).toEqual([paletteFor({ mode: 'dark', reducedMotion: false }).item]);
  });

  it('SCN-008 the renderer exposes its camera and draws a ghost marker only while one is set', () => {
    const { r, mats } = build();
    expect(r.cameraState().target).toEqual([0, 0, 0]);
    const before = mats.length;
    r.setGhost?.(null);
    expect(mats.length).toBe(before); // nothing is built for a ghost that was never shown
    r.setGhost?.([1, 0, 2]);
    expect(mats.length).toBe(before + 1);
    r.setGhost?.(null);
    r.setGhost?.([3, 0, 4]);
    expect(mats.length).toBe(before + 1); // one marker, reused
  });

  it('VIS-009 reduced motion makes a camera preset change land on the next frame', () => {
    const { r, drawn } = build();
    runFrame(0);
    r.setCameraAnimation?.(false);
    r.setCameraPreset('b');
    runFrame(16);
    const last = drawn[drawn.length - 1];
    expect(last?.x).toBeCloseTo(10, 1);
    expect(last?.z).toBeCloseTo(0, 3);
  });

  it('VIS-009 with animation on a preset change eases over several frames', () => {
    const { r, drawn } = build();
    runFrame(0);
    r.setCameraAnimation?.(true);
    r.setCameraPreset('b');
    runFrame(16);
    const first = drawn[drawn.length - 1];
    expect(first?.z).toBeGreaterThan(1); // not there yet
    for (let i = 0; i < 80; i++) runFrame(32 + i * 16);
    expect(drawn[drawn.length - 1]?.z).toBeCloseTo(0, 1);
  });

  it('VIS-003 the tank liquid inside the glass vessel changes with the snapshot and allocates no new mesh per frame', () => {
    const { r, mats, scenes } = build();
    const snap = (fraction: number) =>
      ({ items: [], parts: [{ ...view('tank', { size: [1, 2, 0.5] }, { fraction }), id: 'tk' }] }) as unknown as Parameters<
        typeof r.setSnapshot
      >[0];
    type Node = {
      children: Node[];
      visible: boolean;
      userData: { part?: string; slot?: string; shape?: { length?: number } };
    };
    const count = (o: Node): number => 1 + o.children.reduce((n, c) => n + count(c), 0);
    const world = scenes[0] as unknown as Node;
    r.setSnapshot(snap(0.4));
    const tankMesh = world.children.find((c) => c.userData.part === 'tank')!;
    const liquid = tankMesh.children.find((c) => c.userData.slot === 'liquid')!;
    const vessel = tankMesh.children.find((c) => c.userData.slot === 'vessel')!;
    const height = (m: Node): number => (m.userData.shape as { length?: number }).length ?? NaN;
    const body = (vessel.userData.shape as unknown as { length: number }).length;
    expect(height(liquid)).toBeCloseTo(0.4 * body, 2);
    const nodes = count(world);
    const materials = mats.length;
    for (const f of [0.1, 0.9, 0, 1]) r.setSnapshot(snap(f));
    expect(height(liquid)).toBeCloseTo(body, 2);
    expect(liquid.visible).toBe(true);
    r.setSnapshot(snap(0));
    expect(liquid.visible).toBe(false);
    expect(count(world)).toBe(nodes);
    expect(mats.length).toBe(materials);
    expect(world.children.find((c) => c.userData.part === 'tank')).toBe(tankMesh);
  });

  it('VIS-009 setPalette and setCameraAnimation do not throw after dispose', () => {
    const { r } = build();
    r.dispose();
    expect(() => r.setPalette?.(paletteFor({ mode: 'light', reducedMotion: false }))).not.toThrow();
    expect(() => r.setCameraAnimation?.(false)).not.toThrow();
  });

  it('VIS-009 an unavailable renderer has nothing to drive, and the panel helper tolerates it', () => {
    const r = createRenderer(fakeCanvas(null).canvas, scene, { quality: 'low' }, {} as typeof THREE);
    expect('setPalette' in r).toBe(false);
  });

  const withBlade = {
    items: snapshot.items,
    parts: [view('belt'), { ...view('sensor'), id: 's' }, { ...view('stop-blade'), id: 'k' }],
  } as unknown as Parameters<ReturnType<typeof build>['r']['setSnapshot']>[0];
  const hc = paletteFor({ mode: 'high-contrast', reducedMotion: false });

  it('VIS-009 high contrast outlines sensors, blades and items in the outline colour, and not belts', () => {
    const { r, scenes } = build();
    r.setSnapshot(withBlade);
    expect(outlinesOf(scenes[0])).toEqual([]); // no palette yet: nothing outlined
    r.setPalette?.(hc);
    const found = outlinesOf(scenes[0]);
    expect(outlinedParts(scenes[0])).toEqual(['sensor', 'stop-blade']); // every piece of the sensor and the blade, not the belt
    expect(found.filter((o) => o.kind === 'items').length).toBe(1);
    expect(found.every((o) => o.hex === 0xffffff)).toBe(true);
  });

  it('VIS-009 the views the real core publishes for a curved conveyor and a stop blade get their shape, colour and outline', async () => {
    const { createPlantCore } = await import('../core/plantCore');
    const part = (id: string, kind: string, config = {}) => ({
      id,
      part: kind,
      name: id,
      position: [0, 0.5, 0] as [number, number, number],
      rotationYDeg: 0,
      config,
    });
    const core = await createPlantCore({ ...scene, parts: [part('arc', 'curved'), part('blade', 'stop-blade')] });
    let parts: Parameters<ReturnType<typeof build>['r']['setSnapshot']>[0]['parts'];
    try {
      parts = core.snapshot().parts;
    } finally {
      core.dispose();
    }
    const arc = parts.find((p) => p.id === 'arc')!;
    const blade = parts.find((p) => p.id === 'blade')!;
    expect(partShape(arc).shape).toBe('curve');
    expect(partShape(blade).shape).toBe('box');
    const { r, scenes, mats } = build();
    r.setSnapshot({ items: [], parts: [blade] } as unknown as Parameters<typeof r.setSnapshot>[0]);
    r.setPalette?.(hc);
    expect(mats.some((m) => m.color.hex === partColour('stop-blade', hc))).toBe(true); // the blade keeps its own colour under a palette
    // High contrast outlines every piece of the blade (the fake three has no Shape for the arc).
    expect(outlinesOf(scenes[0]).filter((o) => o.kind === 'line').length).toBe(partModel(blade)!.length);
  });

  it('PRT-003 a real curved conveyor of radius 1.2 is drawn as an arc whose radii and angle follow its config', async () => {
    const { createPlantCore } = await import('../core/plantCore');
    const config = { radius: 1.2, width: 0.5 };
    const core = await createPlantCore({
      ...scene,
      parts: [{ id: 'arc', part: 'curved', name: 'arc', position: [0, 0.5, 0], rotationYDeg: 0, config }],
    });
    try {
      const arc = core.snapshot().parts[0]!;
      const spec = partShape(arc);
      if (spec.shape !== 'curve') throw new Error('not a curve');
      expect(spec.innerRadius).toBeCloseTo(0.95, 6); // the belt's centreline is the radius: 1.2 - 0.5 / 2
      expect(spec.outerRadius).toBeCloseTo(1.45, 6);
      expect(spec.angleDeg).toBe(90);
    } finally {
      core.dispose();
    }
  });

  it.each([
    ['right', 0],
    ['left', 0],
    ['right', 30],
    ['left', 200],
  ] as const)(
    'PRT-003 the %s-hand curved conveyor turned %i degrees is drawn over the belt segments the physics builds',
    async (hand, rot) => {
      const { createPlantCore } = await import('../core/plantCore');
      const { conveyorParts } = await import('../core/parts/conveyors');
      const sp = {
        id: 'arc',
        part: 'curved',
        name: 'arc',
        position: [1, 0.5, -2] as [number, number, number],
        rotationYDeg: rot,
        config: { radius: 1.2, width: 0.5, hand },
      };
      const core = await createPlantCore({ ...scene, parts: [sp] });
      let view: PartView;
      try {
        view = core.snapshot().parts[0]!;
      } finally {
        core.dispose();
      }
      // The segments the conveyor really builds: record them through a world that only keeps the bodies.
      const segments: { position: [number, number, number] }[] = [];
      const recorder = { addBody: (b: { position: [number, number, number] }) => segments.push(b), addBelt: () => undefined };
      conveyorParts
        .find((d) => d.id === 'curved')!
        .runtime(sp, () => 0)
        .build(recorder as never, sp);
      expect(segments.length).toBe(12);
      const spec = partShape(view);
      if (spec.shape !== 'curve') throw new Error('not a curve');
      const yaw = (2 * Math.atan2(view.pose.q[1], view.pose.q[3]) * 180) / Math.PI;
      const a = (-yaw * Math.PI) / 180; // the inverse of the part-to-world rotation about +y
      for (const s of segments) {
        const dx = s.position[0] - view.pose.p[0];
        const dz = s.position[2] - view.pose.p[2];
        const x = dx * Math.cos(a) + dz * Math.sin(a); // into the mesh frame, where the arc sweeps theta from 0 to 90 about +y
        const z = -dx * Math.sin(a) + dz * Math.cos(a);
        const radius = Math.hypot(x, z);
        const theta = (Math.atan2(-z, x) * 180) / Math.PI;
        expect(radius).toBeGreaterThan(spec.innerRadius);
        expect(radius).toBeLessThan(spec.outerRadius);
        expect(radius).toBeCloseTo(1.2, 6);
        expect(theta).toBeGreaterThanOrEqual(-1e-6);
        expect(theta).toBeLessThanOrEqual(spec.angleDeg + 1e-6);
      }
    },
  );

  it('VIS-009 the light and dark palettes draw no outlines, and switching back removes them', () => {
    const { r, scenes } = build();
    r.setSnapshot(withBlade);
    for (const mode of ['light', 'dark'] as const) {
      r.setPalette?.(paletteFor({ mode, reducedMotion: false }));
      expect(outlinesOf(scenes[0])).toEqual([]);
    }
    r.setPalette?.(hc);
    const outlines = outlinesOf(scenes[0]).length;
    expect(outlines).toBeGreaterThan(2);
    r.setPalette?.(paletteFor({ mode: 'light', reducedMotion: false }));
    expect(outlinesOf(scenes[0])).toEqual([]);
    r.setPalette?.(hc);
    expect(outlinesOf(scenes[0]).length).toBe(outlines); // and they come back without duplicates
  });

  it('VIS-009 sensors and blades that appear after high contrast is set get outlines too', () => {
    const { r, scenes } = build();
    r.setPalette?.(hc);
    r.setSnapshot(snapshot);
    expect(outlinedParts(scenes[0])).toEqual(['sensor']);
    r.setSnapshot(withBlade);
    expect(outlinedParts(scenes[0])).toEqual(['sensor', 'stop-blade']);
    r.setSnapshot({ ...withBlade, parts: [] });
    expect(outlinedParts(scenes[0])).toEqual([]);
  });

  it('VIS-009 items added later are outlined, including after the instance buffer grows', () => {
    const { r, scenes } = build();
    r.setPalette?.(hc);
    const many = { items: Array.from({ length: 300 }, () => pose({ kind: 'item' })), parts: [] } as unknown as typeof snapshot;
    r.setSnapshot(many);
    const passes = scenes[0]?.children.filter((c) => (c as { material?: { wireframe?: boolean } }).material?.wireframe) as {
      count: number;
    }[];
    expect(passes.length).toBe(1);
    expect(passes[0]?.count).toBe(300);
  });

  it('VIS-009 outlines do not throw after dispose', () => {
    const { r } = build();
    r.setSnapshot(withBlade);
    r.setPalette?.(hc);
    r.dispose();
    expect(() => r.setPalette?.(hc)).not.toThrow();
    expect(() => r.setSnapshot(withBlade)).not.toThrow();
  });
});

describe('extruded pieces (VIS-014)', () => {
  it('VIS-014 three draws an extruded profile in the box its piece declares, along each axis', () => {
    for (const axis of ['x', 'y', 'z'] as const) {
      const shape = slotted(0.03, 0.13, 2, axis);
      const g = pieceGeometry(THREE, {}, shape);
      g.computeBoundingBox();
      const half = pieceExtent(piece('p', shape, [0, 0, 0], 'frame'));
      const box = g.boundingBox!;
      for (const [i, k] of (['x', 'y', 'z'] as const).entries()) {
        expect(box.min[k]).toBeCloseTo(-half[i]!, 6); // three keeps positions in 32-bit floats
        expect(box.max[k]).toBeCloseTo(half[i]!, 6);
      }
    }
  });

  it('VIS-014 the slots of a profile are drawn dark and its faces and ends in full; a plain extrusion has no shading', () => {
    const g = pieceGeometry(THREE, {}, slotted(0.03, 0.13, 2, 'x'));
    const pos = g.getAttribute('position');
    const colour = g.getAttribute('color');
    const ends = g.groups[0]!.count;
    let [dark, lit] = [0, 0];
    for (let i = 0; i < pos.count; i++) {
      // Along x, the section lies across z (0.015 to the faces) and y (0.065).
      const inside = Math.min(0.015 - Math.abs(pos.getZ(i)), 0.065 - Math.abs(pos.getY(i))) > 1e-6;
      const shade = colour.getX(i);
      expect([colour.getY(i), colour.getZ(i)]).toEqual([shade, shade]);
      if (i < ends || !inside) expect(shade).toBe(1);
      else expect(shade).toBeLessThan(0.5);
      if (shade < 1) dark++;
      else lit++;
    }
    expect(dark).toBeGreaterThan(0);
    expect(lit).toBeGreaterThan(0);
    expect(pieceGeometry(THREE, {}, extrusion(slottedSection(0.03, 0.13), 2, 'x')).getAttribute('color')).toBeUndefined();
  });
});
