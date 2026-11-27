/**
 * Plan-vis E1: spec 012 VIS-016 (one state pair per stateful part kind), VIS-018 (every item colour word) and the item outlines of
 * VIS-009, on frames the product's renderer draws in a real window, each at a shipped scene where the part or the item appears
 * (page side, see stage.ts; `bun scripts/plant/capture.ts --check states|colours` drives it and judges the records with
 * `stateProblems` and `colourProblems`).
 *
 * A state is the published view of the part in the scene with the keys of its catalogue state (catalogueStates.ts) laid over it, the
 * way the catalogue draws it; a machine that publishes several views is driven through the scene's own core instead. The second
 * frame of a pair is 600 ms later on the snapshot clock, so a running belt has moved its band.
 *
 * Evidence level: development host, Linux, headless software GL, renderer and core in the page of the application window, outside
 * the plant panel. No frame rate.
 */
import * as THREE from 'three';
import type { BodyPose, PlantSnapshot } from '../../src/plant/contracts';
import { createPlantCore } from '../../src/plant/core/plantCore';
import { SCENE_INDEX } from '../../src/generated/sceneIndex';
import type { DisplayMode } from '../../src/plant/view/displayModes';
import type { QualityLevel } from '../../src/plant/view/quality';
import { CATALOGUE, type CatalogueKind, type CatalogueState } from './catalogueStates';
import { HUE_TOLERANCE, NAMED_HUES } from './checks';
import { diffFraction, draw, hsl, itemColour, loadScene, openStage, partRect, project, type Rect, type Stage } from './stage';

/** A pixel changes when one of its channels moves by more than this (of 255). */
export const CHANNEL_MIN = 24;
/** VIS-016: the share of the part's projected box that must change between the two frames of a pair (design default). */
export const PAIR_MIN = 0.01;
/** VIS-009: the least share of a coloured item's box drawn near white (its outline) in high contrast. */
export const OUTLINE_MIN = 0.02;
const MODES: readonly DisplayMode[] = ['light', 'dark', 'high-contrast'];
const CONVEYORS = new Set(['belt', 'roller', 'curved']);

export interface Pair {
  key: string;
  kind: CatalogueKind;
  a: CatalogueState;
  b: CatalogueState;
}

/** One pair per stateful kind of the catalogue, its first two states; one per beam sensor kind (each has a model of its own). */
export function statePairs(): Pair[] {
  return CATALOGUE.filter((k) => k.stateful).flatMap((k): Pair[] => {
    if (k.id !== 'sensor') return [{ key: k.id, kind: k, a: k.states[0]!, b: k.states[0]! }]; // RED: a pair known not to differ;
    return [...new Set(k.states.map((s) => String(s.state!.kind)))].map((v) => {
      const [a, b] = k.states.filter((s) => s.state!.kind === v);
      return { key: `sensor ${v}`, kind: k, a: a!, b: b! };
    });
  });
}

const keyOf = (v: { part: string; state: Readonly<Record<string, unknown>> }) =>
  v.part === 'sensor' ? `sensor ${String(v.state.kind)}` : v.part;

/** The first shipped scene, in index order, that publishes a view of each kind: the scene and the view's id. */
async function whereKinds(): Promise<Map<string, { scene: string; view: string; name: string }>> {
  const at = new Map<string, { scene: string; view: string; name: string }>();
  for (const { id } of SCENE_INDEX) {
    const core = await createPlantCore(await loadScene(id));
    try {
      for (const v of core.snapshot().parts) if (!at.has(keyOf(v))) at.set(keyOf(v), { scene: id, view: v.id, name: v.name });
    } finally {
      core.dispose();
    }
  }
  return at;
}

/** The snapshot with one view put in state `s` of its pair: the keys the pair changes reset to the kind's own, then the state's. */
export function inState(base: PlantSnapshot, viewId: string, pair: Pair, s: CatalogueState, timeMs: number): PlantSnapshot {
  const k = pair.kind;
  const parts = base.parts.map((v) => {
    if (v.id !== viewId) return v;
    const rename = (key: string) => (key.includes('.') ? `${v.name}.${key.slice(key.indexOf('.') + 1)}` : key);
    const state: Record<string, unknown> = { ...v.state };
    for (const key of new Set([...Object.keys(pair.a.state ?? {}), ...Object.keys(pair.b.state ?? {})]))
      if (key in k.state) state[key] = k.state[key];
    Object.assign(state, s.state);
    const signals: Record<string, boolean | number> = { ...v.signals };
    for (const key of new Set([...Object.keys(pair.a.signals ?? {}), ...Object.keys(pair.b.signals ?? {})])) {
      const sample = pair.a.signals?.[key] ?? pair.b.signals?.[key];
      signals[rename(key)] = k.signals?.[key] ?? (typeof sample === 'boolean' ? false : 0);
    }
    for (const [key, value] of Object.entries(s.signals ?? {})) signals[rename(key)] = value;
    let pose = v.pose;
    if (s.yawDeg || s.rise) {
      // The part turns about its pivot (a point of its own frame that stays where it is) and rises, as the catalogue view does.
      const q = new THREE.Quaternion(...v.pose.q);
      const turned = q
        .clone()
        .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ((s.yawDeg ?? 0) * Math.PI) / 180));
      const pivot = new THREE.Vector3(...(k.pivot ?? [0, 0, 0]));
      const p = new THREE.Vector3(...v.pose.p).add(pivot.clone().applyQuaternion(q)).sub(pivot.clone().applyQuaternion(turned));
      pose = { ...v.pose, p: [p.x, p.y + (s.rise ?? 0), p.z], q: [turned.x, turned.y, turned.z, turned.w] };
    }
    return { ...v, state, signals, pose } as typeof v;
  });
  return { ...base, timeMs, parts };
}

const unionRect = (rects: ReadonlyArray<Rect | null>): Rect | null => {
  const r = rects.filter((x): x is Rect => x !== null);
  if (r.length === 0) return null;
  const x = Math.min(...r.map((q) => q.x));
  const y = Math.min(...r.map((q) => q.y));
  return { x, y, w: Math.max(...r.map((q) => q.x + q.w)) - x, h: Math.max(...r.map((q) => q.y + q.h)) - y };
};

/** The rect grown by half its size on each side, at least 160 x 120 pixels, inside the frame. */
function around(rect: Rect, width: number, height: number): Rect {
  const w = Math.min(width, Math.max(160, rect.w * 2));
  const h = Math.min(height, Math.max(120, rect.h * 2));
  const x = Math.min(Math.max(0, rect.x + rect.w / 2 - w / 2), width - w);
  const y = Math.min(Math.max(0, rect.y + rect.h / 2 - h / 2), height - h);
  return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
}

/** A PNG of one region of a frame, with the measured box drawn on it in magenta. */
function cropPng(image: ImageData, region: Rect, box?: Rect | null): string {
  const c = document.createElement('canvas');
  c.width = region.w;
  c.height = region.h;
  const g = c.getContext('2d')!;
  g.putImageData(image, -region.x, -region.y, region.x, region.y, region.w, region.h);
  if (box) {
    g.strokeStyle = '#ff00ff';
    g.strokeRect(box.x - region.x + 0.5, box.y - region.y + 0.5, box.w - 1, box.h - 1);
  }
  return c.toDataURL('image/png');
}

export interface StateRecord {
  key: string;
  scene: string;
  view: string;
  mode: DisplayMode;
  reducedMotion: boolean;
  a: string;
  b: string;
  rect: Rect | null;
  /** Share of the box that changes between the two states (VIS-016). */
  fraction: number;
  /** For a conveyor: share of the box that changes while it keeps running 250 ms more (not a multiple of the mark pitch); it must move, and stay still with reduced motion. */
  motion?: number;
  crops: [string, string] | null;
}

const OFF = (v: boolean | number) => (typeof v === 'boolean' ? false : 0);

/** A machine in a state: a fresh core of the scene driven by the state's steps, as catalogueViews drives the one-part scene. */
async function machineFrame(scene: string, mode: DisplayMode, k: CatalogueKind, name: string, s: CatalogueState) {
  const stage = await openStage(scene, { quality: 'medium', mode, width: 1280, height: 720 });
  try {
    // The items of the catalogue's one-part scene (a machining centre's blank) are added where they stand relative to the machine.
    const own = k.machine!.scene.find((p) => p.part === k.id)!;
    const here = stage.scene.parts.find((p) => p.name === name)!;
    for (const p of k.machine!.scene.filter((q) => q.part === 'workpiece'))
      stage.core.addItem(p.part, [0, 1, 2].map((i) => here.position[i]! + p.position[i]! - own.position[i]!) as [number, number, number]);
    let held: Record<string, boolean | number> = {};
    for (const [short, ms] of [...(k.machine!.setup ?? []), ...(s.steps ?? [])]) {
      const next = Object.fromEntries(Object.entries(short).map(([key, v]) => [`${name}.${key}`, v]));
      // Commands of the step before that this one does not give are released, as a core part sees them.
      stage.core.apply({ ...Object.fromEntries(Object.entries(held).map(([key, v]) => [key, OFF(v)])), ...next });
      held = next;
      await stage.run(ms, 5);
    }
    const image = await draw(stage);
    const views = stage.core.snapshot().parts.filter((v) => k.machine!.views.includes(v.part));
    return { image, rect: unionRect(views.map((v) => partRect(stage, v.id))) };
  } finally {
    stage.dispose();
  }
}

/** VIS-016 for every stateful kind the shipped scenes hold, in each display mode, and with reduced motion for the conveyors. */
export async function stateRecords(only?: readonly string[]): Promise<{ records: StateRecord[]; missing: string[] }> {
  const where = await whereKinds();
  const pairs = statePairs().filter((p) => !only || only.includes(p.key));
  const missing = pairs.filter((p) => !where.has(p.key)).map((p) => p.key);
  const records: StateRecord[] = [];
  const W = 1280;
  const H = 720;
  const record = (pair: Pair, mode: DisplayMode, reducedMotion: boolean, a: ImageData, b: ImageData, rect: Rect | null) => {
    const at = where.get(pair.key)!;
    const region = rect ? around(rect, W, H) : null;
    return {
      key: pair.key,
      scene: at.scene,
      view: at.view,
      mode,
      reducedMotion,
      a: pair.a.label,
      b: pair.b.label,
      rect,
      fraction: rect ? diffFraction(a, b, rect, CHANNEL_MIN) : 0,
      crops: region ? ([cropPng(a, region, rect), cropPng(b, region, rect)] as [string, string]) : null,
    } satisfies StateRecord;
  };
  const scenes = [...new Set(pairs.filter((p) => where.has(p.key)).map((p) => where.get(p.key)!.scene))];
  for (const mode of MODES)
    for (const scene of scenes) {
      const here = pairs.filter((p) => where.get(p.key)?.scene === scene);
      for (const pair of here.filter((p) => p.kind.machine)) {
        const name = where.get(pair.key)!.name;
        const a = await machineFrame(scene, mode, pair.kind, name, pair.a);
        const b = await machineFrame(scene, mode, pair.kind, name, pair.b);
        records.push(record(pair, mode, false, a.image, b.image, unionRect([a.rect, b.rect])));
      }
      const plain = here.filter((p) => !p.kind.machine);
      if (plain.length === 0) continue;
      for (const reducedMotion of mode === 'light' ? [false, true] : [false]) {
        const list = reducedMotion ? plain.filter((p) => CONVEYORS.has(p.kind.id)) : plain;
        if (list.length === 0) continue;
        const stage = await openStage(scene, { quality: 'medium', mode, reducedMotion, width: W, height: H });
        try {
          const base = stage.core.snapshot();
          for (const pair of list) {
            const { view } = where.get(pair.key)!;
            const a = await draw(stage, inState(base, view, pair, pair.a, base.timeMs));
            const ra = partRect(stage, view);
            const b = await draw(stage, inState(base, view, pair, pair.b, base.timeMs + 600));
            const rb = partRect(stage, view);
            const rect = unionRect([ra, rb]);
            const r: StateRecord = record(pair, mode, reducedMotion, a, b, rect);
            if (CONVEYORS.has(pair.kind.id)) {
              const later = await draw(stage, inState(base, view, pair, pair.b, base.timeMs + 850));
              r.motion = rect ? diffFraction(b, later, rect, CHANNEL_MIN) : 0;
            }
            records.push(r);
          }
        } finally {
          stage.dispose();
        }
      }
    }
  return { records, missing };
}

const pct = (f: number) => `${(f * 100).toFixed(2)} %`;

export function stateProblems(result: { records: StateRecord[]; missing: string[] }, expected = MODES.length): string[] {
  const problems: string[] = [];
  for (const r of result.records) {
    const where = `${r.key} ${r.a} / ${r.b} at ${r.scene} (${r.mode}${r.reducedMotion ? ', reduced motion' : ''})`;
    if (!r.rect) problems.push(`VIS-016 ${where}: the part has no box in the frame`);
    else if (!(r.fraction >= PAIR_MIN)) problems.push(`VIS-016 ${where}: ${pct(r.fraction)} of the part's box changes`);
    if (r.motion !== undefined && (r.reducedMotion ? r.motion !== 0 : !(r.motion > 0)))
      problems.push(`VIS-016 ${where}: the running conveyor ${r.reducedMotion ? 'moves' : 'does not move'} (${pct(r.motion)})`);
  }
  const keys = new Set(result.records.map((r) => r.key));
  for (const key of keys)
    if (result.records.filter((r) => r.key === key && !r.reducedMotion).length !== expected)
      problems.push(`VIS-016 ${key}: not drawn in each display mode`);
  return problems;
}

/** The colour words that name items, with the hue each must be drawn in (checks.ts NAMED_HUES); a word without one is a finding. */
export interface ColourRecord {
  mode: DisplayMode;
  quality: QualityLevel;
  scene: string;
  item: string;
  /** The colour word the scene names for it, or `lid`, `base`, or null for an item with no named colour. */
  named: string | null;
  rgb: [number, number, number] | null;
  hsl: { h: number; s: number; l: number } | null;
  /** For a lid or a base: the conveyor under it, sampled where the item lies in a frame drawn without items. */
  ground?: { part: string; rgb: [number, number, number]; hsl: { h: number; s: number; l: number } } | null;
  /** Share of the item's box drawn near white (each channel at least 200 of 255). */
  white: number;
  rect: Rect | null;
}

/** The projected box of an item (axis-aligned in the world), clipped to the frame. */
function itemRect(stage: Stage, item: BodyPose): Rect | null {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const dx of [-1, 1])
    for (const dy of [-1, 1])
      for (const dz of [-1, 1]) {
        const p = project(
          stage,
          new THREE.Vector3(item.p[0] + (dx * item.size[0]) / 2, item.p[1] + (dy * item.size[1]) / 2, item.p[2] + (dz * item.size[2]) / 2),
        );
        if (p) [xs[xs.length], ys[ys.length]] = p;
      }
  if (xs.length === 0) return null;
  const x0 = Math.max(0, Math.floor(Math.min(...xs)));
  const y0 = Math.max(0, Math.floor(Math.min(...ys)));
  const x1 = Math.min(stage.canvas.width, Math.ceil(Math.max(...xs)));
  const y1 = Math.min(stage.canvas.height, Math.ceil(Math.max(...ys)));
  return x1 > x0 && y1 > y0 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
}

function whiteShare(image: ImageData, rect: Rect): number {
  let n = 0;
  for (let y = rect.y; y < rect.y + rect.h; y++)
    for (let x = rect.x; x < rect.x + rect.w; x++) {
      const i = (y * image.width + x) * 4;
      if (image.data[i]! >= 200 && image.data[i + 1]! >= 200 && image.data[i + 2]! >= 200) n++;
    }
  return n / (rect.w * rect.h);
}

const sampleOf = (stage: Stage, image: ImageData, item: BodyPose) => {
  const s = itemColour(stage, image, item);
  return s ? { rgb: s.rgb, hsl: hsl(...s.rgb) } : null;
};

/**
 * VIS-018 and the outlines of VIS-009 in one display mode and quality level: colour-separation, whose emitter makes red and blue
 * workpieces (a box with no colour is added on its stopped outfeed, as checks.ts does), and two-axis-assembly, whose emitters put a
 * lid and a base on their standing belts. Returns the records and a PNG of each frame.
 */
export async function colourRecords(
  mode: DisplayMode,
  quality: QualityLevel,
): Promise<{ records: ColourRecord[]; frames: Array<{ scene: string; png: string }> }> {
  const records: ColourRecord[] = [];
  const frames: Array<{ scene: string; png: string }> = [];
  const finish = async (stage: Stage, scene: string, named: (i: BodyPose) => string | null) => {
    const image = await draw(stage);
    const snapshot = stage.core.snapshot();
    const bare = await draw(stage, { ...snapshot, items: [] });
    for (const item of snapshot.items) {
      const n = named(item);
      const rect = itemRect(stage, item);
      const s = sampleOf(stage, image, item);
      const r: ColourRecord = {
        mode,
        quality,
        scene,
        item: item.id,
        named: n,
        rgb: s?.rgb ?? null,
        hsl: s?.hsl ?? null,
        white: rect ? whiteShare(image, rect) : 0,
        rect,
      };
      if (n === 'lid' || n === 'base') {
        const under = snapshot.parts.find(
          (v) =>
            CONVEYORS.has(v.part) &&
            Math.abs(item.p[0] - v.pose.p[0]) <= v.pose.size[0] / 2 &&
            Math.abs(item.p[2] - v.pose.p[2]) <= v.pose.size[2] / 2,
        );
        const top =
          under && sampleOf(stage, bare, { ...item, p: [item.p[0], under.pose.p[1] + under.pose.size[1] / 2, item.p[2]], size: [0, 0, 0] });
        r.ground = under && top ? { part: under.id, ...top } : null;
      }
      records.push(r);
    }
    const c = document.createElement('canvas');
    [c.width, c.height] = [image.width, image.height];
    c.getContext('2d')!.putImageData(image, 0, 0);
    frames.push({ scene, png: c.toDataURL('image/png') });
  };
  let stage = await openStage('colour-separation', { quality, mode, width: 1280, height: 720 });
  try {
    stage.core.apply({ 'Infeed.run': true, 'Outfeed.run': false, 'SideBelt.run': false });
    const has = (colour: string) => stage.core.snapshot().items.some((i) => i.colour === colour);
    for (let t = 0; t < 30_000 && !(has('red') && has('blue')); t += 1000) await stage.run(1000, 20);
    await stage.run(1500, 20);
    stage.core.apply({ 'Infeed.run': false });
    stage.core.addItem('box', [1.3, 0.9, 0]);
    await stage.run(1500, 20);
    await finish(stage, 'colour-separation', (i) => i.colour ?? null);
  } finally {
    stage.dispose();
  }
  stage = await openStage('two-axis-assembly', { quality, mode, width: 1280, height: 720 });
  try {
    // Each emitter puts one item on its belt on a rising edge of its signal; the belts stand, so each item rests where it fell.
    stage.core.apply({ 'LidEmitter.emit': true, 'BaseEmitter.emit': true });
    await stage.run(1500, 20);
    await finish(stage, 'two-axis-assembly', (i) => (i.tag === 'lid' || i.tag === 'base' ? i.tag : (i.colour ?? null)));
  } finally {
    stage.dispose();
  }
  return { records, frames };
}

const hueDistance = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));
/** About the same hue, lightness and colourfulness (checks.ts): a grey is not a blue, whatever its computed hue. */
const alike = (p: { h: number; s: number; l: number }, n: { h: number; s: number; l: number }) =>
  hueDistance(p.h, n.h) <= HUE_TOLERANCE && Math.abs(p.l - n.l) < 0.15 && Math.abs(p.s - n.s) < 0.25;

/** Every finding as a line a person can read; empty when each colour word, the plain item, the lid, the base and the outlines hold. */
export function colourProblems(words: readonly string[], records: readonly ColourRecord[]): string[] {
  const problems: string[] = [];
  const hues = { ...NAMED_HUES, blue: 120 } as Readonly<Record<string, number>>; // RED: a wrong named hue
  for (const w of words) if (!(w in hues)) problems.push(`VIS-018 the colour word "${w}" has no named hue the renderer draws`);
  const byFrame = new Map<string, ColourRecord[]>();
  for (const r of records) byFrame.set(`${r.mode} ${r.quality}`, [...(byFrame.get(`${r.mode} ${r.quality}`) ?? []), r]);
  for (const [frame, list] of byFrame) {
    const hc = list[0]!.mode === 'high-contrast';
    const words_ = words.filter((w) => w in hues);
    for (const w of [...words_, 'lid', 'base'])
      if (!list.some((r) => r.named === w)) problems.push(`VIS-018 ${frame}: no ${w} item was sampled`);
    const plain = list.filter((r) => r.named === null);
    if (plain.length === 0) problems.push(`VIS-018 ${frame}: no item with no named colour was sampled`);
    for (const r of list) {
      const what = `${frame}: the ${r.named ?? 'uncoloured'} item ${r.item} at ${r.scene}`;
      if (!r.hsl) {
        problems.push(`VIS-018 ${what} was not sampled`);
        continue;
      }
      if (hc) {
        // VIS-009: an item that is not itself white keeps its white outline in high contrast.
        if (r.named !== null && !(r.white >= OUTLINE_MIN)) problems.push(`VIS-009 ${what} has ${pct(r.white)} of its box outlined`);
        continue;
      }
      if (r.named && r.named in hues && hueDistance(r.hsl.h, hues[r.named]!) > HUE_TOLERANCE)
        problems.push(`VIS-018 ${what} has hue ${r.hsl.h.toFixed(0)} (named ${hues[r.named]})`);
      if (r.named === null)
        for (const n of list.filter((x) => x.named && x.named in hues && x.hsl))
          if (alike(r.hsl, n.hsl!)) problems.push(`VIS-018 ${what} looks like the ${n.named} item ${n.item}`);
      if (r.named === 'lid' || r.named === 'base') {
        if (!r.ground) problems.push(`VIS-018 ${what}: no conveyor under it was sampled`);
        else if (alike(r.hsl, r.ground.hsl)) problems.push(`VIS-018 ${what} looks like the conveyor ${r.ground.part} under it`);
      }
    }
  }
  return problems;
}
