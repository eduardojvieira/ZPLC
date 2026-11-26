/**
 * The first view of a scene shows all of it, in a panel of any size (VIS-002), and a part is drawn once (VIS-003). The renderer
 * is the real one with a fake three, fed the real snapshots of the 21 shipped scenes; the projection below is the test's own
 * oracle (the vertical field of view is three's 45 degrees), not the code under test.
 */
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type * as THREE from 'three';
import type { PlantSceneFile, PlantSnapshot, Quat } from '../contracts';
import '../core/plantCore'; // registers the shipped parts before the catalogue is read
import { cameraFromPreset, cameraPosition, FIRST_VIEW_POLAR_MAX_DEG, type CameraState } from './camera';
import { partShape } from './geometry';
import { createRenderer, type PlantRenderer } from './renderer';

const SCENES = join(import.meta.dir, '../../../plant-scenes');
const IDS = readdirSync(SCENES).sort();
const SIZES: ReadonlyArray<[number, number]> = [
  [480, 640],
  [720, 800],
  [1280, 720],
  [1920, 1080],
];
const loadScene = (id: string): PlantSceneFile => JSON.parse(readFileSync(join(SCENES, id, 'scene.json'), 'utf8')) as PlantSceneFile;

type V = [number, number, number];
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V): V => {
  const l = Math.hypot(...a);
  return [a[0] / l, a[1] / l, a[2] / l];
};
const rot = ([x, y, z, w]: Quat, [vx, vy, vz]: V): V => {
  const tx = 2 * (y * vz - z * vy);
  const ty = 2 * (z * vx - x * vz);
  const tz = 2 * (x * vy - y * vx);
  return [vx + w * tx + (y * tz - z * ty), vy + w * ty + (z * tx - x * tz), vz + w * tz + (x * ty - y * tx)];
};

/** The eight corners of the box of every part view and of every item. */
function corners(snapshot: PlantSnapshot): Array<{ name: string; corners: V[] }> {
  const boxes = [
    ...snapshot.parts.map((p) => {
      const s = partShape(p);
      const size: V =
        s.shape === 'box'
          ? [...s.size]
          : s.shape === 'cylinder'
            ? [s.length, s.radius * 2, s.radius * 2]
            : [s.outerRadius * 2, s.height, s.outerRadius * 2];
      return { name: p.name, size, p: p.pose.p as V, q: p.pose.q };
    }),
    ...snapshot.items.map((i) => ({ name: i.id, size: [...i.size] as V, p: i.p as V, q: i.q })),
  ];
  return boxes.map((b) => {
    const out: V[] = [];
    for (const sx of [-0.5, 0.5])
      for (const sy of [-0.5, 0.5])
        for (const sz of [-0.5, 0.5]) {
          const c = rot(b.q, [b.size[0] * sx, b.size[1] * sy, b.size[2] * sz]);
          out.push([b.p[0] + c[0], b.p[1] + c[1], b.p[2] + c[2]]);
        }
    return { name: b.name, corners: out };
  });
}

/** The names of the boxes with a corner outside the frame of the camera `state` on a panel of `aspect`. */
function outside(state: CameraState, aspect: number, snapshot: PlantSnapshot): string[] {
  const eye = cameraPosition(state) as V;
  const f = norm(sub(state.target as V, eye));
  const r = norm(cross(f, [0, 1, 0]));
  const u = cross(r, f);
  const t = Math.tan((45 * Math.PI) / 360);
  return corners(snapshot)
    .filter(({ corners: cs }) =>
      cs.some((c) => {
        const d = sub(c, eye);
        const z = dot(d, f);
        return z <= 0.1 || Math.abs(dot(d, r) / (z * t * aspect)) > 1 || Math.abs(dot(d, u) / (z * t)) > 1;
      }),
    )
    .map((b) => b.name);
}

type DrawnNode = { userData?: { part?: string }; position: { x: number; y: number; z: number } };

/** Just enough of three for the renderer to run: it records the objects added to the world. */
function fakeThree() {
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
    userData: Record<string, unknown> = {};
    add(...o: unknown[]) {
      this.children.push(...o);
    }
    remove(o: unknown) {
      this.children = this.children.filter((c) => c !== o);
    }
    lookAt() {}
  }
  class Color {
    constructor(public hex = 0) {}
    set(v: number) {
      this.hex = v;
    }
    copy(c: Color) {
      this.hex = c.hex;
      return this;
    }
  }
  class Material {
    color = new Color();
    emissive = new Color();
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
  const worlds: Obj[] = [];
  class Mesh extends Obj {
    constructor(
      public geometry: unknown,
      public material: Material,
    ) {
      super();
    }
  }
  const THREE_ = {
    Color,
    Scene: class extends Obj {
      background: Color | null = null;
      constructor() {
        super();
        worlds.push(this);
      }
    },
    PerspectiveCamera: class extends Obj {
      aspect = 1;
      updateProjectionMatrix() {}
    },
    HemisphereLight: class extends Obj {
      color = new Color();
      groundColor = new Color();
    },
    Group: Obj,
    Fog: class {
      color = new Color();
    },
    DirectionalLight: class extends Obj {
      shadow = { mapSize: { set() {} } };
    },
    Mesh,
    InstancedMesh: class extends Obj {
      instanceMatrix = { array: new Float32Array(16 * 512), setUsage() {}, needsUpdate: false };
      instanceColor = { needsUpdate: false };
      count = 0;
      constructor(
        public geometry: unknown,
        public material: Material,
      ) {
        super();
      }
      setColorAt() {}
      dispose() {}
    },
    PlaneGeometry: Geometry,
    BoxGeometry: Geometry,
    CylinderGeometry: Geometry,
    ExtrudeGeometry: Geometry,
    Shape: class {
      moveTo() {}
      lineTo() {}
    },
    MeshStandardMaterial: Material,
    DynamicDrawUsage: 0,
    WebGLRenderer: class {
      shadowMap = { enabled: false };
      setPixelRatio() {}
      setSize() {}
      dispose() {}
      render() {}
    },
  };
  return { THREE: THREE_ as unknown as typeof THREE, worlds: worlds as unknown as Array<{ children: DrawnNode[] }> };
}

const frames: Array<(t: number) => void> = [];
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
const runFrame = (t = 0): void => frames.shift()?.(t);

function build(scene: PlantSceneFile) {
  const f = fakeThree();
  const canvas = { width: 1280, height: 720, getContext: () => ({}), addEventListener() {}, removeEventListener() {} };
  const r = createRenderer(canvas as unknown as HTMLCanvasElement, scene, { quality: 'low' }, f.THREE);
  if ('unavailable' in r) throw new Error(r.unavailable);
  return { ...f, r: r as PlantRenderer };
}

/** The snapshot of a shipped scene as its real core publishes it at the start. */
async function snapshotOf(scene: PlantSceneFile): Promise<PlantSnapshot> {
  const { createPlantCore } = await import('../core/plantCore');
  const core = await createPlantCore(scene);
  try {
    return core.snapshot();
  } finally {
    core.dispose();
  }
}

describe('the first view fits the whole scene (VIS-002)', () => {
  it('VIS-002 the first view fits the whole scene at 480×640, 720×800, 1280×720 and 1920×1080, for the 21 shipped scenes', async () => {
    expect(IDS.length).toBe(21);
    const cut: string[] = [];
    for (const id of IDS) {
      const scene = loadScene(id);
      const snapshot = await snapshotOf(scene);
      const { r } = build(scene);
      r.setSnapshot(snapshot);
      for (const [w, h] of SIZES) {
        r.resize(w, h);
        const names = outside(r.cameraState(), w / h, snapshot);
        if (names.length > 0) cut.push(`${id} ${w}x${h}: ${names.slice(0, 3).join(', ')}`);
      }
      r.dispose();
    }
    expect(cut).toEqual([]);
  }, 120_000);

  it('VIS-002 the first view keeps the direction of the first camera preset of the scene', async () => {
    for (const id of ['belt-to-sensor', 'merge-lines', 'stacker-crane-warehouse']) {
      const scene = loadScene(id);
      const authored = cameraFromPreset(scene.cameras[0]!);
      const { r } = build(scene);
      r.setSnapshot(await snapshotOf(scene));
      r.resize(720, 800);
      expect(r.cameraState().azimuthDeg).toBeCloseTo(authored.azimuthDeg, 6);
      expect(r.cameraState().polarDeg).toBeCloseTo(Math.min(authored.polarDeg, FIRST_VIEW_POLAR_MAX_DEG), 6);
      r.dispose();
    }
  });

  it('VIS-002 S3-10 a first preset that looks lower than the horizon allows opens raised to it; a higher one is kept', async () => {
    for (const id of ['stacker-crane-warehouse', 'three-level-lifts', 'belt-to-sensor']) {
      const scene = loadScene(id);
      const authored = cameraFromPreset(scene.cameras[0]!);
      const { r } = build(scene);
      r.setSnapshot(await snapshotOf(scene));
      r.resize(1280, 720);
      const opened = r.cameraState();
      // The top edge of the picture stays at or below the horizon.
      expect(opened.polarDeg + 45 / 2).toBeLessThanOrEqual(90 + 1e-9);
      if (authored.polarDeg > FIRST_VIEW_POLAR_MAX_DEG) expect(opened.polarDeg).toBeCloseTo(FIRST_VIEW_POLAR_MAX_DEG, 9);
      else expect(opened.polarDeg).toBeCloseTo(authored.polarDeg, 6);
      // Choosing the first preset again opens the same raised view; another preset keeps its authored framing.
      r.setCameraAnimation?.(false);
      r.orbit(20, 0);
      r.setCameraPreset(scene.cameras[0]!.name);
      expect(r.cameraState().polarDeg).toBeCloseTo(opened.polarDeg, 6);
      if (scene.cameras[1]) {
        r.setCameraPreset(scene.cameras[1].name);
        expect(r.cameraState().polarDeg).toBeCloseTo(cameraFromPreset(scene.cameras[1]).polarDeg, 6);
      }
      r.dispose();
    }
  });

  it('VIS-002 a resize refits while the person has not moved the camera, and leaves it alone after an orbit', async () => {
    const scene = loadScene('merge-lines');
    const snapshot = await snapshotOf(scene);
    const { r } = build(scene);
    r.setSnapshot(snapshot);
    r.resize(1920, 1080);
    const wide = r.cameraState();
    r.resize(480, 640);
    expect(r.cameraState().distance).toBeGreaterThan(wide.distance);
    expect(outside(r.cameraState(), 480 / 640, snapshot)).toEqual([]);
    r.orbit(10, 0);
    const moved = r.cameraState();
    r.resize(1920, 1080);
    expect(r.cameraState()).toEqual(moved);
    r.dispose();
  });

  it('VIS-002 Fit scene refits from the current viewing direction and a resize refits again after it', async () => {
    const scene = loadScene('merge-lines');
    const snapshot = await snapshotOf(scene);
    const { r } = build(scene);
    r.setCameraAnimation?.(false);
    r.setSnapshot(snapshot);
    r.resize(1280, 720);
    r.orbit(40, 10);
    r.zoom(4);
    r.pan(5, 5);
    const before = r.cameraState();
    expect(outside(before, 1280 / 720, snapshot).length).toBeGreaterThan(0);
    r.fitScene?.();
    runFrame();
    const after = r.cameraState();
    expect(after.azimuthDeg).toBeCloseTo(before.azimuthDeg, 6);
    expect(after.polarDeg).toBeCloseTo(before.polarDeg, 6);
    expect(outside(after, 1280 / 720, snapshot)).toEqual([]);
    r.resize(480, 640);
    expect(outside(r.cameraState(), 480 / 640, snapshot)).toEqual([]);
    r.dispose();
  });

  it('VIS-002 another named preset keeps its authored framing, with and without a resize', async () => {
    const scene = loadScene('three-level-lifts');
    expect(scene.cameras.length).toBeGreaterThan(1);
    const snapshot = await snapshotOf(scene);
    const { r } = build(scene);
    r.setCameraAnimation?.(false);
    r.setSnapshot(snapshot);
    const other = scene.cameras[1]!;
    r.setCameraPreset(other.name);
    runFrame();
    expect(r.cameraState()).toEqual(cameraFromPreset(other));
    r.resize(480, 640);
    expect(r.cameraState()).toEqual(cameraFromPreset(other));
    r.dispose();
  });
});

describe('a part is drawn once (VIS-003)', () => {
  /** World positions of the meshes drawn for a part view. */
  const drawn = (world: { children: DrawnNode[] }) =>
    world.children.filter((c) => c.userData?.part).map((c) => [c.position.x, c.position.y, c.position.z] as V);
  const same = (a: V, b: V) => Math.hypot(...sub(a, b)) < 1e-4;

  for (const id of ['layer-palletizer', 'three-axis-palletizing', 'latch-two-sensors']) {
    it(`VIS-003 ${id}: no part view is drawn on top of an item with the same pose`, async () => {
      const scene = loadScene(id);
      const snapshot = await snapshotOf(scene);
      const twins = snapshot.parts.filter((p) => snapshot.items.some((i) => i.id === p.id && same(i.p as V, p.pose.p as V)));
      expect(twins.length).toBeGreaterThan(0); // the scene really has one
      const { r, worlds } = build(scene);
      r.setSnapshot(snapshot);
      const parts = drawn(worlds[0]!);
      const doubled = parts.filter((p) => snapshot.items.some((i) => same(i.p as V, p)));
      expect(doubled.length).toBe(0);
      expect(parts.length).toBe(snapshot.parts.length - twins.length);
      r.dispose();
    });
  }
});
