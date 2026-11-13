import { describe, expect, it } from 'bun:test';
import type { ScenePart } from '../../contracts';
import { createCatalogue } from '../catalogue';
import { SCENE_SCHEMA_VERSION } from '../sceneSchema';
import { validateScene } from '../scene';
import { PLANT_STEP_MS } from '../world';
import type { PartRuntime } from './items';
import { DT_S, detSqrt, processParts, stepTank, type TankParams, type TankState } from './process';

const def = processParts[0]!;
const tankPart = (config: ScenePart['config'] = {}): ScenePart => ({
  id: 'tank',
  part: 'tank',
  name: 'Tank1',
  position: [0, 0, 0],
  rotationYDeg: 0,
  config: { widthM: 0.4, depthM: 0.25, heightM: 1, valveTauS: 0, ...config },
});
const make = (config: ScenePart['config'] = {}): { rt: PartRuntime; part: ScenePart } => {
  const part = tankPart(config);
  return { rt: def.runtime(part, () => 0), part };
};
const run = (rt: PartRuntime, seconds: number, commands: Record<string, boolean | number> = {}) => {
  for (let i = 0; i < Math.round(seconds / DT_S); i += 1) {
    rt.beforeStep(commands);
    rt.afterStep();
  }
};
const level = (rt: PartRuntime) => rt.facts()['level:Tank1'] as number;
const NUM = { 'Tank1.fill': 100, 'Tank1.drain': 0 };

describe('tank process model', () => {
  it('PLT-009 the plant step of the model is the plant clock', () => {
    expect(DT_S).toBe(PLANT_STEP_MS / 1000);
  });

  it('PLT-009 the tank holds its level with both valves closed', () => {
    const { rt } = make({ initialFraction: 0.5 });
    run(rt, 10);
    expect(level(rt)).toBe(0.5);
    expect(rt.sense()['Tank1.level']).toBe(0.5);
    expect(rt.facts()['spilledL:Tank1']).toBe(0);
  });

  it('PLT-009 a filling tank follows the documented equation', () => {
    const { rt } = make();
    run(rt, 1, NUM);
    expect(rt.sense()['Tank1.level']).toBeCloseTo(0.2, 9);
    expect(rt.sense()['Tank1.flowIn']).toBe(20);
    expect(rt.facts()['volume:Tank1']).toBe(20);
  });

  it('PLT-009 a gravity outlet follows Torricelli and empties in finite time', () => {
    const { rt } = make({ initialFraction: 0.8 });
    const t = (2 * Math.sqrt(0.8) * 100) / 12;
    run(rt, t * 0.98, { 'Tank1.drain': 100 });
    expect(rt.sense()['Tank1.level']!).toBeGreaterThan(0);
    run(rt, t * 0.03, { 'Tank1.drain': 100 });
    expect(rt.sense()['Tank1.level']).toBe(0);
    expect(rt.sense()['Tank1.flowOut']).toBe(0);
  });

  it('PLT-009 a valve follows a first-order lag', () => {
    const p = tankPart({ valveTauS: 0.5 });
    const params: TankParams = { areaM2: 0.1, heightM: 1, inletMaxLps: 20, outletCoef: 12, valveTauS: 0.5, leakLps: 1 };
    let s: TankState = { h: 0, uIn: 0, uOut: 0, spilledL: 0 };
    for (let i = 0; i < 100; i += 1) {
      s = stepTank(s, { targetIn: 1, targetOut: 0, inletStuck: false, outletStuck: false, leak: false }, params, DT_S).state;
    }
    expect(Math.abs(s.uIn - (1 - 1 / Math.E)) / (1 - 1 / Math.E)).toBeLessThan(0.01);
    const rt = def.runtime(p, () => 0);
    run(rt, 0.5, NUM);
    expect(rt.sense()['Tank1.flowIn']!).toBeCloseTo(20 * s.uIn, 9);
  });

  it('PLT-009 an overflowing tank spills and is counted', () => {
    const { rt } = make({ initialFraction: 1 });
    run(rt, 1, NUM);
    expect(rt.sense()['Tank1.level']).toBe(1);
    expect(rt.facts()['spilledL:Tank1']).toBeCloseTo(20, 1);
    expect(rt.views()[0]!.state.spilling).toBe(true);
  });

  it('PLT-009 volume is conserved', () => {
    const params: TankParams = { areaM2: 0.1, heightM: 1, inletMaxLps: 20, outletCoef: 12, valveTauS: 0.3, leakLps: 1 };
    let s: TankState = { h: 0.2, uIn: 0, uOut: 0, spilledL: 0 };
    const initial = 0.2 * 100;
    let filled = 0;
    let drained = 0;
    let leaked = 0;
    for (let i = 0; i < 60 / DT_S; i += 1) {
      const t = i * DT_S;
      const inOpen = t < 12 || (t >= 30 && t < 40);
      const outOpen = t >= 8 && t < 25;
      const r = stepTank(
        s,
        { targetIn: inOpen ? 1 : 0, targetOut: outOpen ? 1 : 0, inletStuck: false, outletStuck: false, leak: t > 20 },
        params,
        DT_S,
      );
      s = r.state;
      filled += r.filledL;
      drained += r.drainedL;
      leaked += r.leakedL;
    }
    expect(s.spilledL).toBeGreaterThan(0);
    expect(drained).toBeGreaterThan(0);
    expect(leaked).toBeGreaterThan(0);
    expect(Math.abs(s.h * 100 + s.spilledL + drained + leaked - (initial + filled))).toBeLessThan(1e-6);
  });

  it('PLT-006 a run uses no Math function beyond abs, min, max and round, no clock and no random, and repeats exactly', () => {
    const forbidden = ['sqrt', 'pow', 'exp', 'log', 'sin', 'cos', 'random', 'hypot', 'cbrt', 'atan2'] as const;
    const math = Math as unknown as Record<string, unknown>;
    const saved = new Map<string, unknown>(forbidden.map((k) => [k, math[k]]));
    const realNow = Date.now;
    const realPerf = performance.now;
    const trace = (): number[] => {
      const { rt } = make({ initialFraction: 0.6, valveTauS: 0.4 });
      const out: number[] = [];
      for (let i = 0; i < 400; i += 1) {
        run(rt, 0.05, { 'Tank1.fill': i % 3 === 0 ? 80 : 10, 'Tank1.drain': i % 2 === 0 ? 100 : 30 });
        out.push(rt.sense()['Tank1.level'] as number, rt.sense()['Tank1.flowOut'] as number); // the plant senses numbers here
      }
      return out;
    };
    const reference = trace();
    try {
      for (const k of forbidden)
        math[k] = () => {
          throw new Error(`Math.${k} used`);
        };
      Date.now = () => {
        throw new Error('Date.now used');
      };
      performance.now = () => {
        throw new Error('performance.now used');
      };
      expect(trace()).toEqual(reference);
    } finally {
      for (const [k, v] of saved) math[k] = v;
      Date.now = realNow;
      performance.now = realPerf;
    }
  });

  it('PLT-006 detSqrt is exact for perfect squares and within 1 ulp elsewhere', () => {
    for (const v of [0, 0.25, 1, 4, 9, 16, 1.5625]) expect(detSqrt(v)).toBe(Math.sqrt(v));
    for (const v of [0.01, 0.3, 0.8, 1.2, 1.7, 2, 3]) {
      const ref = Math.sqrt(v);
      expect(Math.abs(detSqrt(v) - ref)).toBeLessThanOrEqual(Math.abs(ref) * 2.3e-16);
    }
    expect(detSqrt(-1)).toBe(0);
    expect(detSqrt(Number.NaN)).toBe(0);
  });

  it('PLT-006 detSqrt has a relative error below 1e-12 across the tank domain, 1e-12 to 1e6', () => {
    const cases: Array<[number, number]> = [
      [1e-12, 1e-6],
      [1e-8, 1e-4],
      [2.5e-5, 5e-3],
      [0.01, 0.1],
      [0.25, 0.5],
      [1, 1],
      [2, Math.SQRT2],
      [900, 30],
      [1e6, 1e3],
    ];
    for (const [v, root] of cases) expect(Math.abs(detSqrt(v) - root) / root).toBeLessThan(1e-12);
  });

  it('PRT-004 the digital variant has on/off valves and level switches, the numeric variant proportional valves and meters', () => {
    const d = def.signals(tankPart({ variant: 'digital' }));
    expect(d.map((s) => [s.name, s.direction, s.type])).toEqual([
      ['Tank1.fill', 'command', 'BOOL'],
      ['Tank1.drain', 'command', 'BOOL'],
      ['Tank1.levelLow', 'sensor', 'BOOL'],
      ['Tank1.levelHigh', 'sensor', 'BOOL'],
    ]);
    const n = def.signals(tankPart({ variant: 'numeric', heightM: 1 }));
    const by = Object.fromEntries(n.map((s) => [s.name, s]));
    expect(n.map((s) => s.name)).toEqual(['Tank1.fill', 'Tank1.drain', 'Tank1.level', 'Tank1.flowIn', 'Tank1.flowOut']);
    expect(by['Tank1.fill']).toMatchObject({ direction: 'command', type: 'REAL', unit: '%', range: { min: 0, max: 100 } });
    expect(by['Tank1.level']).toMatchObject({ direction: 'sensor', type: 'REAL', unit: 'm', range: { min: 0, max: 1 } });
    expect(by['Tank1.flowIn']).toMatchObject({ unit: 'L/s', range: { min: 0, max: 20 } });
    expect(by['Tank1.flowOut']!.range).toEqual({ min: 0, max: 12 });
    expect(Object.keys(def.config)).toContain('variant');
  });

  it('PRT-004 the digital variant switches at the low and high fractions with on/off valves', () => {
    const { rt } = make({ variant: 'digital', initialFraction: 0.1 });
    expect(rt.sense()).toEqual({ 'Tank1.levelLow': true, 'Tank1.levelHigh': false });
    run(rt, 1, { 'Tank1.fill': true, 'Tank1.drain': false });
    expect(rt.sense()).toEqual({ 'Tank1.levelLow': false, 'Tank1.levelHigh': false });
    run(rt, 2.5, { 'Tank1.fill': true, 'Tank1.drain': false });
    expect(rt.sense()['Tank1.levelHigh']).toBe(true);
  });

  it('PRT-003 the tank honours its limits', () => {
    const catalogue = createCatalogue([...processParts]);
    const scene = (config: ScenePart['config']) => ({ schemaVersion: 1, name: 't', cameras: [], parts: [{ ...tankPart(config) }] });
    expect(validateScene(scene({ widthM: 3 }), catalogue)).toEqual([
      { path: 'parts[0].config.widthM', message: 'widthM 3 is above the limit 2 m' },
    ]);
    expect(validateScene(scene({ heightM: 0.1 }), catalogue)[0]?.path).toBe('parts[0].config.heightM');
    expect(validateScene(scene({}), catalogue)).toEqual([]);
    // lowFraction above highFraction is not a schema relation (the limits do not cross): the runtime clamps it to highFraction.
    const { rt } = make({ variant: 'digital', lowFraction: 0.8, highFraction: 0.5, initialFraction: 0.5 });
    expect(rt.sense()).toEqual({ 'Tank1.levelLow': true, 'Tank1.levelHigh': true });
  });

  it('PRT-008 a stuck inlet stays where it is, a leak drains a closed tank, a stuck meter freezes its reading', () => {
    const a = make({ valveTauS: 0, initialFraction: 0.5 });
    run(a.rt, 0.5, NUM);
    a.rt.act('inletStuck');
    run(a.rt, 1, { 'Tank1.fill': 0, 'Tank1.drain': 0 });
    expect(a.rt.sense()['Tank1.flowIn']).toBe(20);
    expect(level(a.rt)).toBeCloseTo(0.5 + (1.5 * 20) / 100, 6);
    const b = make({ initialFraction: 0.5 });
    b.rt.act('outletStuck');
    run(b.rt, 1, { 'Tank1.drain': 100 });
    expect(level(b.rt)).toBe(0.5); // stuck closed: the opening stayed 0
    const c = make({ initialFraction: 0.5 });
    c.rt.act('leak');
    run(c.rt, 1);
    expect(level(c.rt)).toBeCloseTo(0.49, 9);
    const d = make({ initialFraction: 0.5 });
    d.rt.act('levelStuck');
    run(d.rt, 1, NUM);
    expect(d.rt.sense()['Tank1.level']).toBe(0.5);
    expect(level(d.rt)).toBeGreaterThan(0.5);
  });

  it('PRT-008 an unknown action throws a located message', () => {
    expect(() => make().rt.act('jam')).toThrow('part "Tank1" has no action "jam"');
    expect([...def.actions]).toEqual(['inletStuck', 'outletStuck', 'levelStuck', 'leak']);
  });

  it('PLT-010 the tank publishes level, volume, spilledL, highs and inBand', () => {
    const { rt } = make({ bandLow: 0.1, bandHigh: 0.3 });
    expect(rt.facts()).toEqual({
      'level:Tank1': 0,
      'volume:Tank1': 0,
      'spilledL:Tank1': 0,
      'highs:Tank1': 0,
      'inBand:Tank1': false,
    });
    run(rt, 1, NUM);
    expect(rt.facts()['inBand:Tank1']).toBe(true);
    expect(rt.facts()['volume:Tank1']).toBe(20);
    run(rt, 3, NUM); // 0.8 m is reached at 4 s
    expect(rt.facts()['highs:Tank1']).toBe(1);
    run(rt, 1, NUM);
    expect(rt.facts()['highs:Tank1']).toBe(1); // rising edges only
    run(rt, 5, { 'Tank1.fill': 0, 'Tank1.drain': 100 });
    run(rt, 6, NUM);
    expect(rt.facts()['highs:Tank1']).toBe(2);
  });

  it('PLT-010 a non-finite or missing numeric command keeps the previous target', () => {
    const { rt } = make();
    run(rt, 0.5, { 'Tank1.fill': 100 });
    run(rt, 0.5, { 'Tank1.fill': Number.NaN });
    run(rt, 0.5, {});
    expect(level(rt)).toBeCloseTo(0.3, 6);
  });

  it('PLT-009 the equations are documented in English and Spanish', () => {
    expect(def.family).toBe('process');
    expect(def.equations?.en).toContain('Torricelli');
    expect(def.equations?.es).toContain('Torricelli');
    expect(def.names.es).toBe('Tanque');
  });

  it('PRT-010 adding the tank changes no scene schema version', () => {
    expect(SCENE_SCHEMA_VERSION).toBe(1);
  });

  it('PLT-009 the tank view carries its drawn state and a footprint', () => {
    const { rt, part } = make({ initialFraction: 0.5 });
    const v = rt.views()[0]!;
    expect(v.part).toBe('tank');
    expect(v.state).toEqual({ level: 0.5, heightM: 1, fraction: 0.5, spilling: false });
    expect(v.pose.size).toEqual([0.4, 1, 0.25]);
    expect(v.pose.p).toEqual([0, 0.5, 0]);
    expect(def.snapPoints(part)).toHaveLength(4);
  });
});
