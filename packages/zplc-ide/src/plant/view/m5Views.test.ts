import { afterEach, describe, expect, it } from 'bun:test';
import type { PartView, PlantCore, ScenePart } from '../contracts';
import { createPlantCore } from '../core/plantCore';
import { cuesFor } from './cues';
import { crateWallMatrices, itemToneOf, OUTLINED_PARTS, partDecor, partShape } from './geometry';
import { paletteFor } from './displayModes';

// The view kinds V7 handles (view/stations.test.ts); here they are compared with what the REAL parts publish through the REAL core.
const M5_KINDS = [
  'lift',
  'stacker-crane',
  'stacker-mast',
  'stacker-rack',
  'machining-centre',
  'machining-door',
  'machining-door',
  'limit-switch',
  'aligner',
  'chute',
] as const;

const cores: PlantCore[] = [];
afterEach(() => {
  for (const c of cores.splice(0)) c.dispose();
});
const part = (id: string, name: string, x: number, config: ScenePart['config'] = {}, y = 0.45, z = 0): ScenePart => ({
  id: name.toLowerCase(),
  part: id,
  name,
  position: [x, y, z],
  rotationYDeg: 0,
  config,
});
const make = async (parts: ScenePart[]) => {
  const core = await createPlantCore({ schemaVersion: 1, name: 'm5-views', parts, cameras: [] });
  cores.push(core);
  return core;
};
const run = (core: PlantCore, ms: number) => {
  for (let t = 0; t < ms; t += 10) core.advance(10);
};
/** Every M5 part, spread along x so nothing touches; the crate holds a workpiece. */
const all = () => [
  part('lift', 'Lift1', 0),
  part('stacker-crane', 'Crane1', 6, {}, 0),
  part('machining-centre', 'Mc1', 14),
  part('limit-switch', 'Lim1', 18),
  part('aligner', 'Align1', 22),
  part('chute', 'Chute1', 26),
  part('crate', 'Crate1', 30, {}, 0),
  part('workpiece', 'Wp1', 30, {}, 0.1),
];
const viewsOf = (core: PlantCore, kind: string): PartView[] => core.snapshot().parts.filter((v) => v.part === kind);
const slots = (view: PartView) => partDecor(view).map((d) => d.slot);

describe('M5 views from a real snapshot', () => {
  it('VIS-003 the real part kinds are the strings V7 handles, in the order the parts publish them', async () => {
    const views = (await make(all())).snapshot().parts;
    expect(views.map((v) => v.part)).toEqual([
      'lift',
      'stacker-crane',
      'stacker-mast',
      'stacker-rack',
      ...M5_KINDS.slice(4),
      'crate',
      'workpiece',
    ]);
    for (const v of views) expect(v.pose.part).toBe(v.part);
    for (const kind of ['lift', 'stacker-crane', 'machining-centre', 'limit-switch', 'aligner', 'chute'])
      expect(OUTLINED_PARTS.has(kind)).toBe(true);
  });

  it('VIS-003 every real M5 view is matched by partShape and cuesFor, and has the decor of its own case', async () => {
    const core = await make(all());
    run(core, 300);
    const views = core.snapshot().parts;
    for (const v of views) {
      expect(partShape(v)).toEqual({ shape: 'box', size: v.pose.size });
      expect(cuesFor(v)).toBeDefined();
    }
    expect(slots(views.find((v) => v.part === 'lift')!)).toEqual(['direction', 'rail-a', 'rail-b']);
    expect(slots(views.find((v) => v.part === 'stacker-crane')!)).toEqual(['extension']);
    expect(slots(views.find((v) => v.part === 'machining-centre')!)).toEqual(['roof', 'post-a', 'post-b', 'post-c', 'post-d', 'progress']);
    for (const kind of ['stacker-mast', 'machining-door', 'limit-switch', 'aligner', 'chute'])
      expect(slots(views.find((v) => v.part === kind)!)).toEqual([]);
  });

  it('VIS-003 the real lift publishes fraction, text and level, the cue shows them and the rails span the stroke', async () => {
    const core = await make([part('lift', 'Lift1', 0)]);
    const at = () => viewsOf(core, 'lift')[0]!;
    expect(at().state).toMatchObject({ fraction: 0, text: 'level 1', level: 1 });
    expect(cuesFor(at()).value).toEqual({ text: 'level 1', fraction: 0 });
    const homeRail = partDecor(at())[1]!;
    core.apply({ 'Lift1.up': true });
    run(core, 1000);
    expect(at().state.text).toBe('travelling');
    const mid = at().state.fraction as number;
    expect(mid).toBeGreaterThan(0.1);
    expect(mid).toBeLessThan(1);
    expect(partDecor(at())[1]!.size[1]).toBe(homeRail.size[1]); // the guide rails span the whole stroke, whatever the platform height
    run(core, 3000);
    expect(at().state).toMatchObject({ fraction: 1, text: 'level 2', level: 2 });
    expect(cuesFor(at()).value).toEqual({ text: 'level 2', fraction: 1 });
    expect(cuesFor(at()).state).toBe('true'); // atLevel2 is TRUE: the cue tells the active signal
  });

  it('VIS-003 the real crane tells its bay, level and fork, and a fork that is out draws its tip bar', async () => {
    const core = await make([part('stacker-crane', 'Crane1', 0, {}, 0)]);
    const crane = () => viewsOf(core, 'stacker-crane')[0]!;
    expect(crane().state).toMatchObject({ fraction: 0, text: 'bay 0, level 0, fork centre', bay: 0, level: 0, raised: false });
    core.apply({ 'Crane1.bay': 2, 'Crane1.level': 1 });
    run(core, 300);
    core.advance(10);
    core.apply({ 'Crane1.forkRight': true });
    for (let i = 0; i < 400 && core.sense()['Crane1.forkAtRight'] !== true; i += 1) core.advance(10);
    expect(crane().state.text).toMatch(/^bay \d, level \d, fork right$/);
    expect(crane().state.fraction).toBeGreaterThan(0.9);
    expect(cuesFor(crane()).value?.fraction).toBe(crane().state.fraction as number);
    expect(slots(crane())).toEqual(['extension', 'tip']);
  });

  it('VIS-003 the real machining centre tells busy with its progress and its doors, and done afterwards', async () => {
    const core = await make([
      part('belt', 'Feed1', -1, { length: 1 }),
      part('machining-centre', 'Mc1', 0, { cycleMs: 1000 }),
      part('workpiece', 'Blank1', -0.3),
    ]);
    core.apply({ 'Feed1.run': true, 'Mc1.feed': true });
    run(core, 1500);
    core.apply({ 'Feed1.run': false, 'Mc1.feed': false });
    run(core, 800);
    core.apply({ 'Mc1.start': true });
    run(core, 500);
    const mc = () => viewsOf(core, 'machining-centre')[0]!;
    expect(mc().state.busy).toBe(true);
    expect(String(mc().state.text)).toMatch(/^busy \d\.\d s$/);
    expect(cuesFor(mc()).value?.text).toBe(mc().state.text as string);
    const bar = partDecor(mc()).find((d) => d.slot === 'progress')!;
    expect(bar.lit).toBe(true);
    expect(bar.size[0]).toBeGreaterThan(0);
    expect(viewsOf(core, 'machining-door')).toHaveLength(2);
    run(core, 1000);
    expect(mc().state.busy).toBe(false);
    expect(String(mc().state.text)).toContain('done');
  });

  it('VIS-003 a real crate is an item tagged crate: its walls are drawn and the workpiece inside it is not a crate', async () => {
    const core = await make(all());
    run(core, 500);
    const items = core.snapshot().items;
    expect(items.map((i) => i.tag)).toEqual(['crate', undefined]);
    expect(items[0]).toMatchObject({ part: 'box', size: [0.8, 0.25, 0.6] }); // the snapshot says box: the view keys on the tag
    expect(crateWallMatrices(items)).toHaveLength(64); // four walls of the one crate
    const p = paletteFor({ mode: 'light', reducedMotion: false });
    expect(itemToneOf(items[0]!, p)).toBe(p.item); // a crate is drawn in the plain item tone, as a box
  });

  it(
    'VIS-003 the real stacker rack publishes its grid, the lift its stroke, and the view draws cell rails and full guide ' + 'rails',
    async () => {
      const core = await make([part('stacker-crane', 'Crane1', 0, {}, 0), part('lift', 'Lift1', 6)]);
      const rack = viewsOf(core, 'stacker-rack')[0]!;
      const { columns, levels, bayPitchM, levelPitchM } = rack.state as Record<string, number>;
      expect(columns).toBeGreaterThan(1);
      expect(levels).toBeGreaterThan(1);
      expect(bayPitchM).toBeGreaterThan(0);
      expect(levelPitchM).toBeGreaterThan(0);
      expect(slots(rack)).toHaveLength(levels + 1 + (columns - 1));
      const lift = viewsOf(core, 'lift')[0]!;
      expect(lift.state.strokeM).toBeGreaterThan(0);
      expect(lift.state.levelPitchM).toBeGreaterThan(0);
    },
  );
});
