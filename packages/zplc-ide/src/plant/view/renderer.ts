import type * as THREE_NS from 'three';
import type { PlantSceneFile, PlantSnapshot } from '../contracts';
import { cameraFromPreset, cameraPosition, orbitCamera, panCamera, zoomCamera, type CameraState } from './camera';
import { instanceColors, instanceMatrices, partShape, type ShapeSpec } from './geometry';
import type { Palette } from './displayModes';
import { chooseInitialQuality, qualitySettings, type QualityLevel } from './quality';

type Three = typeof THREE_NS;
export type ContextEvent = 'lost' | 'restored' | 'unavailable';

export interface PlantRenderer {
  readonly webgl2: boolean;
  setSnapshot(snapshot: PlantSnapshot): void;
  setQuality(level: QualityLevel): void;
  setCameraPreset(name: string): void;
  /** Colours for floor, belts, items and sensors (VIS-009). */
  setPalette?(palette: Palette): void;
  /** Off means preset changes jump instead of easing (reduced motion, VIS-009). */
  setCameraAnimation?(enabled: boolean): void;
  /** The orbit camera as it is now; the editor turns a pointer into a ground point with it (SCN-008). */
  cameraState(): CameraState;
  /** A translucent marker at a ground point while a part is dragged (SCN-008); null removes it. */
  setGhost?(position: readonly [number, number, number] | null): void;
  orbit(dxDeg: number, dyDeg: number): void;
  pan(dx: number, dz: number): void;
  zoom(factor: number): void;
  onContext(listener: (event: ContextEvent) => void): () => void;
  fps(): { current: number; p5: number };
  resize(width: number, height: number): void;
  dispose(): void;
}

export interface RendererOptions {
  quality?: QualityLevel;
  /** How long a lost context may stay lost before `unavailable` is reported. */
  restoreTimeoutMs?: number;
}

/** Context loss and restoration (VIS-006). `preventDefault` on the loss lets the browser restore the context. */
export function watchContext(
  canvas: Pick<HTMLCanvasElement, 'addEventListener' | 'removeEventListener'>,
  emit: (event: ContextEvent) => void,
  restoreTimeoutMs = 3000,
): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const onLost = (e: Event): void => {
    e.preventDefault();
    emit('lost');
    clearTimeout(timer);
    timer = setTimeout(() => emit('unavailable'), restoreTimeoutMs);
  };
  const onRestored = (): void => {
    clearTimeout(timer);
    emit('restored');
  };
  canvas.addEventListener('webglcontextlost', onLost);
  canvas.addEventListener('webglcontextrestored', onRestored);
  return () => {
    clearTimeout(timer);
    canvas.removeEventListener('webglcontextlost', onLost);
    canvas.removeEventListener('webglcontextrestored', onRestored);
  };
}

/** Frame timing over a sliding window: current rate and the rate of the slowest 5 % of frames. */
export function createFrameStats(window = 120): { frame(nowMs: number): void; fps(): { current: number; p5: number } } {
  const deltas: number[] = [];
  let last: number | null = null;
  return {
    frame(nowMs) {
      if (last !== null && nowMs > last) {
        deltas.push(nowMs - last);
        if (deltas.length > window) deltas.shift();
      }
      last = nowMs;
    },
    fps() {
      if (deltas.length === 0) return { current: 0, p5: 0 };
      const sorted = [...deltas].sort((a, b) => a - b);
      const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? 0;
      const mean = deltas.reduce((a, b) => a + b, 0) / deltas.length;
      return { current: 1000 / mean, p5: 1000 / p95 };
    },
  };
}

function buildGeometry(THREE: Three, spec: ShapeSpec): THREE_NS.BufferGeometry {
  switch (spec.shape) {
    case 'box':
      return new THREE.BoxGeometry(...spec.size);
    case 'cylinder': {
      const g = new THREE.CylinderGeometry(spec.radius, spec.radius, spec.length, 16);
      g.rotateZ(Math.PI / 2); // axis along X, like the belt it belongs to
      return g;
    }
    case 'curve': {
      const a = (spec.angleDeg * Math.PI) / 180;
      const shape = new THREE.Shape();
      shape.absarc(0, 0, spec.outerRadius, 0, a, false);
      shape.absarc(0, 0, spec.innerRadius, a, 0, true);
      const g = new THREE.ExtrudeGeometry(shape, { depth: spec.height, bevelEnabled: false });
      g.rotateX(-Math.PI / 2);
      return g;
    }
  }
}

/** Fraction of the remaining distance a preset change covers each frame while camera animation is on. */
const EASE = 0.2;
const near = (a: CameraState, b: CameraState): boolean =>
  Math.abs(a.azimuthDeg - b.azimuthDeg) < 0.05 &&
  Math.abs(a.polarDeg - b.polarDeg) < 0.05 &&
  Math.abs(a.distance - b.distance) < 0.005 &&
  a.target.every((v, i) => Math.abs(v - (b.target[i] ?? 0)) < 0.005);
const easeToward = (a: CameraState, b: CameraState): CameraState => ({
  azimuthDeg: a.azimuthDeg + (b.azimuthDeg - a.azimuthDeg) * EASE,
  polarDeg: a.polarDeg + (b.polarDeg - a.polarDeg) * EASE,
  distance: a.distance + (b.distance - a.distance) * EASE,
  target: a.target.map((v, i) => v + ((b.target[i] ?? 0) - v) * EASE) as unknown as CameraState['target'],
});

const PART_COLORS: Readonly<Record<string, number>> = {
  belt: 0x4b5563,
  roller: 0x6b7280,
  curve: 0x4b5563,
  blade: 0xb45309,
  sensor: 0x15803d,
};

function probeGpu(): { webgl2: boolean; rendererString: string; maxTextureSize: number } | null {
  if (typeof document === 'undefined') return null;
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return { webgl2: false, rendererString: '', maxTextureSize: 0 };
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const rendererString = String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
    const maxTextureSize = Number(gl.getParameter(gl.MAX_TEXTURE_SIZE));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return { webgl2: true, rendererString, maxTextureSize };
  } catch {
    return { webgl2: false, rendererString: '', maxTextureSize: 0 };
  }
}

/**
 * Builds the renderer on `canvas`. Never throws for a missing GPU: it returns `{ unavailable }` so the
 * core, the session and grading keep running (VIS-006). `three` is injected so this module has no static
 * runtime dependency on it; `loadRenderer` imports it lazily.
 */
export function createRenderer(
  canvas: HTMLCanvasElement,
  scene: PlantSceneFile,
  options: RendererOptions,
  THREE: Three,
): PlantRenderer | { unavailable: string } {
  const probe = options.quality ? null : probeGpu();
  if (probe && !probe.webgl2) return { unavailable: 'WebGL 2 is not available' };
  let quality: QualityLevel = options.quality ?? (probe ? chooseInitialQuality(probe) : 'medium');

  let gl: WebGL2RenderingContext | null = null;
  try {
    gl = canvas.getContext('webgl2', { antialias: qualitySettings(quality).antialias, powerPreference: 'high-performance' });
  } catch {
    gl = null;
  }
  if (!gl) return { unavailable: 'WebGL 2 is not available' };

  let renderer: THREE_NS.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, context: gl });
  } catch (error) {
    return { unavailable: `The graphics context could not be created: ${error instanceof Error ? error.message : String(error)}` };
  }

  const world = new THREE.Scene();
  world.background = new THREE.Color(0xe5e7eb);
  const camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 1000);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x9ca3af, 1.1);
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(6, 12, 8);
  world.add(hemi, sun);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: 0xf3f4f6, roughness: 1 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  world.add(floor);

  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const itemMaterial = new THREE.MeshStandardMaterial({ roughness: 0.8 });
  let capacity = 256;
  let items = new THREE.InstancedMesh(unitBox, itemMaterial, capacity);
  items.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  items.frustumCulled = false;
  items.castShadow = true;
  items.count = 0;
  world.add(items);

  const partMeshes = new Map<string, { mesh: THREE_NS.Mesh; key: string }>();
  const partMaterials = new Map<string, THREE_NS.MeshStandardMaterial>();
  const geometries = new Map<string, THREE_NS.BufferGeometry>();
  const geometryFor = (spec: ShapeSpec, key: string): THREE_NS.BufferGeometry => {
    let g = geometries.get(key);
    if (!g) {
      g = buildGeometry(THREE, spec);
      geometries.set(key, g);
    }
    return g;
  };
  const materialFor = (part: string): THREE_NS.MeshStandardMaterial => {
    let m = partMaterials.get(part);
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color: partColor(part), roughness: 0.7 });
      partMaterials.set(part, m);
    }
    return m;
  };

  let camState: CameraState = cameraFromPreset(scene.cameras[0] ?? { name: 'default', position: [6, 6, 8], target: [0, 0, 0] });
  let goal: CameraState | null = null; // a preset the camera is still easing toward
  let animate = true;
  let palette: Palette | null = null;
  let lastItems: PlantSnapshot['items'] = [];
  const partColor = (part: string): number => {
    if (palette && part === 'sensor') return palette.sensorOn;
    if (palette && part !== 'blade') return palette.belt;
    return PART_COLORS[part] ?? 0x9ca3af;
  };
  const paintItems = (): void => {
    const colors = instanceColors(lastItems);
    for (let i = 0; i < lastItems.length; i++)
      if (palette) items.setColorAt(i, new THREE.Color(palette.item));
      else items.setColorAt(i, new THREE.Color(colors[i * 3], colors[i * 3 + 1], colors[i * 3 + 2]));
    if (items.instanceColor) items.instanceColor.needsUpdate = true;
  };
  let width = canvas.width || 1280;
  let height = canvas.height || 720;
  let dirty = true;
  let disposed = false;
  let paused = false;
  let raf = 0;
  const stats = createFrameStats();
  const listeners = new Set<(event: ContextEvent) => void>();

  const applyQuality = (): void => {
    const s = qualitySettings(quality);
    renderer.shadowMap.enabled = s.shadows;
    sun.castShadow = s.shadows;
    if (s.shadows) sun.shadow.mapSize.set(s.shadowMapSize, s.shadowMapSize);
    renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, s.pixelRatioCap));
    renderer.setSize(width, height, false);
    itemMaterial.needsUpdate = true;
    partMaterials.forEach((m) => {
      m.needsUpdate = true;
    });
    dirty = true;
  };
  applyQuality();

  const stopWatching = watchContext(
    canvas,
    (event) => {
      paused = event === 'lost' || event === 'unavailable';
      dirty = true;
      listeners.forEach((l) => l(event));
    },
    options.restoreTimeoutMs,
  );

  const frame = (now: number): void => {
    if (disposed) return;
    raf = requestAnimationFrame(frame);
    if (paused || !dirty) return;
    dirty = false;
    if (goal) {
      camState = animate && !near(camState, goal) ? easeToward(camState, goal) : goal;
      if (camState === goal) goal = null;
      else dirty = true;
    }
    const [cx, cy, cz] = cameraPosition(camState);
    camera.position.set(cx, cy, cz);
    camera.lookAt(...camState.target);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.render(world, camera);
    stats.frame(now);
  };
  raf = requestAnimationFrame(frame);

  const growItems = (needed: number): void => {
    while (capacity < needed) capacity *= 2;
    world.remove(items);
    items.dispose();
    items = new THREE.InstancedMesh(unitBox, itemMaterial, capacity);
    items.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    items.frustumCulled = false;
    items.castShadow = true;
    world.add(items);
  };

  let ghost: THREE_NS.Mesh | undefined;
  return {
    webgl2: true,
    cameraState: () => camState,
    setGhost(position) {
      if (disposed) return;
      if (position && !ghost) {
        ghost = new THREE.Mesh(unitBox, new THREE.MeshStandardMaterial({ color: 0x2563eb, transparent: true, opacity: 0.45 }));
        ghost.scale.set(1, 0.5, 1);
        world.add(ghost);
      }
      if (ghost) {
        ghost.visible = position !== null;
        if (position) ghost.position.set(position[0], 0.25, position[2]);
      }
      dirty = true;
    },
    setSnapshot(snapshot) {
      if (disposed) return;
      if (snapshot.items.length > capacity) growItems(snapshot.items.length);
      instanceMatrices(snapshot.items, items.instanceMatrix.array as Float32Array);
      lastItems = snapshot.items;
      paintItems();
      items.count = snapshot.items.length;
      items.instanceMatrix.needsUpdate = true;

      const seen = new Set<string>();
      for (const view of snapshot.parts) {
        seen.add(view.id);
        const spec = partShape(view);
        const key = JSON.stringify(spec);
        let entry = partMeshes.get(view.id);
        if (!entry) {
          const mesh = new THREE.Mesh(geometryFor(spec, key), materialFor(view.part));
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          world.add(mesh);
          entry = { mesh, key };
          partMeshes.set(view.id, entry);
        } else if (entry.key !== key) {
          entry.mesh.geometry = geometryFor(spec, key);
          entry.key = key;
        }
        entry.mesh.position.set(...view.pose.p);
        entry.mesh.quaternion.set(...view.pose.q);
      }
      for (const [id, entry] of partMeshes) {
        if (!seen.has(id)) {
          world.remove(entry.mesh);
          partMeshes.delete(id);
        }
      }
      dirty = true;
    },
    setQuality(level) {
      // ponytail: antialiasing is a context attribute and cannot change on a live canvas; it applies at creation.
      quality = level;
      applyQuality();
    },
    setCameraPreset(name) {
      const preset = scene.cameras.find((c) => c.name === name);
      if (preset) {
        goal = cameraFromPreset(preset);
        if (!animate) camState = goal;
        dirty = true;
      }
    },
    orbit(dx, dy) {
      goal = null;
      camState = orbitCamera(camState, dx, dy);
      dirty = true;
    },
    pan(dx, dz) {
      goal = null;
      camState = panCamera(camState, dx, dz);
      dirty = true;
    },
    zoom(factor) {
      goal = null;
      camState = zoomCamera(camState, factor);
      dirty = true;
    },
    setPalette(next) {
      if (disposed) return;
      palette = next;
      world.background = new THREE.Color(next.floor);
      (floor.material as THREE_NS.MeshStandardMaterial).color.set(next.floor);
      partMaterials.forEach((m, part) => m.color.set(partColor(part)));
      paintItems();
      dirty = true;
    },
    setCameraAnimation(enabled) {
      animate = enabled;
      if (!enabled && goal) camState = goal;
      if (!enabled) goal = null;
      dirty = true;
    },
    onContext(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    fps: () => stats.fps(),
    resize(w, h) {
      width = Math.max(1, Math.floor(w));
      height = Math.max(1, Math.floor(h));
      renderer.setSize(width, height, false);
      dirty = true;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(raf);
      stopWatching();
      listeners.clear();
      geometries.forEach((g) => g.dispose());
      partMaterials.forEach((m) => m.dispose());
      (ghost?.material as THREE_NS.Material | undefined)?.dispose();
      unitBox.dispose();
      itemMaterial.dispose();
      items.dispose();
      renderer.dispose();
    },
  };
}

/** Loads three on demand (the only reach into it) and builds the renderer. */
export async function loadRenderer(
  canvas: HTMLCanvasElement,
  scene: PlantSceneFile,
  options: RendererOptions = {},
): Promise<PlantRenderer | { unavailable: string }> {
  try {
    const THREE = await import('three');
    return createRenderer(canvas, scene, options, THREE);
  } catch (error) {
    return { unavailable: `The 3D view could not be loaded: ${error instanceof Error ? error.message : String(error)}` };
  }
}
