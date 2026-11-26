/**
 * The sensor models (plan-vis C3; VIS-014, VIS-016): the diffuse sensor of belt-to-sensor, the light array, scale and vision sensor of
 * the reference scenes that use them, and a limit switch beside a belt, as the real plant core publishes them.
 */
import { afterEach, describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PartView, PlantCore, PlantSceneFile } from '../../contracts';
import { createPlantCore } from '../../core/plantCore';
import { paletteFor } from '../displayModes';
import { partColour } from '../look';
import { modelBounds, partModel, pieceExtent } from './index';
import { beltToSensor, bottom, shown, slot, top } from './models.fixtures';
import type { Piece } from './shared';
import { LIMIT_SWITCH, sensorMount, SENSORS } from './sensors';

const plant = beltToSensor();
const SCENES = join(import.meta.dir, '../../../../plant-scenes');
const cores: PlantCore[] = [];
afterEach(() => {
  for (const core of cores.splice(0)) core.dispose();
});

/** A scene in a fresh plant core: a reference scene by id, or a scene of the test's own. */
async function open(scene: string | PlantSceneFile) {
  const file = typeof scene === 'string' ? (JSON.parse(readFileSync(join(SCENES, scene, 'scene.json'), 'utf8')) as PlantSceneFile) : scene;
  const core = await createPlantCore(file);
  cores.push(core);
  const view = (id: string): PartView => core.snapshot().parts.find((p) => p.id === id)!;
  /** The pieces of a part as the renderer draws them: mounted on the belt it sits on or beside, if any. */
  const model = (v: PartView): Piece[] => partModel(v, { travel: 0, mount: sensorMount(v, core.snapshot().parts) })!;
  /** Emits one item and runs `belt` until `signal` is TRUE, then stops the belt and lets the item settle. */
  const runUntil = (belt: string, signal: string, commands: Record<string, boolean> = {}) => {
    core.apply({ 'Source1.emit': true, ...commands });
    core.advance(50);
    core.apply({ 'Source1.emit': false, [belt]: true });
    for (let t = 0; t < 15_000 && core.sense()[signal] !== true; t += 20) core.advance(20);
    core.apply({ [belt]: false });
    core.advance(600);
    expect(core.sense()[signal]).toBe(true);
  };
  return { core, view, model, runUntil };
}

/** The characters a row of seven-segment cells shows, from the segments `<prefix><cell>-<a..g>` that are drawn. */
const GLYPHS: Readonly<Record<string, string>> = {
  abcdef: '0',
  bc: '1',
  abdeg: '2',
  abcdg: '3',
  bcfg: '4',
  acdfg: '5',
  acdefg: '6',
  abc: '7',
  abcdefg: '8',
  abcdfg: '9',
  g: '-',
  '': ' ',
};
const readout = (pieces: readonly Piece[], prefix: string, cells: number) =>
  Array.from({ length: cells }, (_, c) => {
    const lit = shown(pieces, `${prefix}${c}-`)
      .map((p) => p.slot.slice(-1))
      .sort()
      .join('');
    const point = shown(pieces, `point-${c}`).length > 0 ? '.' : '';
    return (GLYPHS[lit] ?? '?') + point;
  }).join('');
const rounded = (v: readonly number[]) => v.map((c) => Number(c.toFixed(6)) + 0);

describe('sensor models (VIS-014)', () => {
  it('PRT-009 the sensor family draws the diffuse sensor, the light array, the scale, the vision sensor and the limit switch', () => {
    expect(Object.keys(SENSORS)).toEqual(['sensor', 'light-array', 'scale', 'vision-sensor', 'limit-switch']);
  });

  it('VIS-016 the diffuse sensor draws a dashed beam while clear and a solid one with its lamp lit while it detects', async () => {
    const v = await plant.views();
    const clear = partModel(v['eye-far']!)!;
    expect(slot(clear, 'beam').visible).toBe(false);
    expect(shown(clear, 'dash-').length).toBeGreaterThan(5);
    expect(slot(clear, 'lamp').role).toBe('lampOff');
    const core = plant.core();
    core.act('EyeFar', 'stuckOn');
    core.advance(5);
    const eye = core.snapshot().parts.find((p) => p.id === 'eye-far')!;
    const detecting = partModel(eye)!;
    expect(slot(detecting, 'beam').visible).toBe(true);
    expect(shown(detecting, 'dash-')).toEqual([]);
    expect(slot(detecting, 'lamp').role).toBe('lamp');
    // The beam runs from the lens for the sensor's range, and the post reaches the floor.
    const beam = slot(detecting, 'beam');
    expect(beam.at[0] + pieceExtent(beam)[0]).toBeCloseTo(eye.state.beamLength as number, 9);
    expect(bottom(slot(detecting, 'base'))).toBeCloseTo(-eye.pose.p[1], 9);
  });

  it('VIS-016 the output lamp of a sensor is a lit window over the top of its housing (2 % of the part box)', async () => {
    const v = await plant.views();
    const [x, , z] = pieceExtent(slot(partModel(v['eye-far']!)!, 'lamp'));
    expect(4 * x * z).toBeGreaterThanOrEqual(0.0015); // m2: at least half of the 0.07 x 0.04 top face
  });

  it('VIS-016 a bezel round the lens glows while the sensor detects and is dark while it is clear', async () => {
    const v = await plant.views();
    expect(slot(partModel(v['eye-far']!)!, 'bezel').role).toBe('lampOff');
    const core = plant.core();
    core.act('EyeFar', 'stuckOn');
    core.advance(5);
    const lit = partModel(core.snapshot().parts.find((p) => p.id === 'eye-far')!)!;
    expect(slot(lit, 'bezel').role).toBe('lamp');
  });

  it('VIS-014 a sensor beside a belt sits on a bracket bolted to the belt frame, with a fine beam and no post to the floor', async () => {
    const v = await plant.views();
    const eye = v['eye-far']!;
    // The outer face of the near rail, at its top: 0.17 m ahead of the lens and 0.088 m below it (scene belt-to-sensor).
    const mount = sensorMount(eye, Object.values(v))!;
    expect(mount.map((c) => Number(c.toFixed(6)) + 0)).toEqual([0.17, -0.088, 0]);
    const pieces = partModel(eye, { travel: 0, mount })!;
    expect(pieces.some((p) => p.slot === 'post' || p.slot === 'base')).toBe(false);
    const plate = slot(pieces, 'bracket-plate');
    expect(plate.at[0] + pieceExtent(plate)[0]).toBeCloseTo(mount[0], 9); // flat on the rail's outer face
    expect(bottom(plate)).toBeLessThan(mount[1]); // and down past the rail's top edge
    const arm = slot(pieces, 'bracket-arm');
    expect(arm.at[1] + pieceExtent(arm)[1]).toBeCloseTo(bottom(slot(pieces, 'housing')), 9); // the arm carries the housing
    expect(pieces.filter((p) => p.slot.startsWith('bolt-')).length).toBeGreaterThanOrEqual(2);
    // A fine beam: no thicker than 6 mm, solid or dashed.
    for (const p of pieces.filter((x) => x.role === 'beam')) expect(2 * pieceExtent(p)[1]).toBeLessThanOrEqual(0.006);
    // No belt frame in reach: the sensor keeps a post to the floor.
    expect(sensorMount(eye, [eye, v.start!])).toBeNull();
    // Nor does a bracket rise to a sensor far above the rail, as the stacked sensors of a height check are (height-sorting-chain: 0.24
    // and 0.34 m above it): on posts their feet differ, where two brackets on one spot would be drawn twice.
    for (const y of [0.75, 0.85])
      expect(sensorMount({ ...eye, pose: { ...eye.pose, p: [eye.pose.p[0], y, eye.pose.p[2]] } }, Object.values(v))).toBeNull();
  });

  it('VIS-014 the sensor body is a neutral grey, its own colour in every display mode', () => {
    for (const mode of ['light', 'dark'] as const) {
      const hex = partColour('sensor', paletteFor({ mode, reducedMotion: false }));
      const [r, g, b] = [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
      expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeLessThanOrEqual(16);
    }
  });
});

describe('sensor kinds (owner decision 4; VIS-014)', () => {
  const KINDS = ['diffuse', 'retro-reflective', 'inductive', 'capacitive', 'colour'] as const;
  /** The pieces of a beam sensor of each kind, as the core publishes it: the kind comes from its catalogue entry. */
  async function kinds() {
    const ids = ['sensor-diffuse', 'sensor-retro', 'sensor-inductive', 'sensor-capacitive', 'sensor-colour'];
    const parts = ids.map((id, i) => ({
      id: `s${i}`,
      part: id,
      name: `S${i}`,
      position: [0, 0.5, i] as [number, number, number],
      rotationYDeg: 0,
      config: {},
    }));
    const { core, view } = await open({ schemaVersion: 1, name: 'kinds', parts, cameras: [] });
    expect(core.snapshot().parts.map((v) => v.state.kind)).toEqual([...KINDS]);
    return ids.map((_, i) => partModel(view(`s${i}`))!);
  }
  const signature = (pieces: readonly Piece[]) =>
    JSON.stringify(pieces.filter((p) => !p.slot.startsWith('dash-')).map((p) => [p.slot, p.shape, p.role]));

  it('each kind is built from a different set of pieces, at scene size', async () => {
    const models = await kinds();
    expect(new Set(models.map(signature)).size).toBe(KINDS.length);
    const slots = models.map((m) => new Set(m.map((p) => p.slot)));
    expect(slots[0]!.has('housing') && slots[0]!.has('lens')).toBe(true); // the diffuse sensor as it was
    expect(slots[1]!.has('reflector')).toBe(true); // a reflector at the far end of the beam
    expect(slots[2]!.has('barrel') && slots[2]!.has('nut-a') && slots[2]!.has('nut-b')).toBe(true); // a threaded metal barrel
    expect(slots[3]!.has('barrel') && slots[3]!.has('knob')).toBe(true); // a plastic barrel with its sensitivity knob
    expect(slots[4]!.has('lens-a') && slots[4]!.has('lens-b')).toBe(true); // a twin lens: emitter and receiver
  });

  it('the reflector stands where the beam ends, and the two barrels differ in material', async () => {
    const [, retro, inductive, capacitive] = await kinds();
    const beam = slot(retro!, 'dash-0');
    expect(beam).toBeDefined();
    const reflector = slot(retro!, 'reflector');
    expect(reflector.at[0]).toBeCloseTo(1.5, 2); // the retro-reflective sensor's default range
    expect(slot(inductive!, 'barrel').role).toBe('steel');
    expect(slot(capacitive!, 'barrel').role).toBe('housing');
  });

  it('every kind keeps the cues of VIS-016: the output lamp, the bezel and the beam, solid or dashed', async () => {
    for (const m of await kinds()) for (const s of ['lamp', 'bezel', 'beam', 'dash-0']) expect(slot(m, s)).toBeDefined();
  });
});

describe('light array (VIS-014, VIS-016)', () => {
  it('VIS-014 a column at each end of the beams, at the heights the core casts them, each on a stand to the floor', async () => {
    const { view, model } = await open('height-sorting-turntable');
    const v = view('array');
    const [beams, pitch, span] = [v.state.beams as number, v.state.pitchM as number, v.pose.size[2]];
    const pieces = model(v);
    for (let i = 0; i < beams; i++) {
      const beam = slot(pieces, `beam-${i}`);
      expect(beam.at[1]).toBeCloseTo((i + 0.5) * pitch, 9);
      expect(beam.at[2] - pieceExtent(beam)[2]).toBeCloseTo(0, 9); // from the emitter's window
      expect(beam.at[2] + pieceExtent(beam)[2]).toBeCloseTo(span, 9); // to the receiver's
      expect(2 * pieceExtent(beam)[1]).toBeLessThanOrEqual(0.006);
    }
    const [emitter, receiver] = [slot(pieces, 'column-a'), slot(pieces, 'column-b')];
    expect(emitter.at[2] + pieceExtent(emitter)[2]).toBeCloseTo(0, 9);
    expect(receiver.at[2] - pieceExtent(receiver)[2]).toBeCloseTo(span, 9);
    for (const column of [emitter, receiver]) {
      expect(bottom(column)).toBeLessThan(0);
      expect(top(column)).toBeGreaterThan(beams * pitch);
    }
    for (const end of ['a', 'b']) expect(bottom(slot(pieces, `base-${end}`))).toBeCloseTo(-v.pose.p[1], 9);
  });

  it('VIS-016 every beam is dashed while clear; a box turns the beams up to its height solid and lights the lamp', async () => {
    const { core, view, model, runUntil } = await open('height-sorting-turntable');
    const clear = model(view('array'));
    const beams = view('array').state.beams as number;
    expect(shown(clear, 'beam-')).toEqual([]);
    for (let i = 0; i < beams; i++) expect(shown(clear, `dash-${i}-`).length).toBeGreaterThanOrEqual(3);
    expect(slot(clear, 'lamp').role).toBe('lampOff');
    runUntil('Infeed.run', 'LightArray1.detect');
    const broken = Math.round((core.sense()['LightArray1.height'] as number) / (view('array').state.pitchM as number));
    expect(broken).toBe(6); // the first box of the scene is 0.3 m tall
    const detecting = model(view('array'));
    expect(shown(detecting, 'beam-').map((p) => p.slot)).toEqual(Array.from({ length: broken }, (_, i) => `beam-${i}`));
    for (let i = 0; i < beams; i++) expect(shown(detecting, `dash-${i}-`).length > 0).toBe(i >= broken);
    expect(slot(detecting, 'lamp').role).toBe('lamp');
  });
});

describe('scale (VIS-014, VIS-016)', () => {
  it('VIS-014 a weighing frame on the belt within its footprint, and an indicator on a post bolted to the back rail', async () => {
    const { view, model } = await open('weight-sorting');
    const v = view('scale');
    // The top of the outer face of the infeed's back rail, under the middle of the scale (weight-sorting: a 0.6 m belt, 30 mm rails).
    expect(rounded(sensorMount(v, [v, view('infeed')])!)).toEqual([0, 0.012, -0.33]);
    const pieces = model(v);
    const [length, , width] = v.pose.size;
    for (const p of pieces.filter((x) => x.slot.startsWith('weigh-'))) {
      const e = pieceExtent(p);
      expect(Math.abs(p.at[0]) + e[0]).toBeLessThanOrEqual(length / 2 + 1e-9);
      expect(Math.abs(p.at[2]) + e[2]).toBeLessThanOrEqual(width / 2 + 1e-9);
      expect(bottom(p)).toBeCloseTo(0, 9); // on the band
    }
    expect(shown(pieces, 'weigh-').length).toBe(4);
    const post = slot(pieces, 'post');
    expect(post.at[2] + pieceExtent(post)[2]).toBeLessThanOrEqual(-0.33 + 1e-9); // outside the rail's outer face
    expect(top(post)).toBeCloseTo(bottom(slot(pieces, 'indicator')), 9);
    expect(bottom(slot(pieces, 'indicator'))).toBeGreaterThan(0.1); // above the items on the belt
    // With no belt under it, the scale is a platform on the floor with the indicator on a post of its own.
    const alone = partModel(v, { travel: 0, mount: sensorMount(v, [v]) })!;
    expect(bottom(slot(alone, 'base'))).toBeCloseTo(-v.pose.p[1], 9);
    expect(slot(alone, 'platform').visible).toBe(true);
  });

  it('VIS-016 the indicator reads the weight the core publishes, with its stable lamp lit while the reading is stable', async () => {
    const { view, model, runUntil } = await open('weight-sorting');
    const empty = model(view('scale'));
    expect(readout(empty, 'digit-', 5)).toBe('  0.00');
    expect(slot(empty, 'stable').role).toBe('lampOff');
    runUntil('Infeed.run', 'Scale1.stable', { 'Blade1.extend': true });
    const loaded = model(view('scale'));
    expect(readout(loaded, 'digit-', 5)).toBe('  5.00'); // the first box of the scene weighs 5 kg
    expect(slot(loaded, 'stable').role).toBe('lamp');
    // A reading of up to 200 kg fits the five cells.
    const heavy = { ...view('scale'), signals: { ...view('scale').signals, 'Scale1.weight': 187.25 } };
    expect(readout(model(heavy), 'digit-', 5)).toBe('187.25');
  });

  it(
    'VIS-016 the scale stable signal lights a prominent top beacon and front status band comparable to the diffuse sensor ' + 'lamp',
    async () => {
      const { view, model } = await open('weight-sorting');
      const base = view('scale');
      const unstable = model({ ...base, signals: { ...base.signals, 'Scale1.weight': 12.5, 'Scale1.stable': false } });
      const settled = model({ ...base, signals: { ...base.signals, 'Scale1.weight': 12.5, 'Scale1.stable': true } });
      expect(readout(unstable, 'digit-', 5)).toBe(' 12.50');
      expect(readout(settled, 'digit-', 5)).toBe(' 12.50');

      expect(slot(unstable, 'stable').role).toBe('lampOff');
      expect(slot(settled, 'stable').role).toBe('lamp');
      const beaconOff = slot(unstable, 'stable-beacon');
      const beaconOn = slot(settled, 'stable-beacon');
      expect(beaconOff).toBeDefined();
      expect(beaconOn).toBeDefined();
      expect(beaconOff.role).toBe('lampOff');
      expect(beaconOn.role).toBe('lamp');
      expect(bottom(beaconOn)).toBeGreaterThanOrEqual(top(slot(settled, 'indicator')) - 1e-9);

      // Front status band (>= 0.16 m wide x >= 0.02 m tall) plus top beacon meet and exceed the diffuse sensor lamp benchmark.
      const [sx, sy] = pieceExtent(slot(settled, 'stable'));
      expect(2 * sx).toBeGreaterThanOrEqual(0.16);
      expect(2 * sy).toBeGreaterThanOrEqual(0.02);
      const [bx, by, bz] = pieceExtent(beaconOn);
      expect(4 * bx * bz).toBeGreaterThanOrEqual(0.003);
      expect(4 * sx * sy + 4 * bx * by).toBeGreaterThanOrEqual(0.004);
    },
  );
});

describe('vision sensor (VIS-014, VIS-016)', () => {
  it('VIS-014 a camera above the middle of its field, on an arm from a post on the back rail, the field marked on the belt', async () => {
    const { view, model } = await open('vision-sorting');
    const v = view('eye');
    expect(rounded(sensorMount(v, [v, view('infeed')])!)).toEqual([0, 0.012, -0.33]);
    const pieces = model(v);
    const field = v.pose.size[0];
    const lens = slot(pieces, 'lens');
    expect([lens.at[0], lens.at[2]]).toEqual([0, 0]);
    expect(bottom(lens)).toBeCloseTo(field, 9); // as high above the belt as its field is wide
    const post = slot(pieces, 'post');
    expect(post.at[2] + pieceExtent(post)[2]).toBeLessThanOrEqual(-0.33 + 1e-9);
    expect(top(post)).toBeGreaterThan(bottom(slot(pieces, 'arm')));
    // The four sides of the field, on the band, as wide as the field.
    for (const side of ['n', 's', 'e', 'w']) {
      const edge = slot(pieces, `field-${side}`);
      expect(bottom(edge)).toBeCloseTo(0, 9);
      expect(Math.max(Math.abs(edge.at[0]), Math.abs(edge.at[2]))).toBeCloseTo(field / 2, 9);
    }
    // No belt under it: the post stands on the floor.
    const alone = partModel(v, { travel: 0, mount: sensorMount(v, [v]) })!;
    expect(bottom(slot(alone, 'base'))).toBeCloseTo(-v.pose.p[1], 9);
  });

  it('VIS-016 the field is dashed while it is empty; an item in it turns it solid, lights the ring light and shows its code', async () => {
    const { view, model, runUntil } = await open('vision-sorting');
    const empty = model(view('eye'));
    expect(shown(empty, 'field-')).toEqual([]);
    expect(shown(empty, 'edge-').length).toBeGreaterThanOrEqual(12);
    expect(slot(empty, 'ring').role).toBe('lampOff');
    expect(readout(empty, 'code-', 1)).toBe('0');
    runUntil('Infeed.run', 'Vision1.detect');
    const seen = model(view('eye'));
    expect(shown(seen, 'field-').length).toBe(4);
    expect(shown(seen, 'edge-')).toEqual([]);
    expect(slot(seen, 'ring').role).toBe('lamp');
    expect(readout(seen, 'code-', 1)).toBe('2'); // the first box of the scene carries code 2
  });
});

describe('limit switch (VIS-014, VIS-016)', () => {
  /** A belt with a limit switch beside it whose lever reaches over the band (no reference scene has one). */
  const beside: PlantSceneFile = {
    schemaVersion: 1,
    name: 'limit switch beside a belt',
    parts: [
      { id: 'belt', part: 'belt', name: 'Belt1', position: [0, 0.5, 0], rotationYDeg: 0, config: { length: 2.4 } },
      { id: 'lim', part: 'limit-switch', name: 'Lim1', position: [0.3, 0.5, -0.4], rotationYDeg: 270, config: { reachM: 0.15 } },
    ],
    cameras: [{ name: 'Overview', position: [0, 2.2, 2.6], target: [0, 0.5, 0] }],
  };

  it('VIS-014 a switch body on a bracket bolted to the belt frame, its lever reaching to the end of the contact zone', async () => {
    const { view, model } = await open(beside);
    const v = view('lim');
    const reach = v.state.reachM as number;
    // The rail's outer face, at its top: 0.07 m ahead of the switch's face, which is reach / 2 (0.075 m) behind the middle of its zone.
    expect(rounded(sensorMount(v, [v, view('belt')])!)).toEqual([-0.005, -0.038, 0]);
    const pieces = model(v);
    expect(pieces.some((p) => p.slot === 'post')).toBe(false);
    expect(pieces.filter((p) => p.slot.startsWith('bolt-')).length).toBeGreaterThanOrEqual(2);
    const roller = slot(pieces, 'roller');
    expect(roller.at[0] + pieceExtent(roller)[0]).toBeCloseTo(reach / 2, 9);
    expect(slot(pieces, 'body').at[0] + pieceExtent(slot(pieces, 'body'))[0]).toBeLessThanOrEqual(-reach / 2 + 1e-9);
    // Not beside a belt: a post to the floor.
    const alone = partModel(v, { travel: 0, mount: sensorMount(v, [v]) })!;
    expect(bottom(slot(alone, 'base'))).toBeCloseTo(-v.pose.p[1], 9);
  });

  it('VIS-016 the lever swings and the lamp lights while the switch makes contact', async () => {
    const { core, view, model } = await open(beside);
    const open_ = model(view('lim'));
    expect(slot(open_, 'arm').yaw).toBe(0);
    expect(slot(open_, 'lamp').role).toBe('lampOff');
    core.act('Lim1', 'stuckOn');
    core.advance(5);
    const made = model(view('lim'));
    expect(Math.abs(slot(made, 'arm').yaw)).toBeGreaterThan(0.3);
    const [dx, dz] = [0, 2].map((i) => slot(made, 'roller').at[i]! - slot(open_, 'roller').at[i]!);
    expect(Math.hypot(dx!, dz!)).toBeGreaterThan(0.03);
    expect(slot(made, 'lamp').role).toBe('lamp');
  });

  it('VIS-016 the lever turns at least 20 degrees about its pivot in contact, and its pivot end stays where it is', async () => {
    const { core, view, model } = await open(beside);
    const free = model(view('lim'));
    core.act('Lim1', 'stuckOn');
    core.advance(5);
    const made = model(view('lim'));
    const angle = (p: { q?: readonly number[]; yaw: number }) => (p.q ? 2 * Math.atan2(p.q[1]!, p.q[3]!) : p.yaw);
    expect(Math.abs((angle(slot(made, 'arm')) - angle(slot(free, 'arm'))) * (180 / Math.PI))).toBeGreaterThanOrEqual(20);
    expect(slot(made, 'arm').q).toBeDefined();
    expect(slot(made, 'head').at).toEqual(slot(free, 'head').at);
    // The arm's pivot end: its centre less half its length along its own axis.
    const pivot = (pieces: ReturnType<typeof model>) => {
      const arm = slot(pieces, 'arm');
      const a = angle(arm);
      const h = arm.shape.kind === 'box' ? arm.shape.size[0] / 2 : 0;
      return [arm.at[0] - h * Math.cos(a), arm.at[2] + h * Math.sin(a)];
    };
    pivot(made).forEach((v, i) => expect(v).toBeCloseTo(pivot(free)[i]!, 9));
  });

  it('VIS-016 a limit switch swings at least 45 degrees with a bright tip flag and lights a scene-scale lamp and bezel', async () => {
    expect(LIMIT_SWITCH.swing).toBeGreaterThanOrEqual((45 * Math.PI) / 180);
    const { core, view, model } = await open(beside);
    const free = model(view('lim'));
    expect(slot(free, 'lamp').role).toBe('lampOff');
    expect(slot(free, 'bezel').role).toBe('lampOff');
    const freeFlag = slot(free, 'flag');
    expect(freeFlag).toBeDefined();
    expect(freeFlag.role).toBe('mark');

    core.act('Lim1', 'stuckOn');
    core.advance(5);
    const made = model(view('lim'));
    const armMade = slot(made, 'arm');
    const angle = armMade.q ? 2 * Math.atan2(armMade.q[1], armMade.q[3]) : armMade.yaw;
    expect(Math.abs(angle * (180 / Math.PI))).toBeGreaterThanOrEqual(45);
    expect(2 * pieceExtent(armMade)[1]).toBeGreaterThanOrEqual(0.01);

    const madeFlag = slot(made, 'flag');
    expect(Math.hypot(madeFlag.at[0] - freeFlag.at[0], madeFlag.at[2] - freeFlag.at[2])).toBeGreaterThanOrEqual(0.1);

    // Lamp and glowing bezel match the diffuse sensor scene-visibility benchmark.
    const lamp = slot(made, 'lamp');
    const bezel = slot(made, 'bezel');
    expect(lamp.role).toBe('lamp');
    expect(bezel.role).toBe('lamp');
    const [lx, , lz] = pieceExtent(lamp);
    expect(4 * lx * lz).toBeGreaterThanOrEqual(0.0015);
    const [bx, by] = pieceExtent(bezel);
    expect(4 * bx * by).toBeGreaterThanOrEqual(0.001);
  });
});

describe('sensor bounds (VIS-017)', () => {
  it('VIS-017 each model is measured on the pieces it draws at rest, from the floor or the rail up, in every state', async () => {
    const { view, runUntil } = await open('height-sorting-turntable');
    const v = view('array');
    const rest = modelBounds(v, [])!;
    expect(rest.min[1]).toBeCloseTo(-v.pose.p[1], 6);
    expect(rest.max[2]).toBeGreaterThan(v.pose.size[2]);
    runUntil('Infeed.run', 'LightArray1.detect');
    expect(modelBounds(view('array'), [])).toEqual(rest);
  });
});
