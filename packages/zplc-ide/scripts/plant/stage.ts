/**
 * The page side of the plant's real-window checks and captures (spec 012 VIS-014 to VIS-018). It runs inside an application window
 * of a development build, imported from the development server as `/scripts/plant/stage.ts`: the product's own renderer and plant
 * core, with the real three.js, draw a shipped scene on a canvas of the page, and this module reads what was drawn back from the
 * canvas. The renderer is built with a three.js whose camera, scene and WebGL renderer are recorded, so a check can project a part
 * and read the renderer's state; nothing else of three is replaced.
 *
 * Evidence level of anything measured here: the renderer and the plant core in an Electron page, outside the plant panel; a frame
 * rate is evidence only in a window with the GPU on.
 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { BodyPose, PlantCore, PlantSceneFile, PlantSnapshot } from '../../src/plant/contracts';
import { createPlantCore } from '../../src/plant/core/plantCore';
import { applyDisplayPrefs, type DisplayMode, type DisplayTarget } from '../../src/plant/view/displayModes';
import type { QualityLevel } from '../../src/plant/view/quality';
import { createRenderer, type PlantRenderer } from '../../src/plant/view/renderer';

export interface StageOptions {
  quality: QualityLevel;
  mode: DisplayMode;
  reducedMotion?: boolean;
  width: number;
  height: number;
  /** Laid out on screen at its own size (a frame-rate run); otherwise a small thumbnail that still draws at full size. */
  fullWindow?: boolean;
}

export interface Stage {
  scene: PlantSceneFile;
  core: PlantCore;
  renderer: PlantRenderer;
  canvas: HTMLCanvasElement;
  spy: { camera: THREE.PerspectiveCamera; world: THREE.Scene; gl: THREE.WebGLRenderer };
  /** Hands the core's snapshot to the renderer, as the plant panel does on each scan. */
  publish(): PlantSnapshot;
  /** Advances the plant by `ms` in steps of `stepMs`, publishing after each step. */
  run(ms: number, stepMs?: number): Promise<void>;
  dispose(): void;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const frames = (n: number): Promise<void> =>
  new Promise((resolve) => {
    let k = 0;
    const tick = () => (++k >= n ? resolve() : requestAnimationFrame(tick));
    requestAnimationFrame(tick);
  });

export async function loadScene(id: string): Promise<PlantSceneFile> {
  const text = ((await import(/* @vite-ignore */ `/plant-scenes/${id}/scene.json?raw`)) as { default: string }).default;
  return JSON.parse(text) as PlantSceneFile;
}

export async function openStage(sceneOrId: string | PlantSceneFile, options: StageOptions): Promise<Stage> {
  const scene = typeof sceneOrId === 'string' ? await loadScene(sceneOrId) : sceneOrId;
  const core = await createPlantCore(scene);
  const spy = {} as Stage['spy'];
  const T = {
    ...THREE,
    PerspectiveCamera: class extends THREE.PerspectiveCamera {
      constructor(...args: ConstructorParameters<typeof THREE.PerspectiveCamera>) {
        super(...args);
        spy.camera = this;
      }
    },
    Scene: class extends THREE.Scene {
      constructor() {
        super();
        spy.world ??= this;
      }
    },
    WebGLRenderer: class extends THREE.WebGLRenderer {
      constructor(parameters?: THREE.WebGLRendererParameters) {
        super(parameters);
        spy.gl = this;
      }
    },
  } as unknown as typeof THREE;
  const canvas = document.createElement('canvas');
  canvas.width = options.width;
  canvas.height = options.height;
  canvas.style.cssText = options.fullWindow
    ? `position:fixed;left:0;top:0;width:${options.width}px;height:${options.height}px;z-index:99999`
    : 'position:fixed;left:0;top:0;width:320px;height:180px;z-index:99999';
  document.body.appendChild(canvas);
  // The context the renderer will get back from getContext: same attributes, plus a drawing buffer kept after each frame so
  // the check can read it whenever it likes.
  canvas.getContext('webgl2', {
    antialias: options.quality !== 'low',
    powerPreference: 'high-performance',
    preserveDrawingBuffer: !options.fullWindow,
  });
  const built = createRenderer(canvas, scene, { quality: options.quality }, T, { RoomEnvironment, RoundedBoxGeometry });
  if ('unavailable' in built) throw new Error(`${scene.name}: ${built.unavailable}`);
  const renderer = built;
  applyDisplayPrefs(renderer as PlantRenderer & DisplayTarget, { mode: options.mode, reducedMotion: options.reducedMotion ?? false });
  renderer.resize(options.width, options.height);
  const publish = () => {
    const snapshot = core.snapshot();
    renderer.setSnapshot(snapshot);
    return snapshot;
  };
  publish();
  await frames(2); // the first frame places the camera, which projections need
  return {
    scene,
    core,
    renderer,
    canvas,
    spy,
    publish,
    async run(ms, stepMs = 50) {
      for (let t = 0; t < ms; t += stepMs) {
        core.advance(stepMs);
        publish();
      }
      await frames(1);
    },
    dispose() {
      renderer.dispose();
      canvas.remove();
      core.dispose();
    },
  };
}

/** Waits for every texture the renderer asked for, then draws a fresh frame (of `snapshot`, else the core's) and returns its pixels. */
export async function draw(stage: Stage, snapshot?: PlantSnapshot): Promise<ImageData> {
  await stage.renderer.ready?.();
  if (snapshot) stage.renderer.setSnapshot(snapshot);
  else stage.publish();
  await frames(3);
  const copy = document.createElement('canvas');
  copy.width = stage.canvas.width;
  copy.height = stage.canvas.height;
  const context = copy.getContext('2d', { willReadFrequently: true })!;
  context.drawImage(stage.canvas, 0, 0);
  return context.getImageData(0, 0, copy.width, copy.height);
}

/** The drawn object of a part view: the renderer tags it with the view's id (older renderers: its catalogue id and position). */
export function partObject(stage: Stage, id: string): THREE.Object3D | undefined {
  const view = stage.core.snapshot().parts.find((p) => p.id === id);
  let found: THREE.Object3D | undefined;
  stage.spy.world.traverse((o) => {
    if (found) return;
    const data = o.userData as { id?: string; part?: string };
    if (data.id === id) found = o;
    else if (!data.id && view && data.part === view.part && o.position.distanceTo(new THREE.Vector3(...view.pose.p)) < 1e-6) found = o;
  });
  return found;
}

/** Canvas pixel of a world point, or null behind the camera. */
export function project(stage: Stage, point: THREE.Vector3): [number, number] | null {
  const { camera } = stage.spy;
  camera.updateMatrixWorld(true);
  const view = point.clone().applyMatrix4(camera.matrixWorldInverse);
  if (view.z >= -camera.near) return null;
  const ndc = point.clone().project(camera);
  return [((ndc.x + 1) / 2) * stage.canvas.width, ((1 - ndc.y) / 2) * stage.canvas.height];
}

/** The projected box of a part's drawn object on the canvas, clipped to it. */
export function partRect(stage: Stage, id: string): Rect | null {
  const object = partObject(stage, id);
  if (!object) return null;
  stage.spy.world.updateMatrixWorld(true);
  return boxRect(stage, new THREE.Box3().setFromObject(object));
}

/** The projected box of a world box on the canvas, clipped to it; null when no corner is in front of the camera. */
export function boxRect(stage: Stage, box: THREE.Box3): Rect | null {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const x of [box.min.x, box.max.x])
    for (const y of [box.min.y, box.max.y])
      for (const z of [box.min.z, box.max.z]) {
        const p = project(stage, new THREE.Vector3(x, y, z));
        if (p) [xs[xs.length], ys[ys.length]] = p;
      }
  if (xs.length === 0) return null;
  const x0 = Math.max(0, Math.floor(Math.min(...xs)));
  const y0 = Math.max(0, Math.floor(Math.min(...ys)));
  const x1 = Math.min(stage.canvas.width, Math.ceil(Math.max(...xs)));
  const y1 = Math.min(stage.canvas.height, Math.ceil(Math.max(...ys)));
  return x1 > x0 && y1 > y0 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
}

/** The share of the pixels of `rect` that differ between two frames (any channel by more than `threshold` of 255). */
export function diffFraction(a: ImageData, b: ImageData, rect: Rect, threshold = 8): number {
  let differ = 0;
  for (let y = rect.y; y < rect.y + rect.h; y++)
    for (let x = rect.x; x < rect.x + rect.w; x++) {
      const i = (y * a.width + x) * 4;
      if (
        Math.abs(a.data[i]! - b.data[i]!) > threshold ||
        Math.abs(a.data[i + 1]! - b.data[i + 1]!) > threshold ||
        Math.abs(a.data[i + 2]! - b.data[i + 2]!) > threshold
      )
        differ++;
    }
  return differ / (rect.w * rect.h);
}

/** Hue (degrees), saturation and lightness (0..1) of an sRGB colour. */
export function hsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const [R, G, B] = [r / 255, g / 255, b / 255];
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === R ? ((G - B) / d) % 6 : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
  return { h: (h * 60 + 360) % 360, s, l };
}

/** The median colour of a 7 x 7 patch around the projected centre of an item's top face. */
export function itemColour(stage: Stage, image: ImageData, item: BodyPose): { rgb: [number, number, number]; at: [number, number] } | null {
  const at = project(stage, new THREE.Vector3(item.p[0], item.p[1] + item.size[1] / 2, item.p[2]));
  if (!at) return null;
  const [cx, cy] = at.map(Math.round) as [number, number];
  const channels: [number[], number[], number[]] = [[], [], []];
  for (let y = cy - 3; y <= cy + 3; y++)
    for (let x = cx - 3; x <= cx + 3; x++) {
      if (x < 0 || y < 0 || x >= image.width || y >= image.height) continue;
      const i = (y * image.width + x) * 4;
      for (let c = 0; c < 3; c++) channels[c]!.push(image.data[i + c]!);
    }
  if (channels[0].length === 0) return null;
  const median = (v: number[]) => v.sort((p, q) => p - q)[Math.floor(v.length / 2)]!;
  return { rgb: [median(channels[0]), median(channels[1]), median(channels[2])], at };
}

/** What the renderer is set to draw with (VIS-015): tone mapping, colour space, shadows, the environment and the maps of each material. */
export function rendererState(stage: Stage): {
  toneMapping: string;
  outputColorSpace: string;
  shadows: { enabled: boolean; type: string; radius: number | null; mapSize: number | null };
  environment: boolean;
  materials: Array<{ name: string; maps: string[] }>;
} {
  const { gl, world } = stage.spy;
  const toneNames: Record<number, string> = {
    [THREE.NoToneMapping]: 'none',
    [THREE.LinearToneMapping]: 'linear',
    [THREE.ReinhardToneMapping]: 'reinhard',
    [THREE.CineonToneMapping]: 'cineon',
    [THREE.ACESFilmicToneMapping]: 'aces-filmic',
    [THREE.AgXToneMapping]: 'agx',
    [THREE.NeutralToneMapping]: 'neutral',
  };
  const shadowNames: Record<number, string> = {
    [THREE.BasicShadowMap]: 'basic',
    [THREE.PCFShadowMap]: 'pcf',
    [THREE.PCFSoftShadowMap]: 'pcf-soft',
    [THREE.VSMShadowMap]: 'vsm',
  };
  let light: THREE.DirectionalLight | undefined;
  const materials = new Map<string, string[]>();
  world.traverse((o) => {
    if ((o as THREE.DirectionalLight).isDirectionalLight) light = o as THREE.DirectionalLight;
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.visible) return;
    for (const m of [mesh.material].flat() as THREE.MeshStandardMaterial[]) {
      const maps = (['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'envMap'] as const).filter((k) => Boolean(m[k]));
      const name = m.name || `${m.type}#${m.id}`;
      materials.set(name, maps);
    }
  });
  return {
    toneMapping: toneNames[gl.toneMapping] ?? String(gl.toneMapping),
    outputColorSpace: String(gl.outputColorSpace),
    shadows: {
      enabled: gl.shadowMap.enabled && Boolean(light?.castShadow),
      type: shadowNames[gl.shadowMap.type] ?? String(gl.shadowMap.type),
      radius: light?.castShadow ? light.shadow.radius : null,
      mapSize: light?.castShadow ? light.shadow.mapSize.x : null,
    },
    environment: Boolean(world.environment),
    materials: [...materials].map(([name, maps]) => ({ name, maps })).sort((p, q) => p.name.localeCompare(q.name)),
  };
}

/** A PNG data URL of the image, for a capture written by the script that drives the page. */
export function pngOf(image: ImageData): string {
  const c = document.createElement('canvas');
  c.width = image.width;
  c.height = image.height;
  c.getContext('2d')!.putImageData(image, 0, 0);
  return c.toDataURL('image/png');
}
