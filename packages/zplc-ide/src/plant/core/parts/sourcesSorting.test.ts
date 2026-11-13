import { afterEach, describe, expect, it } from 'bun:test';
import type { ScenePart } from '../../contracts';
import { createCatalogue } from '../catalogue';
import { loadJolt } from '../jolt';
import { validateScene } from '../scene';
import { createWorld, type PhysicsWorld } from '../world';
import { itemParts, trackedItems, type PartRuntime } from './items';
import { sourceParts } from './sources';

const defs = [...itemParts, ...sourceParts];
const catalogue = createCatalogue(defs);
const part = (id: string, partId: string, position: [number, number, number], config: ScenePart['config'] = {}): ScenePart => ({
  id,
  part: partId,
  name: id.replace(/-/g, '_'),
  position,
  rotationYDeg: 0,
  config,
});
const worlds: PhysicsWorld[] = [];
afterEach(() => {
  for (const w of worlds.splice(0)) w.dispose();
});

/** A deterministic generator that counts its draws. */
function counted(seed = 1) {
  let s = seed;
  let draws = 0;
  return { rng: () => ((draws += 1), (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296), draws: () => draws };
}

async function emitterRun(config: ScenePart['config'], n: number, rng: () => number) {
  const world = createWorld(await loadJolt());
  worlds.push(world);
  const p = part('e', 'emitter', [0, 0, 0], { intervalMs: 5, maxItems: n, ...config });
  const rt: PartRuntime = defs.find((d) => d.id === 'emitter')!.runtime(p, rng);
  rt.build(world, p);
  for (let i = 0; i < n; i += 1) rt.beforeStep({});
  return { world, items: [...trackedItems(world).values()] };
}

const check = (p: ScenePart) => validateScene({ schemaVersion: 1, name: 'x', cameras: [], parts: [p] }, catalogue);

describe('emitter variety', () => {
  it('PRT-001 an emitter of workpieces emits the configured colour, material and code', async () => {
    const w = createWorld(await loadJolt());
    worlds.push(w);
    const p = part('e', 'emitter', [0, 0, 0], { kind: 'workpiece', colour: 'blue', material: 'metal', code: 5 });
    const rt = defs.find((d) => d.id === 'emitter')!.runtime(p, () => 0.5);
    rt.build(w, p);
    rt.beforeStep({ 'e.emit': true });
    expect([...trackedItems(w).values()]).toEqual([
      { kind: 'item', size: [0.2, 0.1, 0.2], massKg: 0.5, colour: 'blue', metal: true, code: 5 },
    ]);
  });

  it('PLT-006 vary colour draws one number per emit and gives a red and blue sequence that is the same on three runs', async () => {
    const runs = [];
    for (let i = 0; i < 3; i += 1) {
      const g = counted();
      const { items } = await emitterRun({ kind: 'workpiece', vary: 'colour' }, 8, g.rng);
      expect(g.draws()).toBe(8 * 1); // interval > 0: workpieces draw nothing else, so exactly one per emit
      runs.push(items.map((x) => x.colour));
    }
    expect(runs[1]).toEqual(runs[0]!);
    expect(runs[2]).toEqual(runs[0]!);
    expect(new Set(runs[0]).size).toBe(2);
  });

  it('PLT-006 vary weight draws the box mass from 2 and 5 kg and vary code draws 1 to codes', async () => {
    const g = counted(7);
    const { items } = await emitterRun({ kind: 'box', vary: 'weight' }, 12, g.rng);
    expect(g.draws()).toBe(12 * 3); // height, lateral offset, then the mass
    expect(new Set(items.map((x) => x.massKg))).toEqual(new Set([2, 5]));
    const c = await emitterRun({ kind: 'workpiece', vary: 'code', codes: 4 }, 30, counted(3).rng);
    const codes = c.items.map((x) => x.code!);
    expect(Math.min(...codes)).toBe(1);
    expect(Math.max(...codes)).toBe(4);
    const b = await emitterRun({ kind: 'box', vary: 'code', codes: 2 }, 12, counted(5).rng);
    expect(new Set(b.items.map((x) => x.code))).toEqual(new Set([1, 2]));
  });

  it('PLT-006 a vary that does not apply to the emitted kind has no effect and draws nothing extra', async () => {
    const g = counted();
    const { items } = await emitterRun({ kind: 'box', vary: 'colour' }, 5, g.rng);
    expect(g.draws()).toBe(10);
    expect(items.every((x) => x.colour === undefined)).toBe(true);
  });

  it('PLT-006 an emitter with vary none draws nothing from the seeded generator and keeps the ten heights of the baseline', async () => {
    const g = counted();
    const { items } = await emitterRun({ kind: 'box', maxItems: 10 }, 10, g.rng);
    expect(items.map((x) => x.size[1])).toEqual([0.2, 0.3, 0.2, 0.4, 0.2, 0.2, 0.3, 0.2, 0.4, 0.4]);
    expect(g.draws()).toBe(20); // height and lateral offset only
    expect(items.every((x) => x.colour === undefined && x.code === undefined)).toBe(true);
  });

  it('PRT-001 the emitter still emits boxes, pallets, lids and bases exactly as before', async () => {
    for (const [kind, size, mass, tag] of [
      ['box', [0.4, 0.3, 0.3], 2, 'box'],
      ['pallet', [1.2, 0.144, 0.8], 25, undefined],
      ['lid', [0.4, 0.04, 0.3], 2, 'lid'],
      ['base', [0.4, 0.15, 0.3], 2, 'base'],
    ] as const) {
      const w = createWorld(await loadJolt());
      worlds.push(w);
      const p = part('e', 'emitter', [0, 0, 0], { kind });
      const rt = defs.find((d) => d.id === 'emitter')!.runtime(p, () => 0.5);
      rt.build(w, p);
      rt.beforeStep({ 'e.emit': true });
      expect([...trackedItems(w).values()]).toEqual([
        { kind: kind === 'pallet' ? 'pallet' : 'item', size, massKg: mass, ...(tag ? { tag } : {}) },
      ]);
    }
  });
});

describe('remover grading', () => {
  async function remove(accepts: ScenePart['config'], items: ScenePart[]) {
    const w = createWorld(await loadJolt());
    worlds.push(w);
    const all = [part('r', 'remover', [0, 0.3, 0], { width: 4, depth: 4, height: 2, ...accepts }), ...items];
    const rts = all.map((p) => {
      const rt = defs.find((d) => d.id === p.part)!.runtime(p, () => 0.5);
      rt.build(w, p);
      return rt;
    });
    rts[0]!.afterStep();
    return rts[0]!.facts();
  }
  const wp = (id: string, colour: string) => part(id, 'workpiece', [0, 0, 0], { colour });

  it(
    'PLT-010 a remover that accepts red counts a blue workpiece misrouted and a red one sorted, and sorted plus misrouted equals ' +
      'delivered',
    async () => {
      const facts = await remove({ accepts: 'red' }, [wp('a', 'red'), wp('b', 'blue'), wp('c', 'blue'), part('pl', 'pallet', [0, 0, 0])]);
      expect(facts).toEqual({ 'delivered:r': 4, 'sorted:r': 1, 'misrouted:r': 3 });
    },
  );

  it('PLT-010 a remover that accepts any publishes only delivered, exactly the M3 facts', async () => {
    expect(await remove({}, [wp('a', 'red')])).toEqual({ 'delivered:r': 1 });
    expect(await remove({ accepts: 'any' }, [])).toEqual({ 'delivered:r': 0 });
  });

  it('PLT-010 a remover that accepts a code or a weight class grades by it', async () => {
    const facts = await remove({ accepts: 'code', acceptsCode: 3 }, [
      part('a', 'workpiece', [0, 0, 0], { code: 3 }),
      part('b', 'workpiece', [0, 0, 0], { code: 4 }),
    ]);
    expect([facts['sorted:r'], facts['misrouted:r']]).toEqual([1, 1]);
    const heavy = await remove({ accepts: 'heavy' }, [part('a', 'box', [0, 0, 0], { mass: 5 }), part('b', 'box', [0, 0, 0], { mass: 2 })]);
    expect([heavy['sorted:r'], heavy['misrouted:r']]).toEqual([1, 1]);
  });

  it('PRT-003 an unknown accepts value is refused with a located message at parts[n].config.accepts', () => {
    expect(check(part('r', 'remover', [0, 0, 0], { accepts: 'red', acceptsCode: 9 }))).toEqual([]);
    const bad = check(part('r', 'remover', [0, 0, 0], { accepts: 'green' }));
    expect(bad.length).toBe(1);
    expect(bad[0]!.path).toBe('parts[0].config.accepts');
    expect(check(part('r', 'remover', [0, 0, 0], { acceptsCode: 10 }))[0]!.path).toBe('parts[0].config.acceptsCode');
    expect(check(part('e', 'emitter', [0, 0, 0], { vary: 'size' }))[0]!.path).toBe('parts[0].config.vary');
  });
});
