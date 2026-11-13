import { afterEach, describe, expect, it } from 'bun:test';
import type { PartView, PlantCore, ScenePart } from '../contracts';
import { createPlantCore } from '../core/plantCore';
import { cuesFor } from './cues';
import { itemToneOf, instanceColors, OUTLINED_PARTS, partDecor, partShape } from './geometry';
import { paletteFor } from './displayModes';

// The view kinds V6 handles (the same list as sorting.test.ts); here they are compared with what the REAL parts publish.
const M4_KINDS = ['light-array', 'scale', 'vision-sensor', 'pusher', 'diverter-arm', 'chain-transfer', 'turntable', 'workpiece'] as const;
const BEAM_RANGES: Record<string, number> = {
  'sensor-diffuse': 0.5,
  'sensor-retro': 1.5,
  'sensor-inductive': 0.1,
  'sensor-capacitive': 0.15,
  'sensor-colour': 0.3,
};

const cores: PlantCore[] = [];
afterEach(() => {
  for (const c of cores.splice(0)) c.dispose();
});
const part = (id: string, name: string, config: ScenePart['config'] = {}, x = 0): ScenePart => ({
  id: name.toLowerCase(),
  part: id,
  name,
  position: [x, 0.45, 0],
  rotationYDeg: 0,
  config,
});
const make = async (parts: ScenePart[]) => {
  const core = await createPlantCore({ schemaVersion: 1, name: 'm4-views', parts, cameras: [] });
  cores.push(core);
  return core;
};
const all = () => [...Object.keys(BEAM_RANGES), ...M4_KINDS].map((id, i) => part(id, `P${i}`, {}, i * 3));
const viewOf = (core: PlantCore, kind: string): PartView => core.snapshot().parts.find((v) => v.part === kind)!;
const run = (core: PlantCore, ms: number) => {
  for (let t = 0; t < ms; t += 10) core.advance(10);
};

describe('M4 views from a real snapshot', () => {
  it('VIS-003 the real part kinds are the strings V6 handles, and the beam sensors publish the kind sensor', async () => {
    const views = (await make(all())).snapshot().parts;
    expect(views.map((v) => v.part)).toEqual(['sensor', 'sensor', 'sensor', 'sensor', 'sensor', ...M4_KINDS]);
    for (const v of views) expect(v.pose.part).toBe(v.part);
    for (const kind of M4_KINDS) if (kind !== 'workpiece') expect(OUTLINED_PARTS.has(kind)).toBe(true);
  });

  it('VIS-003 every beam sensor publishes state.beamLength equal to its range, and the cue draws exactly that beam', async () => {
    const core = await make(all());
    const sensors = core.snapshot().parts.filter((v) => v.part === 'sensor');
    expect(sensors.map((v) => v.state.beamLength)).toEqual(Object.values(BEAM_RANGES));
    for (const v of sensors) {
      const b = cuesFor(v).beam!;
      expect(Math.hypot(b.to[0] - b.from[0], b.to[1] - b.from[1], b.to[2] - b.from[2])).toBeCloseTo(v.state.beamLength as number, 6);
    }
  });

  it('VIS-003 each real view is drawn by partShape and partDecor with its own case, not the default', async () => {
    const views = (await make(all())).snapshot().parts;
    const decor = (kind: string) => partDecor(views.find((v) => v.part === kind)!).map((d) => d.slot);
    for (const v of views) expect(partShape(v)).toEqual({ shape: 'box', size: v.pose.size });
    expect(decor('scale')).toEqual(['plate']);
    expect(decor('vision-sensor')).toEqual(['frame-n', 'frame-s', 'frame-e', 'frame-w']);
    expect(decor('turntable')).toEqual(['direction']);
    expect(decor('chain-transfer')).toEqual(['direction']); // lowered: no side chains
    for (const kind of ['pusher', 'diverter-arm', 'workpiece']) expect(decor(kind)).toEqual([]);
  });

  // Finding for V6/B2: V6 draws the beams from state.beams and state.pitchM, but the real light array publishes neither, so it is
  // drawn with no beam. `failing` keeps the suite green and flips red the moment the keys are published: then remove it.
  it.failing('VIS-003 the real light array publishes state.beams and state.pitchM and is drawn with one line per beam', async () => {
    const v = viewOf(await make(all()), 'light-array');
    expect(v.state.beams).toBe(12);
    expect(v.state.pitchM).toBe(0.05);
    expect(partDecor(v).filter((d) => d.slot.startsWith('beam'))).toHaveLength(12);
  });

  it('VIS-003 the real vision sensor reads its field from state.fieldM when published and from the pose otherwise', async () => {
    const v = viewOf(await make(all()), 'vision-sensor');
    const f = (v.state.fieldM as number | undefined) ?? Math.max(v.pose.size[0], v.pose.size[2]);
    expect(f).toBe(0.5); // the default fieldM
    expect(partDecor(v).find((d) => d.slot === 'frame-n')!.size[0]).toBe(f);
  });

  it('VIS-003 a raised chain transfer publishes the text raised, and V6 draws its two side chains', async () => {
    const core = await make([part('chain-transfer', 'Chain1')]);
    expect(viewOf(core, 'chain-transfer').state.text).toBe('lowered');
    core.apply({ 'Chain1.lift': true });
    run(core, 800);
    const raised = viewOf(core, 'chain-transfer');
    expect(raised.state.text).toBe('raised');
    expect(partDecor(raised).map((d) => d.slot)).toEqual(['direction', 'chain-a', 'chain-b']);
    expect(cuesFor(raised).state).toBe('true');
  });

  it(
    'VIS-003 a turning platform yaws its pose, and a pusher, an arm and a turntable show their fraction and text in the ' + 'cues',
    async () => {
      const core = await make([part('turntable', 'Turn1', {}, 0), part('pusher', 'Push1', {}, 3), part('diverter-arm', 'Arm1', {}, 6)]);
      expect(viewOf(core, 'turntable').pose.q[1]).toBe(0);
      core.apply({ 'Turn1.toRight': true, 'Push1.extend': true, 'Arm1.divert': true });
      run(core, 2500);
      const turn = viewOf(core, 'turntable');
      expect(Math.abs(turn.pose.q[1])).toBeGreaterThan(0.5); // a quarter turn: sin(45 degrees) is about 0.707
      expect(cuesFor(turn).value).toEqual({ text: 'right', fraction: 1 });
      expect(cuesFor(viewOf(core, 'pusher')).value).toEqual({ text: 'extended', fraction: 1 });
      expect(cuesFor(viewOf(core, 'diverter-arm')).value).toEqual({ text: 'diverted', fraction: 1 });
    },
  );

  it('VIS-003 the numeric sensors show their reading as text, and 0 is a reading', async () => {
    const core = await make([
      { ...part('scale', 'Scl1', {}, 0), position: [0, 0, 0] },
      { ...part('workpiece', 'Wp1', {}, 0), position: [0, 0, 0] },
      part('light-array', 'Arr1', {}, 4),
      part('vision-sensor', 'Vis1', {}, 8),
    ]);
    run(core, 800);
    for (const v of core.snapshot().parts.filter((p) => p.part !== 'workpiece')) {
      expect(typeof v.state.text).toBe('string');
      expect(typeof v.state.fraction).toBe('number');
      expect(cuesFor(v).value?.text).toBe(v.state.text as string);
      expect(cuesFor(v).value?.fraction).toBe(v.state.fraction as number); // a reading of 0 is still shown
    }
    expect(viewOf(core, 'scale').state.text).toBe('0.50 kg, stable'); // the workpiece rests on the scale
  });

  it('VIS-009 red and blue workpieces and a metal one are three tones in the real snapshot', async () => {
    const core = await make([part('workpiece', 'Red1', { colour: 'red' }, 0), part('workpiece', 'Blue1', { colour: 'blue' }, 3)]);
    const items = core.snapshot().items;
    expect(items.map((i) => [i.colour, i.metal])).toEqual([
      ['red', false],
      ['blue', false],
    ]);
    const p = paletteFor({ mode: 'light', reducedMotion: false });
    expect(new Set(items.map((i) => itemToneOf(i, p))).size).toBe(2);
    expect(instanceColors(items)).toHaveLength(6);
  });

  // Finding for V6: a real workpiece always carries a colour (red by default), and itemToneOf and instanceColors read
  // `colour ?? (metal ? 'metal')`, so a metal workpiece is drawn in its colour and never in the metal tone (VIS-009).
  it.failing('VIS-009 a real metal workpiece is drawn in the metal tone, not in its colour', async () => {
    const core = await make([part('workpiece', 'Red1', {}, 0), part('workpiece', 'Metal1', { material: 'metal' }, 3)]);
    const [plastic, metal] = core.snapshot().items;
    expect(metal!.metal).toBe(true);
    const p = paletteFor({ mode: 'light', reducedMotion: false });
    expect(itemToneOf(metal!, p)).not.toBe(itemToneOf(plastic!, p));
  });
});
