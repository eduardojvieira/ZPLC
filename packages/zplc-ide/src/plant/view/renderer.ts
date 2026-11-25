import type * as THREE_NS from 'three';
import type { BodyPose, PartView, PlantSceneFile, PlantSnapshot } from '../contracts';
import {
  cameraFromPreset,
  cameraPosition,
  fitCamera,
  FOV_DEG,
  orbitCamera,
  panCamera,
  zoomCamera,
  type Bounds,
  type CameraState,
} from './camera';
import { paletteFor, type Palette } from './displayModes';
import {
  crateWallMatrices,
  instanceMatrices,
  itemSkin,
  itemToneOf,
  OUTLINED_PARTS,
  partDecor,
  partShape,
  snapshotBounds,
  type Decor,
  type ShapeSpec,
} from './geometry';
import { epoxyFloor, partColour, roleLook, type Role, type Skin } from './look';
import { controlStation } from './controlStations';
import { partModel, sensorMount, type Piece, type PieceShape, type Section } from './models';
import { chooseInitialQuality, lookFor, qualitySettings, type Look, type QualityLevel } from './quality';
import { MAP_NAMES, textureUrl, TILE_M, type MapName } from './textures';

type Three = typeof THREE_NS;
export type ContextEvent = 'lost' | 'restored' | 'unavailable';

export interface PlantRenderer {
  readonly webgl2: boolean;
  setSnapshot(snapshot: PlantSnapshot): void;
  setQuality(level: QualityLevel): void;
  setCameraPreset(name: string): void;
  /** Shows the whole scene from the current viewing direction (VIS-002). Until a person moves the camera, a resize does the same. */
  fitScene?(): void;
  /** Colours of the floor, the parts and the items, and the flat high-contrast look (VIS-009, VIS-018). */
  setPalette?(palette: Palette): void;
  /** Off means preset changes jump instead of easing, and a running belt shows a still direction mark (reduced motion, VIS-009). */
  setCameraAnimation?(enabled: boolean): void;
  /** The orbit camera as it is now; the editor turns a pointer into a ground point with it (SCN-008). */
  cameraState(): CameraState;
  /** A translucent marker at a ground point while a part is dragged (SCN-008); null removes it. */
  setGhost?(position: readonly [number, number, number] | null): void;
  /** Resolves once every texture asked for so far has loaded or failed; a capture waits for it before it reads a frame. */
  ready?(): Promise<void>;
  /** The id of the part view under a pointer at normalised device coordinates (-1..1, y up), or null (VIS-003). */
  pick?(ndc: readonly [number, number]): string | null;
  /** Draws a box around one part view, or none (VIS-003: the part named on hover and on focus). */
  setHighlight?(id: string | null): void;
  /** Where the top of a part view is on the canvas, as fractions of its width and height from the top left, or null. */
  anchorOf?(id: string): readonly [number, number] | null;
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

/** three's own add-ons (three/examples/jsm), loaded with it; without them there is no environment map and no bevel. */
export interface RendererAddons {
  RoomEnvironment?: new () => THREE_NS.Scene;
  RoundedBoxGeometry?: new (width?: number, height?: number, depth?: number, segments?: number, radius?: number) => THREE_NS.BufferGeometry;
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
      g.translate(0, -spec.height / 2, 0); // centred on the pose, like the box it replaces
      return g;
    }
  }
}

/** How much light reaches the faces inside the slots of a profile: a slot reads as a dark groove, as on a real profile (VIS-014). */
const RECESS_SHADE = 0.3;

/**
 * Vertex colours for an extrusion still in three's frame (section in x and y, ends first): the side faces that lie inside the box
 * of the section are dark, the outer faces and the two ends in full. A material draws them when its `vertexColors` is on.
 */
function shadeRecesses(THREE: Three, g: THREE_NS.BufferGeometry, section: Section): void {
  const pos = g.getAttribute('position');
  if (!pos) return;
  const a = Math.max(...section.map((p) => Math.abs(p[0])));
  const b = Math.max(...section.map((p) => Math.abs(p[1])));
  const ends = g.groups[0]?.count ?? 0;
  const colour = new Float32Array(pos.count * 3).fill(1);
  for (let i = ends; i < pos.count; i++)
    if (Math.min(a - Math.abs(pos.getX(i)), b - Math.abs(pos.getY(i))) > 1e-6) colour.fill(RECESS_SHADE, 3 * i, 3 * i + 3);
  g.setAttribute('color', new THREE.BufferAttribute(colour, 3));
}

/** The geometry of a piece of a composed model; `sharp` drops the bevel (the outline of high contrast follows the plain box). */
export function pieceGeometry(THREE: Three, addons: RendererAddons, shape: PieceShape, sharp = false): THREE_NS.BufferGeometry {
  if (shape.kind === 'box') {
    const [w, h, d] = shape.size;
    const bevel = Math.min(shape.bevel, w / 2.5, h / 2.5, d / 2.5);
    return !sharp && bevel > 0 && addons.RoundedBoxGeometry
      ? new addons.RoundedBoxGeometry(w, h, d, 2, bevel)
      : new THREE.BoxGeometry(w, h, d);
  }
  if (shape.kind === 'extrusion') {
    // three extrudes the outline (x, y) along +z; turned so the section's (a, b) lies across the axis as `Section` says.
    const outline = new THREE.Shape();
    shape.section.forEach(([a, b], i) => (i === 0 ? outline.moveTo(a, b) : outline.lineTo(a, b)));
    const g = new THREE.ExtrudeGeometry(outline, { depth: shape.length, bevelEnabled: false });
    if (shape.recessDark) shadeRecesses(THREE, g, shape.section);
    g.translate(0, 0, -shape.length / 2);
    if (shape.axis === 'x') g.rotateY(-Math.PI / 2);
    else if (shape.axis === 'y') g.rotateX(Math.PI / 2);
    return g;
  }
  const g = new THREE.CylinderGeometry(shape.radius, shape.radius, shape.length, shape.sides ?? 20);
  if (shape.axis === 'x') g.rotateZ(Math.PI / 2);
  else if (shape.axis === 'z') g.rotateX(Math.PI / 2);
  return g;
}

/**
 * Texture coordinates in metres from the position and the facing of each vertex (a box projection), so a texture keeps its scale on
 * a piece of any size; the repeat of each texture set turns metres into tiles.
 */
function projectUv(THREE: Three, g: THREE_NS.BufferGeometry): void {
  const pos = g.getAttribute('position');
  const nor = g.getAttribute('normal');
  if (!pos || !nor) return;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const [nx, ny, nz] = [Math.abs(nor.getX(i)), Math.abs(nor.getY(i)), Math.abs(nor.getZ(i))];
    const [u, v] = ny >= nx && ny >= nz ? [pos.getX(i), pos.getZ(i)] : nx >= nz ? [pos.getZ(i), pos.getY(i)] : [pos.getX(i), pos.getY(i)];
    uv[2 * i] = u;
    uv[2 * i + 1] = v;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
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

/** Pushes filled faces back a little so the outline drawn on them (VIS-009) does not flicker. */
const NO_Z_FIGHT = { polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 } as const;

/** Colours of the boxes drawn inside a part: the liquid, and each lamp lit and dark. Shape differs too (VIS-003). */
const DECOR_COLORS: Readonly<Record<string, number>> = {
  'fill:true': 0x2563eb,
  'red:true': 0xef4444,
  'red:false': 0x7f1d1d,
  'amber:true': 0xf59e0b,
  'amber:false': 0x78350f,
  'green:true': 0x22c55e,
  'green:false': 0x14532d,
  'jaw:true': 0xe5e7eb,
};

/** The light of the scene: direction of the sun, and intensities with and without the environment map (VIS-015). */
const SUN_DIRECTION = [0.45, 0.8, 0.4] as const;
const LIGHTS = {
  flat: { hemi: Math.PI, sun: 0, sky: 0xffffff, ground: 0xffffff },
  environment: { hemi: 0.1, sun: 2.2, sky: 0xffffff, ground: 0x8a8f98, environment: 0.45 },
  plain: { hemi: 1.6, sun: 1.9, sky: 0xffffff, ground: 0x8a8f98 },
} as const;
/** Where the fog starts and ends, in metres from the camera: the floor fades into the background before its edge. */
const FOG = { near: 18, far: 70 } as const;

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

/** The mean linear colour of an image (its base colour), so a tint can aim at a colour whatever the texture's own colour is. */
function meanColour(image: unknown, out: THREE_NS.Color): void {
  if (typeof document === 'undefined' || !image) return;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 32;
  const context = canvas.getContext('2d');
  if (!context) return;
  context.drawImage(image as CanvasImageSource, 0, 0, 32, 32);
  const data = context.getImageData(0, 0, 32, 32).data;
  const linear = (v: number) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  let [r, g, b] = [0, 0, 0];
  for (let i = 0; i < data.length; i += 4) {
    r += linear(data[i]!);
    g += linear(data[i + 1]!);
    b += linear(data[i + 2]!);
  }
  const n = data.length / 4;
  out.setRGB(r / n, g / n, b / n);
}

interface TextureSet {
  /** The maps whose image has loaded; a map that failed to load is left out, so the surface falls back to its plain colour. */
  maps: Partial<Record<MapName, THREE_NS.Texture>>;
  /** Mean linear colour of the base colour map; white until it has loaded. */
  mean: THREE_NS.Color;
  loaded: boolean;
}

interface ItemLayer {
  skin: 'cardboard' | 'plastic';
  material: THREE_NS.MeshStandardMaterial;
  geometry: THREE_NS.BufferGeometry;
  mesh: THREE_NS.InstancedMesh;
  capacity: number;
  items: BodyPose[];
  outline?: THREE_NS.InstancedMesh;
}

interface PartEntry {
  object: THREE_NS.Object3D;
  /** The shape key of a single-shape part, or 'model' for a composed one. */
  key: string;
  decor: Map<string, THREE_NS.Mesh>;
  pieces: Map<string, THREE_NS.Mesh>;
}

interface RoleMaterial {
  material: THREE_NS.MeshStandardMaterial;
  role: Role;
  part: string;
  /** The belt whose band this material draws: its maps are its own, so they scroll with that belt. */
  owner?: string;
}

/**
 * Builds the renderer on `canvas`. Never throws for a missing GPU: it returns `{ unavailable }` so the core, the session and grading
 * keep running (VIS-006). `three` is injected so this module has no static runtime dependency on it; `loadRenderer` imports it lazily.
 */
export function createRenderer(
  canvas: HTMLCanvasElement,
  scene: PlantSceneFile,
  options: RendererOptions,
  THREE: Three,
  addons: RendererAddons = {},
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

  let palette: Palette = paletteFor({ mode: 'light', reducedMotion: false });
  let look: Look = lookFor(quality, palette.mode);
  const world = new THREE.Scene();
  world.background = new THREE.Color(palette.floor);
  world.fog = new THREE.Fog(palette.floor, FOG.near, FOG.far);
  const camera = new THREE.PerspectiveCamera(FOV_DEG, 16 / 9, 0.1, 1000);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x9ca3af, 1.1);
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(6, 12, 8);
  world.add(hemi, sun);
  const floorGeometry = new THREE.PlaneGeometry(200, 200);
  const floorMaterial = new THREE.MeshStandardMaterial({ color: palette.floor, roughness: 0.9 });
  floorMaterial.name = 'floor';
  floorMaterial.envMapIntensity = 0.3; // a matt floor: the room it reflects must not lift a dark floor to grey
  const floor = new THREE.Mesh(floorGeometry, floorMaterial);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  world.add(floor);

  // Textures (VIS-015): one set per surface, loaded the first time a textured look needs it; each map scales in metres.
  const textureSets = new Map<Skin, TextureSet>();
  const pending = new Set<Promise<void>>();
  const uvReady = new WeakSet<THREE_NS.BufferGeometry>();
  const withUv = (g: THREE_NS.BufferGeometry): void => {
    if (uvReady.has(g)) return;
    projectUv(THREE, g);
    uvReady.add(g);
  };
  const maxAnisotropy = (): number => Math.min(look.anisotropy, renderer.capabilities?.getMaxAnisotropy?.() ?? 1);
  const textureSet = (skin: Skin): TextureSet | null => {
    const existing = textureSets.get(skin);
    if (existing) return existing;
    if (!textureUrl(skin, 'basecolor')) return null;
    const set: TextureSet = { maps: {}, mean: new THREE.Color(1, 1, 1), loaded: false };
    const loader = new THREE.TextureLoader();
    for (const name of MAP_NAMES) {
      const url = textureUrl(skin, name);
      if (!url) continue;
      const loaded = new Promise<void>((resolve) => {
        const done = (texture?: THREE_NS.Texture): void => {
          if (texture) set.maps[name] = texture;
          if (texture && name === 'basecolor') {
            meanColour(texture.image, set.mean);
            set.loaded = true;
          }
          if (!disposed) {
            paintAll();
            dirty = true;
          }
          resolve();
        };
        const texture = loader.load(url, done, undefined, () => done());
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        // Texture coordinates are metres (projectUv), the floor's included: one tile per TILE_M metres.
        texture.repeat.set(1 / TILE_M[skin], 1 / TILE_M[skin]);
        if (name === 'basecolor') texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = maxAnisotropy();
      });
      pending.add(loaded);
      void loaded.then(() => pending.delete(loaded));
    }
    textureSets.set(skin, set);
    return set;
  };
  /** The colour that, multiplied by the texture, gives `hex` on average. */
  const tinted = (hex: number, set: TextureSet | null): THREE_NS.Color => {
    const c = new THREE.Color(hex);
    if (!set) return c;
    return c.setRGB(c.r / Math.max(set.mean.r, 0.01), c.g / Math.max(set.mean.g, 0.01), c.b / Math.max(set.mean.b, 0.01));
  };
  const setMaps = (m: THREE_NS.MeshStandardMaterial, maps: Partial<Record<MapName, THREE_NS.Texture>> | null): void => {
    const next = {
      map: maps?.basecolor ?? null,
      normalMap: maps?.normal ?? null,
      roughnessMap: maps?.roughness ?? null,
      metalnessMap: maps?.metalness ?? null,
    };
    if (next.map !== m.map || next.normalMap !== m.normalMap) m.needsUpdate = true;
    Object.assign(m, next);
  };
  // A belt's band scrolls its own copies of the rubber maps (a copy shares the image, not the offset).
  const bandMaps = new Map<string, Partial<Record<MapName, THREE_NS.Texture>>>();
  const bandMapsOf = (owner: string, set: TextureSet): Partial<Record<MapName, THREE_NS.Texture>> => {
    const maps = bandMaps.get(owner) ?? {};
    bandMaps.set(owner, maps);
    for (const [name, texture] of Object.entries(set.maps) as [MapName, THREE_NS.Texture][])
      if (!maps[name]) {
        const copy = texture.clone();
        copy.needsUpdate = true;
        maps[name] = copy;
      }
    return maps;
  };

  // The environment map (VIS-015): a room generated in code by three's RoomEnvironment, prefiltered once; nothing is loaded.
  let environment: THREE_NS.Texture | null = null;
  const environmentMap = (): THREE_NS.Texture | null => {
    if (environment || !addons.RoomEnvironment) return environment;
    const pmrem = new THREE.PMREMGenerator(renderer);
    environment = pmrem.fromScene(new addons.RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    return environment;
  };

  // Items: one instanced mesh per surface (cardboard boxes, plastic workpieces), each scaled per item.
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const makeLayer = (skin: ItemLayer['skin']): ItemLayer => {
    const material = new THREE.MeshStandardMaterial({ roughness: skin === 'cardboard' ? 0.85 : 0.45, ...NO_Z_FIGHT });
    material.name = `item:${skin}`;
    // A unit box whose faces each hold one tile of the texture, rounded when the add-on is there.
    const geometry = addons.RoundedBoxGeometry ? new addons.RoundedBoxGeometry(1, 1, 1, 2, 0.04) : unitBox;
    const mesh = new THREE.InstancedMesh(geometry, material, 64);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.count = 0;
    world.add(mesh);
    return { skin, material, geometry, mesh, capacity: 64, items: [] };
  };
  const layers: ItemLayer[] = [makeLayer('cardboard'), makeLayer('plastic')];
  const cardboard = layers[0]!;
  // The four wall bars of every crate (an item drawn open, VIS-003): cardboard, matrices from `crateWallMatrices`.
  let wallCapacity = 16;
  let walls = new THREE.InstancedMesh(unitBox, cardboard.material, wallCapacity);
  walls.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  walls.frustumCulled = false;
  walls.castShadow = true;
  walls.count = 0;
  world.add(walls);
  let wallOutline: THREE_NS.InstancedMesh | undefined;
  let crates: BodyPose[] = [];

  const partEntries = new Map<string, PartEntry>();
  const decorMaterials = new Map<string, THREE_NS.MeshStandardMaterial>();
  const decorMaterial = (d: Decor): THREE_NS.MeshStandardMaterial => {
    const key = `${d.tone}:${d.lit}`;
    let m = decorMaterials.get(key);
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color: DECOR_COLORS[key] ?? 0x9ca3af, roughness: 0.5 });
      decorMaterials.set(key, m);
    }
    return m;
  };
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
  const pieceGeometries = new Map<string, THREE_NS.BufferGeometry>();
  const pieceGeometryFor = (shape: PieceShape, key: string): THREE_NS.BufferGeometry => {
    let g = pieceGeometries.get(key);
    if (!g) {
      g = pieceGeometry(THREE, addons, shape);
      pieceGeometries.set(key, g);
    }
    return g;
  };
  const glass = (part: string) => part === 'tank' || part === 'machining-centre';
  const paintPart = (part: string, m: THREE_NS.MeshStandardMaterial): void => {
    const set = look.textures && !glass(part) ? textureSet('painted-steel') : null;
    m.color.copy(tinted(partColour(part, palette), set));
    m.metalness = look.environment ? 0.15 : 0;
    m.roughness = 0.6;
    setMaps(m, set?.maps ?? null);
  };
  const materialFor = (part: string): THREE_NS.MeshStandardMaterial => {
    let m = partMaterials.get(part);
    if (!m) {
      const see = glass(part) ? { transparent: true, opacity: 0.3, depthWrite: false } : {};
      m = new THREE.MeshStandardMaterial({ color: partColour(part, palette), roughness: 0.6, ...NO_Z_FIGHT, ...see });
      m.name = `part:${part}`;
      paintPart(part, m);
      partMaterials.set(part, m);
    }
    return m;
  };
  const roleMaterials = new Map<string, RoleMaterial>();
  const paintRole = (entry: RoleMaterial): void => {
    const rl = roleLook(entry.role, entry.part, palette);
    const m = entry.material;
    m.roughness = rl.roughness;
    m.metalness = look.environment ? rl.metalness : 0;
    if (m.transparent !== rl.opacity < 1) m.needsUpdate = true;
    m.transparent = rl.opacity < 1;
    m.opacity = rl.opacity;
    m.depthWrite = rl.opacity >= 1;
    if (rl.glow) {
      m.color.set(0x000000);
      m.emissive.set(rl.colour);
      setMaps(m, null);
      return;
    }
    m.emissive.set(0x000000);
    const set = look.textures && rl.skin ? textureSet(rl.skin) : null;
    m.color.copy(tinted(rl.colour, set));
    setMaps(m, set && entry.owner && set.loaded ? bandMapsOf(entry.owner, set) : (set?.maps ?? null));
  };
  /** `recessDark`: the material draws the vertex colours of a slotted profile (`shadeRecesses`); a piece without them uses another. */
  const roleMaterial = (role: Role, part: string, owner?: string, recessDark = false): THREE_NS.MeshStandardMaterial => {
    const name = owner ? `${role}:${part}:${owner}` : `${role}:${part}`;
    const key = recessDark ? `${name}:recess` : name;
    let entry = roleMaterials.get(key);
    if (!entry) {
      const material = new THREE.MeshStandardMaterial({ roughness: 0.6, ...NO_Z_FIGHT });
      material.name = name;
      material.vertexColors = recessDark;
      entry = { material, role, part, ...(owner ? { owner } : {}) };
      paintRole(entry);
      roleMaterials.set(key, entry);
    }
    return entry.material;
  };

  let camState: CameraState = cameraFromPreset(scene.cameras[0] ?? { name: 'default', position: [6, 6, 8], target: [0, 0, 0] });
  let goal: CameraState | null = null; // a preset the camera is still easing toward
  // The first view and a resize show the whole scene (VIS-002) until a person moves the camera or chooses another named preset.
  let sceneBounds: Bounds | null = null;
  let autoFit = true;
  let animate = true;
  // Outlines (VIS-009): built lazily, only while the palette has an outline colour.
  let lineMaterial: THREE_NS.LineBasicMaterial | undefined;
  let wireMaterial: THREE_NS.MeshBasicMaterial | undefined;
  const edges = new Map<string, THREE_NS.BufferGeometry>();
  const outlined = new Map<THREE_NS.Mesh, { line: THREE_NS.LineSegments; key: string }>();
  // How far the band of each belt has travelled (VIS-016), driven by the plant's own clock so a paused plant stands still.
  const travel = new Map<string, number>();
  let lastTimeMs: number | null = null;
  let highlightId: string | null = null;
  let highlight: THREE_NS.Box3Helper | undefined;

  const paintItems = (): void => {
    for (const layer of layers) {
      const set = look.textures ? textureSet(layer.skin) : null;
      layer.items.forEach((item, i) => layer.mesh.setColorAt(i, tinted(itemToneOf(item, palette), set)));
      if (layer.mesh.instanceColor) layer.mesh.instanceColor.needsUpdate = true;
    }
    // The crate's walls take the crate's own tone.
    const set = look.textures ? textureSet('cardboard') : null;
    let w = 0;
    for (const crate of crates) {
      const tone = tinted(itemToneOf(crate, palette), set);
      for (let k = 0; k < 4; k++) walls.setColorAt(w++, tone);
    }
    if (walls.instanceColor) walls.instanceColor.needsUpdate = true;
  };
  const paintFloor = (): void => {
    const set = look.textures ? textureSet('floor') : null;
    if (set) withUv(floorGeometry);
    // A textured floor is an epoxy coat whose finish shows (epoxyFloor); a plain one stays matt, in the palette's floor colour.
    const epoxy = set ? epoxyFloor(palette) : null;
    floorMaterial.color.copy(tinted(epoxy?.floor ?? palette.floor, set));
    floorMaterial.roughness = epoxy?.roughness ?? 0.9;
    setMaps(floorMaterial, set?.maps ?? null);
  };
  /** Colours, surfaces and maps of everything drawn, for the current palette and look. */
  const paintAll = (): void => {
    if (look.textures) {
      pieceGeometries.forEach(withUv);
      geometries.forEach(withUv);
    }
    paintFloor();
    partMaterials.forEach((m, part) => paintPart(part, m));
    roleMaterials.forEach(paintRole);
    for (const layer of layers) setMaps(layer.material, look.textures ? (textureSet(layer.skin)?.maps ?? null) : null);
    paintItems();
  };

  let width = canvas.width || 1280;
  let height = canvas.height || 720;
  const fitted = (from: CameraState): CameraState => (sceneBounds ? fitCamera(from, sceneBounds, width / height) : from);
  let dirty = true;
  let disposed = false;
  let paused = false;
  let raf = 0;
  const stats = createFrameStats();
  const listeners = new Set<(event: ContextEvent) => void>();

  /** The sun's shadow covers the scene's bounds, from the same direction at any size. */
  const fitShadow = (): void => {
    if (!sceneBounds || !look.shadows) return;
    const c = [0, 1, 2].map((i) => (sceneBounds!.min[i]! + sceneBounds!.max[i]!) / 2) as [number, number, number];
    const r = Math.max(1, Math.hypot(...[0, 1, 2].map((i) => sceneBounds!.max[i]! - sceneBounds!.min[i]!)) / 2);
    sun.position.set(c[0] + SUN_DIRECTION[0] * r * 3, c[1] + SUN_DIRECTION[1] * r * 3, c[2] + SUN_DIRECTION[2] * r * 3);
    sun.target.position.set(...c);
    if (!sun.target.parent) world.add(sun.target);
    const cam = sun.shadow.camera;
    [cam.left, cam.right, cam.top, cam.bottom, cam.near, cam.far] = [-r, r, r, -r, 0.1, r * 6];
    cam.updateProjectionMatrix();
  };

  /** Lights, tone mapping, colour space, shadows, environment and maps for the quality level and display mode (VIS-015). */
  const applyLook = (): void => {
    look = lookFor(quality, palette.mode);
    renderer.toneMapping = look.toneMapping === 'filmic' ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping;
    renderer.toneMappingExposure = 1;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = look.shadows;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    sun.castShadow = look.shadows;
    if (look.shadows) {
      sun.shadow.mapSize.set(look.shadowMapSize, look.shadowMapSize);
      sun.shadow.radius = 4;
      sun.shadow.bias = -0.0004;
      sun.shadow.normalBias = 0.02;
      sun.shadow.map?.dispose();
      sun.shadow.map = null;
      fitShadow();
    }
    const lights = look.flat ? LIGHTS.flat : look.environment ? LIGHTS.environment : LIGHTS.plain;
    hemi.color.set(lights.sky);
    hemi.groundColor.set(lights.ground);
    hemi.intensity = lights.hemi;
    sun.intensity = lights.sun;
    world.environment = look.environment ? environmentMap() : null;
    world.environmentIntensity = 'environment' in lights ? lights.environment : 1;
    // The floor fades into a haze at the horizon and the far wall stands above it (medium and high); otherwise one plain colour.
    const horizon = look.environment ? epoxyFloor(palette) : null;
    world.background = new THREE.Color(horizon?.wall ?? palette.floor);
    world.fog?.color.set(horizon?.haze ?? palette.floor);
    for (const maps of [...[...textureSets.values()].map((set) => set.maps), ...bandMaps.values()])
      for (const texture of Object.values(maps))
        if (texture && texture.anisotropy !== maxAnisotropy()) {
          texture.anisotropy = maxAnisotropy();
          texture.needsUpdate = true;
        }
    renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, look.pixelRatioCap));
    renderer.setSize(width, height, false);
    paintAll();
    const recompile = (m: THREE_NS.Material) => {
      m.needsUpdate = true;
    };
    recompile(floorMaterial);
    layers.forEach((l) => recompile(l.material));
    partMaterials.forEach(recompile);
    roleMaterials.forEach((e) => recompile(e.material));
    decorMaterials.forEach(recompile);
    dirty = true;
  };
  applyLook();

  const stopWatching = watchContext(
    canvas,
    (event) => {
      paused = event === 'lost' || event === 'unavailable';
      if (event === 'restored' && environment) {
        // The prefiltered environment lived in the lost context: make it again.
        environment.dispose();
        environment = null;
        applyLook();
      }
      dirty = true;
      listeners.forEach((l) => l(event));
    },
    options.restoreTimeoutMs,
  );

  const placeCamera = (): void => {
    const [cx, cy, cz] = cameraPosition(camState);
    camera.position.set(cx, cy, cz);
    camera.lookAt(...camState.target);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };
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
    placeCamera();
    renderer.render(world, camera);
    stats.frame(now);
  };
  raf = requestAnimationFrame(frame);

  /** The meshes of a part that high contrast outlines (VIS-009): every piece of a composed sensor, the single shape of the others. */
  const outlineTargets = (): Array<{ mesh: THREE_NS.Mesh; key: string; geometry: () => THREE_NS.BufferGeometry }> => {
    const out: Array<{ mesh: THREE_NS.Mesh; key: string; geometry: () => THREE_NS.BufferGeometry }> = [];
    for (const entry of partEntries.values()) {
      const part = (entry.object.userData as { part?: string }).part;
      if (!part || !OUTLINED_PARTS.has(part)) continue;
      if (entry.key === 'model')
        for (const mesh of entry.pieces.values()) {
          const shape = (mesh.userData as { shape: PieceShape }).shape;
          const key = `piece:${JSON.stringify(shape)}`;
          out.push({ mesh, key, geometry: () => new THREE.EdgesGeometry(pieceGeometry(THREE, addons, shape, true), 30) });
        }
      else {
        const mesh = entry.object as THREE_NS.Mesh;
        out.push({ mesh, key: entry.key, geometry: () => new THREE.EdgesGeometry(mesh.geometry) });
      }
    }
    return out;
  };

  /** Sensors and blades get edge lines; items get a wireframe pass that shares the item matrices (one extra draw call per layer). */
  const applyOutlines = (): void => {
    const colour = palette.outline;
    if (colour === null) {
      for (const [mesh, o] of outlined) mesh.remove(o.line);
      outlined.clear();
      for (const layer of layers) {
        if (layer.outline) world.remove(layer.outline);
        delete layer.outline;
      }
      if (wallOutline) world.remove(wallOutline);
      wallOutline = undefined;
      return;
    }
    lineMaterial ??= new THREE.LineBasicMaterial({ color: colour });
    wireMaterial ??= new THREE.MeshBasicMaterial({ color: colour, wireframe: true });
    lineMaterial.color.set(colour);
    wireMaterial.color.set(colour);
    const targets = outlineTargets();
    const keep = new Set(targets.map((t) => t.mesh));
    for (const [mesh, o] of outlined)
      if (!keep.has(mesh)) {
        mesh.remove(o.line);
        outlined.delete(mesh);
      }
    for (const target of targets) {
      const current = outlined.get(target.mesh);
      if (current?.key === target.key) continue;
      if (current) target.mesh.remove(current.line);
      let g = edges.get(target.key);
      if (!g) {
        g = target.geometry();
        edges.set(target.key, g);
      }
      const line = new THREE.LineSegments(g, lineMaterial);
      target.mesh.add(line);
      outlined.set(target.mesh, { line, key: target.key });
    }
    for (const layer of layers) {
      if (!layer.outline && layer.mesh.count > 0) {
        layer.outline = new THREE.InstancedMesh(unitBox, wireMaterial, layer.capacity);
        layer.outline.instanceMatrix = layer.mesh.instanceMatrix;
        layer.outline.frustumCulled = false;
        world.add(layer.outline);
      }
      if (layer.outline) layer.outline.count = layer.mesh.count;
    }
    if (!wallOutline && walls.count > 0) {
      wallOutline = new THREE.InstancedMesh(unitBox, wireMaterial, wallCapacity);
      wallOutline.instanceMatrix = walls.instanceMatrix;
      wallOutline.frustumCulled = false;
      world.add(wallOutline);
    }
    if (wallOutline) wallOutline.count = walls.count;
  };

  const growLayer = (layer: ItemLayer, needed: number): void => {
    while (layer.capacity < needed) layer.capacity *= 2;
    world.remove(layer.mesh);
    if (layer.outline) world.remove(layer.outline);
    delete layer.outline; // applyOutlines rebuilds it on the new buffer
    layer.mesh.dispose();
    layer.mesh = new THREE.InstancedMesh(layer.geometry, layer.material, layer.capacity);
    layer.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    layer.mesh.frustumCulled = false;
    layer.mesh.castShadow = true;
    layer.mesh.receiveShadow = true;
    world.add(layer.mesh);
  };

  const growWalls = (needed: number): void => {
    while (wallCapacity < needed) wallCapacity *= 2;
    world.remove(walls);
    if (wallOutline) world.remove(wallOutline);
    wallOutline = undefined;
    walls.dispose();
    walls = new THREE.InstancedMesh(unitBox, cardboard.material, wallCapacity);
    walls.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    walls.frustumCulled = false;
    walls.castShadow = true;
    world.add(walls);
  };

  const removeEntry = (id: string): void => {
    const entry = partEntries.get(id);
    if (!entry) return;
    world.remove(entry.object);
    partEntries.delete(id);
  };

  /** A part drawn as its single shape (the kinds that have no composed model yet), with the boxes drawn inside it. */
  const drawShape = (view: PartView): void => {
    const spec = partShape(view);
    const key = JSON.stringify(spec);
    let entry = partEntries.get(view.id);
    if (entry?.key === 'model') removeEntry(view.id);
    entry = partEntries.get(view.id);
    if (!entry) {
      const mesh = new THREE.Mesh(geometryFor(spec, key), materialFor(view.part));
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData = { part: view.part, id: view.id };
      if (look.textures) withUv(mesh.geometry);
      world.add(mesh);
      entry = { object: mesh, key, decor: new Map(), pieces: new Map() };
      partEntries.set(view.id, entry);
    } else if (entry.key !== key) {
      (entry.object as THREE_NS.Mesh).geometry = geometryFor(spec, key);
      if (look.textures) withUv((entry.object as THREE_NS.Mesh).geometry);
      entry.key = key;
    }
    entry.object.position.set(...view.pose.p);
    entry.object.quaternion.set(...view.pose.q);
    // Boxes inside the part (the tank's liquid, the stack light's lamps): created once, then only moved and recoloured.
    for (const d of partDecor(view)) {
      let box = entry.decor.get(d.slot);
      if (!box) {
        box = new THREE.Mesh(unitBox, decorMaterial(d));
        entry.object.add(box);
        entry.decor.set(d.slot, box);
      }
      box.material = decorMaterial(d);
      box.visible = d.size[1] > 0;
      box.scale.set(...d.size);
      box.position.set(...d.centre);
    }
  };

  /** A part drawn as its composed model (VIS-014): one mesh per piece, moved, shown or hidden as the state changes (VIS-016). */
  const drawModel = (view: PartView, pieces: readonly Piece[]): void => {
    let entry = partEntries.get(view.id);
    if (entry && entry.key !== 'model') removeEntry(view.id);
    entry = partEntries.get(view.id);
    if (!entry) {
      const group = new THREE.Group();
      group.userData = { part: view.part, id: view.id };
      world.add(group);
      entry = { object: group, key: 'model', decor: new Map(), pieces: new Map() };
      partEntries.set(view.id, entry);
    }
    entry.object.position.set(...view.pose.p);
    entry.object.quaternion.set(...view.pose.q);
    const shown = new Set<string>();
    for (const piece of pieces) {
      shown.add(piece.slot);
      const key = JSON.stringify(piece.shape);
      const recessDark = piece.shape.kind === 'extrusion' && piece.shape.recessDark === true;
      const material = roleMaterial(piece.role, view.part, piece.role === 'band' ? view.id : undefined, recessDark);
      let mesh = entry.pieces.get(piece.slot);
      if (!mesh) {
        mesh = new THREE.Mesh(pieceGeometryFor(piece.shape, key), material);
        entry.object.add(mesh);
        entry.pieces.set(piece.slot, mesh);
      } else if ((mesh.userData as { key?: string }).key !== key) mesh.geometry = pieceGeometryFor(piece.shape, key);
      if (look.textures) withUv(mesh.geometry);
      mesh.userData = { slot: piece.slot, key, shape: piece.shape };
      mesh.material = material;
      mesh.position.set(...piece.at);
      mesh.rotation.y = piece.yaw;
      mesh.visible = piece.visible;
      mesh.castShadow = roleLook(piece.role, view.part, palette).castShadow;
      mesh.receiveShadow = true;
    }
    for (const [slot, mesh] of entry.pieces) if (!shown.has(slot)) mesh.visible = false;
    // The band's own maps scroll with it: the texture moves as far as the band has travelled.
    const band = bandMaps.get(view.id);
    if (band)
      for (const texture of Object.values(band)) if (texture) texture.offset.x = -(travel.get(view.id) ?? 0) / TILE_M['rubber-belt'];
  };

  const placeHighlight = (): void => {
    if (highlight) {
      world.remove(highlight);
      highlight.dispose();
      highlight = undefined;
    }
    const entry = highlightId ? partEntries.get(highlightId) : undefined;
    if (!entry) return;
    entry.object.updateMatrixWorld(true);
    highlight = new THREE.Box3Helper(new THREE.Box3().setFromObject(entry.object), palette.outline ?? 0xf59e0b);
    world.add(highlight);
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
      const now = typeof snapshot.timeMs === 'number' ? snapshot.timeMs : null;
      const dt = now !== null && lastTimeMs !== null ? Math.min(1, Math.max(0, (now - lastTimeMs) / 1000)) : 0;
      lastTimeMs = now;
      for (const layer of layers) layer.items = [];
      for (const item of snapshot.items) layers[itemSkin(item) === 'cardboard' ? 0 : 1]!.items.push(item);
      for (const layer of layers) {
        if (layer.items.length > layer.capacity) growLayer(layer, layer.items.length);
        instanceMatrices(layer.items, layer.mesh.instanceMatrix.array as Float32Array);
        layer.mesh.count = layer.items.length;
        layer.mesh.instanceMatrix.needsUpdate = true;
      }
      crates = snapshot.items.filter((i) => i.tag === 'crate');
      if (crates.length * 4 > wallCapacity) growWalls(crates.length * 4);
      crateWallMatrices(crates, walls.instanceMatrix.array as Float32Array);
      walls.count = crates.length * 4;
      walls.instanceMatrix.needsUpdate = true;
      paintItems();

      if (!sceneBounds) {
        sceneBounds = snapshotBounds(snapshot);
        if (autoFit) {
          camState = fitted(goal ?? camState);
          goal = null;
        }
        fitShadow();
      }
      // A part whose item is in the snapshot too (a pallet, a fixed crate) is drawn as the item: it can move, and carries the item's
      // colour.
      const itemIds = new Set(snapshot.items.map((item) => item.id));
      const seen = new Set<string>();
      for (const view of snapshot.parts) {
        if (itemIds.has(view.id)) continue;
        seen.add(view.id);
        const speed = typeof view.state.speedMps === 'number' ? view.state.speedMps : 0;
        if (animate && speed !== 0 && dt > 0) travel.set(view.id, (travel.get(view.id) ?? 0) + speed * dt);
        const pieces = partModel(view, {
          travel: travel.get(view.id) ?? 0,
          mount: sensorMount(view, snapshot.parts),
          station: controlStation(view, snapshot.parts),
        });
        if (pieces) drawModel(view, pieces);
        else drawShape(view);
      }
      for (const id of [...partEntries.keys()]) if (!seen.has(id)) removeEntry(id);
      applyOutlines();
      if (highlightId) placeHighlight();
      dirty = true;
    },
    setQuality(level) {
      // ponytail: antialiasing is a context attribute and cannot change on a live canvas; it applies at creation.
      quality = level;
      applyLook();
    },
    setCameraPreset(name) {
      const preset = scene.cameras.find((c) => c.name === name);
      if (preset) {
        // The first preset is the one the scene opens with, so it is fitted like the first view; the others keep their authored framing.
        autoFit = preset === scene.cameras[0];
        goal = autoFit ? fitted(cameraFromPreset(preset)) : cameraFromPreset(preset);
        if (!animate) camState = goal;
        dirty = true;
      }
    },
    fitScene() {
      if (disposed || !sceneBounds) return;
      autoFit = true;
      goal = fitted(goal ?? camState);
      if (!animate) camState = goal;
      dirty = true;
    },
    orbit(dx, dy) {
      goal = null;
      autoFit = false;
      camState = orbitCamera(camState, dx, dy);
      dirty = true;
    },
    pan(dx, dz) {
      goal = null;
      autoFit = false;
      camState = panCamera(camState, dx, dz);
      dirty = true;
    },
    zoom(factor) {
      goal = null;
      autoFit = false;
      camState = zoomCamera(camState, factor);
      dirty = true;
    },
    setPalette(next) {
      if (disposed) return;
      palette = next;
      applyLook();
      applyOutlines();
      if (highlightId) placeHighlight();
      dirty = true;
    },
    setCameraAnimation(enabled) {
      animate = enabled;
      if (!enabled && goal) camState = goal;
      if (!enabled) goal = null;
      dirty = true;
    },
    ready: () => Promise.all([...pending]).then(() => undefined),
    pick(ndc) {
      if (disposed) return null;
      placeCamera();
      camera.updateMatrixWorld();
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(new THREE.Vector2(ndc[0], ndc[1]), camera);
      const shown = (o: THREE_NS.Object3D | null): boolean => !o || (o.visible && shown(o.parent));
      for (const hit of raycaster.intersectObjects(
        [...partEntries.values()].map((e) => e.object),
        true,
      )) {
        if (!shown(hit.object) || (hit.object as THREE_NS.LineSegments).isLineSegments) continue;
        let o: THREE_NS.Object3D | null = hit.object;
        while (o && !(o.userData as { id?: string }).id) o = o.parent;
        if (o) return (o.userData as { id: string }).id;
      }
      return null;
    },
    setHighlight(id) {
      if (disposed || id === highlightId) return;
      highlightId = id;
      placeHighlight();
      dirty = true;
    },
    anchorOf(id) {
      const entry = partEntries.get(id);
      if (disposed || !entry) return null;
      placeCamera();
      camera.updateMatrixWorld();
      entry.object.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(entry.object);
      const top = new THREE.Vector3((box.min.x + box.max.x) / 2, box.max.y, (box.min.z + box.max.z) / 2);
      if (top.clone().applyMatrix4(camera.matrixWorldInverse).z >= 0) return null;
      const p = top.project(camera);
      return [(p.x + 1) / 2, (1 - p.y) / 2];
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
      if (autoFit && sceneBounds) {
        camState = fitted(goal ?? camState);
        goal = null;
      }
      dirty = true;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(raf);
      stopWatching();
      listeners.clear();
      geometries.forEach((g) => g.dispose());
      pieceGeometries.forEach((g) => g.dispose());
      edges.forEach((g) => g.dispose());
      lineMaterial?.dispose();
      wireMaterial?.dispose();
      partMaterials.forEach((m) => m.dispose());
      roleMaterials.forEach((e) => e.material.dispose());
      decorMaterials.forEach((m) => m.dispose());
      for (const set of textureSets.values()) for (const texture of Object.values(set.maps)) texture?.dispose();
      for (const maps of bandMaps.values()) for (const texture of Object.values(maps)) texture?.dispose();
      environment?.dispose();
      highlight?.dispose();
      (ghost?.material as THREE_NS.Material | undefined)?.dispose();
      floorGeometry.dispose();
      floorMaterial.dispose();
      for (const layer of layers) {
        layer.mesh.dispose();
        layer.material.dispose();
        if (layer.geometry !== unitBox) layer.geometry.dispose();
      }
      unitBox.dispose();
      walls.dispose();
      renderer.dispose();
    },
  };
}

/** Loads three and its add-ons on demand (the only reach into them) and builds the renderer. */
export async function loadRenderer(
  canvas: HTMLCanvasElement,
  scene: PlantSceneFile,
  options: RendererOptions = {},
): Promise<PlantRenderer | { unavailable: string }> {
  try {
    const [THREE, { RoomEnvironment }, { RoundedBoxGeometry }] = await Promise.all([
      import('three'),
      import('three/examples/jsm/environments/RoomEnvironment.js'),
      import('three/examples/jsm/geometries/RoundedBoxGeometry.js'),
    ]);
    return createRenderer(canvas, scene, options, THREE, { RoomEnvironment, RoundedBoxGeometry });
  } catch (error) {
    return { unavailable: `The 3D view could not be loaded: ${error instanceof Error ? error.message : String(error)}` };
  }
}
