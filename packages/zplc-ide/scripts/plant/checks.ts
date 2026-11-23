/**
 * The checks of spec 012 VIS-015, VIS-016 and VIS-018 on frames the product's renderer draws in a real window (page side; see
 * stage.ts). Each returns plain records; the journey that runs them judges them with `lookProblems`.
 */
import type { BodyPose } from '../../src/plant/contracts';
import type { DisplayMode } from '../../src/plant/view/displayModes';
import type { QualityLevel } from '../../src/plant/view/quality';
import {
  diffFraction,
  draw,
  hsl,
  itemColour,
  openStage,
  partObject,
  partRect,
  project,
  rendererState,
  type Rect,
  type Stage,
} from './stage';
import * as THREE from 'three';

export const MODES: readonly DisplayMode[] = ['light', 'dark', 'high-contrast'];
export const LEVELS: readonly QualityLevel[] = ['low', 'medium', 'high'];
/** VIS-016: the share of a part's projected box that must change between the two frames of a state pair. */
export const PAIR_MIN = 0.01;
/** VIS-018: how far the sampled hue of a named item may lie from its named hue. */
export const HUE_TOLERANCE = 25;
export const NAMED_HUES: Readonly<Record<'red' | 'blue', number>> = { red: 0, blue: 240 };

export interface PairRecord {
  mode: DisplayMode;
  quality: QualityLevel;
  reducedMotion: boolean;
  pair: string;
  part: string;
  rect: Rect | null;
  fraction: number;
}

/** One way to put a part of belt-to-sensor into each of its two states; `undo` puts it back. */
interface StatePair {
  name: string;
  part: string;
  apply(stage: Stage): Promise<void>;
  undo(stage: Stage): Promise<void>;
}

const step = async (stage: Stage, ms = 5) => stage.run(ms, 5);

export const BELT_TO_SENSOR_PAIRS: readonly StatePair[] = [
  {
    name: 'diffuse sensor clear / detecting',
    part: 'eye-far',
    apply: (s) => (s.core.act('EyeFar', 'stuckOn'), step(s)),
    undo: (s) => (s.core.act('EyeFar', 'stuckOff'), step(s)),
  },
  {
    name: 'push button released / pressed',
    part: 'start',
    apply: (s) => (s.core.operate('StartButton.pressed', true), step(s)),
    undo: (s) => (s.core.operate('StartButton.pressed', false), step(s)),
  },
  {
    // The belt runs for a while, then the two frames are taken at the same instant: running, and stopped right there.
    name: 'belt stopped / running',
    part: 'belt',
    apply: async (s) => {
      s.core.apply({ 'Belt1.run': true });
      await s.run(600);
    },
    undo: async (s) => {
      s.core.apply({ 'Belt1.run': false });
      await step(s);
    },
  },
];

/** VIS-016: each pair of belt-to-sensor in one display mode and quality level. The first frame of the belt pair is "running". */
export async function statePairs(mode: DisplayMode, quality: QualityLevel, reducedMotion = false): Promise<PairRecord[]> {
  const stage = await openStage('belt-to-sensor', { quality, mode, reducedMotion, width: 1280, height: 720 });
  const out: PairRecord[] = [];
  try {
    for (const pair of BELT_TO_SENSOR_PAIRS) {
      const rect = partRect(stage, pair.part);
      let fraction: number;
      if (pair.part === 'belt') {
        await pair.apply(stage);
        const running = await draw(stage);
        await pair.undo(stage);
        const stopped = await draw(stage);
        fraction = rect ? diffFraction(running, stopped, rect) : 0;
      } else {
        const before = await draw(stage);
        await pair.apply(stage);
        const after = await draw(stage);
        await pair.undo(stage);
        fraction = rect ? diffFraction(before, after, rect) : 0;
      }
      out.push({ mode, quality, reducedMotion, pair: pair.name, part: pair.part, rect, fraction });
    }
  } finally {
    stage.dispose();
  }
  return out;
}

export interface MotionRecord {
  reducedMotion: boolean;
  /** Share of the belt's box that changes in 200 ms while it runs with no item on it, and while it stands. */
  running: number;
  stopped: number;
}

/** VIS-016: the band of a running belt moves from frame to frame; a stopped belt, or reduced motion, gives the same frame. */
export async function beltMotion(reducedMotion: boolean): Promise<MotionRecord> {
  const stage = await openStage('belt-to-sensor', { quality: 'medium', mode: 'light', reducedMotion, width: 1280, height: 720 });
  try {
    const rect = partRect(stage, 'belt')!;
    const a = await draw(stage);
    await stage.run(200);
    const b = await draw(stage);
    stage.core.apply({ 'Belt1.run': true });
    await stage.run(400);
    const c = await draw(stage);
    await stage.run(200);
    const d = await draw(stage);
    return { reducedMotion, stopped: diffFraction(a, b, rect), running: diffFraction(c, d, rect) };
  } finally {
    stage.dispose();
  }
}

export interface PickRecord {
  part: string;
  picked: string | null;
}

/** VIS-003: a pointer over the visible centre of each part of belt-to-sensor names that part. */
export async function picks(): Promise<PickRecord[]> {
  const stage = await openStage('belt-to-sensor', { quality: 'low', mode: 'light', width: 1280, height: 720 });
  try {
    await draw(stage);
    return ['belt', 'eye-far', 'start', 'emitter'].map((part) => {
      const object = partObject(stage, part);
      const target = (object?.children.find((c) => (c as THREE.Mesh).isMesh && c.visible) as THREE.Mesh | undefined) ?? object;
      if (!target || !stage.renderer.pick) return { part, picked: null };
      const centre = new THREE.Box3().setFromObject(target).getCenter(new THREE.Vector3());
      const at = project(stage, centre);
      if (!at) return { part, picked: null };
      const ndc: [number, number] = [(at[0] / stage.canvas.width) * 2 - 1, -((at[1] / stage.canvas.height) * 2 - 1)];
      return { part, picked: stage.renderer.pick(ndc) };
    });
  } finally {
    stage.dispose();
  }
}

/** VIS-015: what the renderer draws with at each quality level, in light mode, and in high contrast at the high level. */
export async function looks(): Promise<Array<{ quality: QualityLevel; mode: DisplayMode } & ReturnType<typeof rendererState>>> {
  const out = [];
  for (const [quality, mode] of [...LEVELS.map((q) => [q, 'light'] as const), ['high', 'high-contrast'] as const]) {
    const stage = await openStage('belt-to-sensor', { quality, mode, width: 640, height: 360 });
    try {
      await draw(stage);
      out.push({ quality, mode, ...rendererState(stage) });
    } finally {
      stage.dispose();
    }
  }
  return out;
}

export interface HueRecord {
  mode: DisplayMode;
  quality: QualityLevel;
  item: string;
  named: 'red' | 'blue' | null;
  rgb: [number, number, number] | null;
  hue: number | null;
  saturation: number | null;
  lightness: number | null;
}

const hueDistance = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));

/**
 * VIS-018 on colour-separation: its emitter makes red and blue workpieces; a box with no colour is added on the stopped outfeed.
 * The top face of each item is sampled in the frame.
 */
export async function itemHues(mode: DisplayMode, quality: QualityLevel): Promise<HueRecord[]> {
  const stage = await openStage('colour-separation', { quality, mode, width: 1280, height: 720 });
  try {
    stage.core.apply({ 'Infeed.run': true, 'Outfeed.run': false, 'SideBelt.run': false });
    const has = (colour: string) => stage.core.snapshot().items.some((i) => i.colour === colour);
    for (let t = 0; t < 30_000 && !(has('red') && has('blue')); t += 1000) await stage.run(1000, 20);
    await stage.run(1500, 20);
    stage.core.apply({ 'Infeed.run': false });
    stage.core.addItem('box', [1.3, 0.9, 0]);
    await stage.run(1500, 20);
    const image = await draw(stage);
    const items = stage.core.snapshot().items;
    const named = (i: BodyPose) => (i.colour === 'red' || i.colour === 'blue' ? i.colour : null);
    return items.map((item) => {
      const sample = itemColour(stage, image, item);
      const c = sample ? hsl(...sample.rgb) : null;
      const [hue, saturation, lightness] = c ? [c.h, c.s, c.l] : [null, null, null];
      return { mode, quality, item: item.id, named: named(item), rgb: sample?.rgb ?? null, hue, saturation, lightness };
    });
  } finally {
    stage.dispose();
  }
}

/** Every finding of the records as a line a person can read; empty when they all meet VIS-015, VIS-016 and VIS-018. */
export function lookProblems(records: {
  pairs: PairRecord[];
  motion: MotionRecord[];
  picks: PickRecord[];
  looks: Awaited<ReturnType<typeof looks>>;
  hues: HueRecord[];
}): string[] {
  const problems: string[] = [];
  for (const p of records.pairs)
    if (!(p.fraction >= PAIR_MIN))
      problems.push(
        `VIS-016 ${p.pair} (${p.mode}, ${p.quality}${
          p.reducedMotion ? ', reduced motion' : ''
        }): ${pct(p.fraction)} of the part's box differs`,
      );
  for (const m of records.motion) {
    if (m.stopped !== 0) problems.push(`VIS-016 a stopped belt changes from frame to frame (${pct(m.stopped)})`);
    if (m.reducedMotion ? m.running !== 0 : !(m.running > 0))
      problems.push(`VIS-016 a running belt ${m.reducedMotion ? 'moves under reduced motion' : 'does not move'} (${pct(m.running)})`);
  }
  for (const p of records.picks)
    if (p.picked !== p.part) problems.push(`VIS-003 the pointer over ${p.part} names ${p.picked ?? 'nothing'}`);
  for (const l of records.looks) {
    const where = `${l.quality}, ${l.mode}`;
    const textured = l.materials.filter((m) => m.maps.includes('map'));
    const flat = l.mode === 'high-contrast' || l.quality === 'low';
    if (l.outputColorSpace !== 'srgb') problems.push(`VIS-015 ${where}: output colour space ${l.outputColorSpace}`);
    if (l.mode !== 'high-contrast' && l.toneMapping === 'none') problems.push(`VIS-015 ${where}: no tone mapping`);
    if (flat ? textured.length > 0 : textured.length === 0) problems.push(`VIS-015 ${where}: ${textured.length} textured materials`);
    if (flat === l.environment) problems.push(`VIS-015 ${where}: environment map ${l.environment ? 'present' : 'absent'}`);
    if (flat === l.shadows.enabled) problems.push(`VIS-015 ${where}: shadows ${l.shadows.enabled ? 'on' : 'off'}`);
    if (!flat && !textured.some((m) => ['normalMap', 'roughnessMap', 'metalnessMap'].every((k) => m.maps.includes(k))))
      problems.push(`VIS-015 ${where}: no material has base colour, normal, roughness and metalness maps`);
  }
  const byFrame = new Map<string, HueRecord[]>();
  for (const h of records.hues) byFrame.set(`${h.mode} ${h.quality}`, [...(byFrame.get(`${h.mode} ${h.quality}`) ?? []), h]);
  for (const [frame, hues] of byFrame) {
    for (const colour of ['red', 'blue'] as const)
      if (!hues.some((h) => h.named === colour)) problems.push(`VIS-018 ${frame}: no ${colour} item was sampled`);
    for (const h of hues.filter((x) => x.named))
      if (h.hue === null || hueDistance(h.hue, NAMED_HUES[h.named!]) > HUE_TOLERANCE)
        problems.push(`VIS-018 ${frame}: the ${h.named} item ${h.item} has hue ${h.hue?.toFixed(0)}`);
    const plain = hues.filter((x) => !x.named);
    if (plain.length === 0) problems.push(`VIS-018 ${frame}: no uncoloured item was sampled`);
    for (const p of plain)
      for (const colour of ['red', 'blue'] as const)
        for (const n of hues.filter((x) => x.named === colour))
          // Alike: about the same hue, lightness and colourfulness (a grey is not a blue, whatever its computed hue).
          if (
            p.hue !== null &&
            n.hue !== null &&
            hueDistance(p.hue, n.hue) <= HUE_TOLERANCE &&
            Math.abs(p.lightness! - n.lightness!) < 0.15 &&
            Math.abs(p.saturation! - n.saturation!) < 0.25
          )
            problems.push(
              `VIS-018 ${frame}: the uncoloured item ${p.item} (hue ${p.hue.toFixed(0)}) looks like the ${colour} item ${n.item}`,
            );
  }
  return problems;
}

const pct = (f: number) => `${(f * 100).toFixed(2)} %`;

/** All the checks of the journey, in one page task. */
export async function runAll(): Promise<Parameters<typeof lookProblems>[0]> {
  const pairs: PairRecord[] = [];
  for (const mode of MODES) for (const quality of ['low', 'medium'] as const) pairs.push(...(await statePairs(mode, quality)));
  pairs.push(...(await statePairs('light', 'medium', true)));
  const motion = [await beltMotion(false), await beltMotion(true)];
  const hues: HueRecord[] = [];
  for (const mode of ['light', 'dark'] as const)
    for (const quality of ['low', 'medium'] as const) hues.push(...(await itemHues(mode, quality)));
  return { pairs, motion, picks: await picks(), looks: await looks(), hues };
}
