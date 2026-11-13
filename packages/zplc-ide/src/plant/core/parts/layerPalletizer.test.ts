import { afterEach, describe, expect, it } from 'bun:test';
import { createHash } from 'node:crypto';
import type { ScenePart } from '../../contracts';
import { createCatalogue } from '../catalogue';
import { loadJolt } from '../jolt';
import { validateScene } from '../scene';
import { SCENE_SCHEMA_VERSION } from '../sceneSchema';
import { createSupportTracker } from '../support';
import { createWorld, type PhysicsWorld } from '../world';
import { boxSize, PALLET_SIZE, removeTrackedItem, spawnItem, trackedItems, type PartRuntime } from './items';
import { stationParts } from './layerPalletizer';

const def = stationParts[0]!;
const catalogue = createCatalogue(stationParts);
const part = (config: ScenePart['config'] = {}, position: [number, number, number] = [0, 0, 0]): ScenePart => ({
  id: 'pal',
  part: 'layer-palletizer',
  name: 'Pal1',
  position,
  rotationYDeg: 0,
  config,
});

const worlds: PhysicsWorld[] = [];
afterEach(() => {
  for (const w of worlds.splice(0)) w.dispose();
});

const BOX = boxSize(0.3);
const PALLET_TOP = PALLET_SIZE[1];

async function rig(config: ScenePart['config'] = {}) {
  const world = createWorld(await loadJolt());
  worlds.push(world);
  world.addBody({
    id: 'floor',
    kind: 'box',
    half: [10, 0.5, 5],
    position: [0, -0.5, 0],
    rotationYDeg: 0,
    massKg: 0,
    friction: 0.6,
    motion: 'static',
    layer: 'static',
  });
  const p = part({ variant: 'numeric', ...config });
  const rt: PartRuntime = def.runtime(p, () => 0);
  rt.build(world, p);
  const tracker = createSupportTracker();
  const cmd: Record<string, boolean | number> = {};
  const r = {
    world,
    rt,
    cmd,
    sense: () => rt.sense(),
    facts: () => rt.facts(),
    body: (id: string) => world.bodies().find((b) => b.id === id)!,
    tick() {
      rt.beforeStep(cmd);
      world.step(5);
      rt.afterStep();
      const tracked = trackedItems(world);
      tracker.update(
        world.bodies().flatMap((b) => {
          const info = tracked.get(b.id);
          return info ? [{ id: b.id, kind: info.kind, tag: info.tag, size: info.size, p: b.p, v: b.v }] : [];
        }),
      );
    },
    run(ms: number) {
      for (let i = 0; i < ms / 5; i += 1) r.tick();
    },
    support: () => tracker.facts(),
    /** A full 2 by 2 layer of boxes in the forming zone (the pad must be raised first). */
    layer(at: number, prefix = 'b') {
      for (const [k, [x, z]] of (
        [
          [-0.2, -0.15],
          [0.2, -0.15],
          [-0.2, 0.15],
          [0.2, 0.15],
        ] as const
      ).entries()) {
        spawnItem(world, `${prefix}${k}`, 'item', BOX, 2, [x, at, z], 0, 'box');
      }
    },
  };
  return r;
}
type Rig = Awaited<ReturnType<typeof rig>>;

/** Raise the pad out of the way, as a program would before anything arrives. */
const raise = (r: Rig) => {
  r.cmd['Pal1.ySet'] = 0.6;
  r.run(1500);
};
/** Pick the layer at x 0 and set it on the pallet at x 1.6, releasing `above` m over the layer's resting height. */
function carry(r: Rig, padOverPallet: number) {
  r.cmd['Pal1.ySet'] = 0.31;
  r.run(1200);
  r.cmd['Pal1.grip'] = true;
  r.run(500);
  r.cmd['Pal1.ySet'] = 1.1;
  r.run(1800);
  r.cmd['Pal1.xSet'] = 1.6;
  r.run(2500);
  r.cmd['Pal1.ySet'] = padOverPallet;
  r.run(2500);
  r.cmd['Pal1.grip'] = false;
  r.run(1500);
}

describe('layer palletizer', () => {
  it('PRT-004 the digital and numeric variants of the palletizer have the signals of the table', () => {
    const digital = def.signals(part({ variant: 'digital' }));
    expect(digital.map((s) => [s.name, s.direction, s.type])).toEqual([
      ['Pal1.xPlus', 'command', 'BOOL'],
      ['Pal1.xMinus', 'command', 'BOOL'],
      ['Pal1.yPlus', 'command', 'BOOL'],
      ['Pal1.yMinus', 'command', 'BOOL'],
      ['Pal1.xAtMin', 'sensor', 'BOOL'],
      ['Pal1.xAtMax', 'sensor', 'BOOL'],
      ['Pal1.yAtMin', 'sensor', 'BOOL'],
      ['Pal1.yAtMax', 'sensor', 'BOOL'],
      ['Pal1.square', 'command', 'BOOL'],
      ['Pal1.squared', 'sensor', 'BOOL'],
      ['Pal1.layerReady', 'sensor', 'BOOL'],
      ['Pal1.grip', 'command', 'BOOL'],
      ['Pal1.gripped', 'sensor', 'BOOL'],
    ]);
    const numeric = def.signals(part({ variant: 'numeric', strokeXM: 2, strokeYM: 1 }));
    expect(numeric.map((s) => [s.name, s.direction, s.type, s.unit, s.range])).toEqual([
      ['Pal1.xSet', 'command', 'REAL', 'm', { min: 0, max: 2 }],
      ['Pal1.ySet', 'command', 'REAL', 'm', { min: 0, max: 1 }],
      ['Pal1.xPos', 'sensor', 'REAL', 'm', { min: 0, max: 2 }],
      ['Pal1.yPos', 'sensor', 'REAL', 'm', { min: 0, max: 1 }],
      ['Pal1.square', 'command', 'BOOL', undefined, undefined],
      ['Pal1.squared', 'sensor', 'BOOL', undefined, undefined],
      ['Pal1.layerReady', 'sensor', 'BOOL', undefined, undefined],
      ['Pal1.grip', 'command', 'BOOL', undefined, undefined],
      ['Pal1.gripped', 'sensor', 'BOOL', undefined, undefined],
    ]);
    expect(def.family).toBe('stations');
  });

  it('PLT-007 four boxes squared into a layer are lifted together and set on a pallet as one layer', async () => {
    const r = await rig();
    spawnItem(r.world, 'pallet', 'pallet', PALLET_SIZE, 25, [1.6, 0, 0], 0);
    raise(r);
    r.layer(0);
    r.run(500);
    expect(r.sense()['Pal1.layerReady']).toBe(true);
    carry(r, PALLET_TOP + 0.3 + 0.01);
    const f = r.facts();
    expect(f['picked:Pal1']).toBe(4);
    expect(f['placed:Pal1']).toBe(4);
    expect(f['drops:Pal1']).toBe(0);
    expect(f['axis:Pal1:x']).toBeCloseTo(1.6, 3);
    expect(r.sense()['Pal1.gripped']).toBe(false);
    expect(r.support()['stacked:pallet:0']).toBeGreaterThanOrEqual(4);
    expect(r.support()['layers:pallet:0']).toBe(1);
  });

  it('PLT-007 a second layer is placed on top of the first when the lift target is one box height higher', async () => {
    const r = await rig({ strokeYM: 1.2 });
    spawnItem(r.world, 'pallet', 'pallet', PALLET_SIZE, 25, [1.6, 0, 0], 0);
    raise(r);
    r.layer(0, 'a');
    r.run(500);
    carry(r, PALLET_TOP + 0.3 + 0.01);
    r.cmd['Pal1.xSet'] = 0;
    r.cmd['Pal1.ySet'] = 0.6;
    r.run(3500);
    r.layer(0, 'c');
    r.run(500);
    carry(r, PALLET_TOP + 0.6 + 0.01);
    expect(r.facts()['placed:Pal1']).toBe(8);
    expect(r.facts()['drops:Pal1']).toBe(0);
    expect(r.support()['stacked:pallet:0']).toBe(8);
    expect(r.support()['layers:pallet:0']).toBe(2);
  });

  it('PRT-003 layerReady is TRUE only with a full layer at rest in the zone, FALSE with three of four boxes', async () => {
    const r = await rig();
    raise(r);
    expect(r.sense()['Pal1.layerReady']).toBe(false);
    r.layer(0);
    r.run(500);
    expect(r.sense()['Pal1.layerReady']).toBe(true);
    removeTrackedItem(r.world, 'b3');
    r.run(20);
    expect(r.sense()['Pal1.layerReady']).toBe(false);
  });

  it('PRT-003 a layer above maxLoadKg is not captured', async () => {
    const heavy = await rig({ maxLoadKg: 5 }); // 4 boxes of 2 kg: 8 kg
    raise(heavy);
    heavy.layer(0);
    heavy.run(500);
    heavy.cmd['Pal1.ySet'] = 0.31;
    heavy.run(1200);
    heavy.cmd['Pal1.grip'] = true;
    heavy.run(800);
    expect(heavy.facts()['picked:Pal1']).toBe(0);
    expect(heavy.sense()['Pal1.gripped']).toBe(false);

    const ok = await rig({ maxLoadKg: 8 });
    raise(ok);
    ok.layer(0);
    ok.run(500);
    ok.cmd['Pal1.ySet'] = 0.31;
    ok.run(1200);
    ok.cmd['Pal1.grip'] = true;
    ok.run(800);
    expect(ok.facts()['picked:Pal1']).toBe(4);
    expect(ok.sense()['Pal1.gripped']).toBe(true);
  });

  it('PRT-003 the squaring pusher takes 0.4 s, reports squared and pushes a box that sticks out of the zone back in', async () => {
    const r = await rig();
    raise(r);
    expect(r.sense()['Pal1.squared']).toBe(false);
    spawnItem(r.world, 'loose', 'item', BOX, 2, [0, 0, 0.25], 0, 'box'); // its +z edge sticks 0.1 m out of the zone
    r.cmd['Pal1.square'] = true;
    r.run(380);
    expect(r.sense()['Pal1.squared']).toBe(false);
    r.run(40);
    expect(r.sense()['Pal1.squared']).toBe(true);
    r.run(600);
    expect(r.body('loose').p[2]).toBeCloseTo(0.15, 1); // pushed in until its edge meets the zone edge
    r.cmd['Pal1.square'] = false;
    r.run(500);
    expect(r.sense()['Pal1.squared']).toBe(false);
  });

  it(
    'PRT-008 squareStuck leaves the pusher where it is, layerReadyStuckOff hides a full layer, stuckX and stuckY stop their ' + 'axes',
    async () => {
      const r = await rig();
      raise(r);
      r.cmd['Pal1.square'] = true;
      r.run(100);
      const z = r.body('pal-pusher').p[2];
      r.rt.act('squareStuck');
      r.run(600);
      expect(r.body('pal-pusher').p[2]).toBe(z);
      expect(r.sense()['Pal1.squared']).toBe(false);

      r.layer(0);
      r.run(500);
      expect(r.sense()['Pal1.layerReady']).toBe(true);
      r.rt.act('layerReadyStuckOff');
      r.run(10);
      expect(r.sense()['Pal1.layerReady']).toBe(false);

      r.rt.act('stuckX');
      r.rt.act('stuckY');
      r.cmd['Pal1.xSet'] = 1;
      r.cmd['Pal1.ySet'] = 0.2;
      r.run(1000);
      expect(r.sense()['Pal1.xPos']).toBe(0);
      expect(r.sense()['Pal1.yPos']!).toBeGreaterThan(0.5);
      expect(r.sense()['Pal1.yPos']!).toBeCloseTo(0.6, 2);
    },
  );

  it('PRT-008 grip faults: gripFail never captures, dropLoad lets go, grippedStuckOn and Off force the sensor', async () => {
    const r = await rig();
    raise(r);
    r.layer(0);
    r.run(500);
    r.cmd['Pal1.ySet'] = 0.31;
    r.run(1200);
    r.rt.act('gripFail');
    r.cmd['Pal1.grip'] = true;
    r.run(800);
    expect(r.facts()['picked:Pal1']).toBe(0);
    r.rt.act('grippedStuckOn');
    expect(r.sense()['Pal1.gripped']).toBe(true);

    const s = await rig();
    raise(s);
    s.layer(0);
    s.run(500);
    s.cmd['Pal1.ySet'] = 0.31;
    s.run(1200);
    s.cmd['Pal1.grip'] = true;
    s.run(800);
    expect(s.sense()['Pal1.gripped']).toBe(true);
    s.rt.act('grippedStuckOff');
    expect(s.sense()['Pal1.gripped']).toBe(false);
    const d = await rig();
    raise(d);
    d.layer(0);
    d.run(500);
    d.cmd['Pal1.ySet'] = 0.31;
    d.run(1200);
    d.cmd['Pal1.grip'] = true;
    d.run(800);
    d.rt.act('dropLoad');
    d.run(200);
    expect(d.facts()['drops:Pal1']).toBe(4);
  });

  it('PRT-008 an unknown action throws a located message', async () => {
    const r = await rig();
    expect(() => r.rt.act('melt')).toThrow('part "Pal1" has no action "melt"');
  });

  it('PRT-003 the digital variant moves only while a command is held and reports its limits', async () => {
    const world = createWorld(await loadJolt());
    worlds.push(world);
    const p = part({ variant: 'digital', strokeXM: 0.8, strokeYM: 0.3 });
    const rt = def.runtime(p, () => 0);
    rt.build(world, p);
    const run = (ms: number, cmd: Record<string, boolean>) => {
      for (let i = 0; i < ms / 5; i += 1) {
        rt.beforeStep(cmd);
        world.step(5);
        rt.afterStep();
      }
    };
    expect(rt.sense()['Pal1.xAtMin']).toBe(true);
    run(200, { 'Pal1.xPlus': true, 'Pal1.xMinus': true });
    expect(rt.sense()['Pal1.xAtMin']).toBe(true);
    run(2000, { 'Pal1.xPlus': true, 'Pal1.yPlus': true });
    expect(rt.sense()['Pal1.xAtMax']).toBe(true);
    expect(rt.sense()['Pal1.yAtMax']).toBe(true);
    expect(rt.sense()['Pal1.xAtMin']).toBe(false);
    run(2000, {});
    expect(rt.facts()['axis:Pal1:x']).toBe(0.8);
  });

  it('PRT-003 columns 4 is above the limit 3 and rows 0 below 1, located', () => {
    const check = (config: ScenePart['config']) =>
      validateScene({ schemaVersion: 1, name: 'x', cameras: [], parts: [part(config)] }, catalogue);
    expect(check({ columns: 3, rows: 1 })).toEqual([]);
    expect(check({ columns: 4 })).toEqual([{ path: 'parts[0].config.columns', message: 'columns 4 is above the limit 3' }]);
    expect(check({ rows: 0 })).toEqual([{ path: 'parts[0].config.rows', message: 'rows 0 is below the limit 1' }]);
  });

  it('PRT-002 English and Spanish names, documentation and equations', () => {
    expect(def.names).toEqual({ en: 'Layer palletizer', es: 'Paletizador de capas' });
    for (const lang of ['en', 'es'] as const) {
      expect(def.doc[lang].length).toBeGreaterThan(100);
      expect(def.equations?.[lang].length).toBeGreaterThan(20);
    }
    expect(def.doc.es).toContain('tarima');
    expect(def.actions).toEqual([
      'stuckX',
      'stuckY',
      'squareStuck',
      'gripFail',
      'dropLoad',
      'grippedStuckOn',
      'grippedStuckOff',
      'layerReadyStuckOff',
    ]);
  });

  it('PRT-010 the station changes no scene schema version', () => {
    expect(SCENE_SCHEMA_VERSION).toBe(1);
    expect(validateScene({ schemaVersion: 1, name: 'x', cameras: [], parts: [part()] }, catalogue)).toEqual([]);
  });

  it('PRT-007 snap points: the infeed side accepts belts and the corners span the footprint', () => {
    const snaps = def.snapPoints(part({ strokeXM: 1.6 }));
    const infeed = snaps.find((s) => s.name === 'infeed')!;
    expect(infeed.accepts).toEqual(['belt', 'roller', 'curved']);
    expect(infeed.position).toEqual([-0.4, 0, 0]);
    const xs = snaps.map((s) => s.position[0]);
    const zs = snaps.map((s) => s.position[2]);
    expect(Math.min(...xs)).toBe(-0.4);
    expect(Math.max(...xs)).toBeCloseTo(2, 9);
    expect(Math.min(...zs)).toBe(-0.3);
    expect(Math.max(...zs)).toBe(0.3);
  });

  it('PLT-010 the view carries the keys of the manipulator views and its own signals', async () => {
    const r = await rig();
    raise(r);
    const [main, frame, beam] = r.rt.views();
    expect(main!.id).toBe('pal');
    expect(main!.part).toBe('layer-palletizer');
    expect(Object.keys(main!.state).sort()).toEqual(
      ['closeFraction', 'fraction', 'gripper', 'holding', 'strokeX', 'strokeY', 'strokeZ', 'text', 'variant', 'x', 'y', 'z'].sort(),
    );
    expect(main!.state['text']).toBe('X 0.00 m, Y 0.60 m');
    expect(main!.state['gripper']).toBe('clamp');
    expect(main!.signals['gripped']).toBe(false);
    expect([frame!.id, frame!.part, frame!.signals, frame!.name]).toEqual(['pal-frame', 'manipulator-frame', {}, 'Pal1']);
    expect([beam!.id, beam!.part, beam!.signals]).toEqual(['pal-beam', 'manipulator-beam', {}]);
  });

  it(
    'PLT-010 the pusher and both plates are published as views with the poses of their bodies, and the pusher follows its ' + 'travel',
    async () => {
      const r = await rig();
      raise(r);
      const view = (id: string) => r.rt.views().find((v) => v.id === id)!;
      for (const [id, kind] of [
        ['pal-pusher', 'layer-pusher'],
        ['pal-plate-far', 'layer-plate'],
        ['pal-plate-side', 'layer-plate'],
      ] as const) {
        const v = view(id);
        expect([v.part, v.name, v.signals]).toEqual([kind, 'Pal1', {}]);
        if (id === 'pal-pusher') expect(v.pose.p[2]).toBeCloseTo(r.body(id).p[2], 6);
        else expect(v.pose.p.map((n) => Math.round(n * 1000) / 1000)).toEqual(id.endsWith('far') ? [0.425, 0.25, 0] : [0, 0.25, -0.325]);
      }
      const retracted = view('pal-pusher').pose.p[2];
      r.cmd['Pal1.square'] = true;
      r.run(500);
      expect(retracted - view('pal-pusher').pose.p[2]).toBeCloseTo(0.15, 6);
      expect(view('pal-pusher').pose.p[2]).toBeCloseTo(r.body('pal-pusher').p[2], 6);
    },
  );

  it('PLT-006 two identical runs give the same world state and facts', async () => {
    const run = async () => {
      const r = await rig();
      spawnItem(r.world, 'pallet', 'pallet', PALLET_SIZE, 25, [1.6, 0, 0], 0);
      raise(r);
      r.layer(0);
      r.run(500);
      carry(r, PALLET_TOP + 0.3 + 0.01);
      return createHash('sha256').update(r.world.capture()).update(JSON.stringify(r.facts())).digest('hex');
    };
    expect(await run()).toBe(await run());
  });
});
