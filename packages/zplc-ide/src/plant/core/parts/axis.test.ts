import { createHash } from 'node:crypto';
import { describe, expect, it } from 'bun:test';
import { AT_LIMIT_M, stepAxis, type AxisCommand, type AxisSpec, type AxisState } from './axis';

const DT = 0.005;
const SPEC: AxisSpec = { strokeM: 1, speedMps: 0.5, accelMps2: 2 };
const REST: AxisState = { p: 0, v: 0 };

const run = (s: AxisState, cmd: AxisCommand, spec: AxisSpec, seconds: number, onStep?: (s: AxisState) => void): AxisState => {
  let cur = s;
  for (let i = 0; i < Math.round(seconds / DT); i += 1) {
    cur = stepAxis(cur, cmd, spec, DT, false);
    onStep?.(cur);
  }
  return cur;
};

describe('axis motion law', () => {
  it('PRT-003 the limit distance of a sensor is 1 mm', () => {
    expect(AT_LIMIT_M).toBe(0.001);
  });

  it('PRT-003 a jogged axis accelerates to its speed limit, no further, and brakes at its stroke end', () => {
    let vMax = 0;
    let pMax = 0;
    const end = run(REST, { mode: 'jog', dir: 1 }, SPEC, 5, (s) => {
      vMax = Math.max(vMax, Math.abs(s.v));
      pMax = Math.max(pMax, s.p);
    });
    expect(vMax).toBe(SPEC.speedMps);
    expect(pMax).toBeLessThanOrEqual(SPEC.strokeM);
    expect(end).toEqual({ p: SPEC.strokeM, v: 0 });
  });

  it('PRT-003 a jog in the other direction at the end moves away again', () => {
    const end = run(REST, { mode: 'jog', dir: 1 }, SPEC, 5);
    const back = run(end, { mode: 'jog', dir: -1 }, SPEC, 0.5);
    expect(back.p).toBeLessThan(SPEC.strokeM);
    expect(back.v).toBeLessThan(0);
    const low = run(REST, { mode: 'jog', dir: -1 }, SPEC, 1);
    expect(low).toEqual(REST);
  });

  it('PRT-003 jog with dir 0 decelerates to rest', () => {
    const moving = run(REST, { mode: 'jog', dir: 1 }, SPEC, 0.5);
    expect(moving.v).toBe(SPEC.speedMps);
    const stopped = run(moving, { mode: 'jog', dir: 0 }, SPEC, 0.5);
    expect(stopped.v).toBe(0);
    expect(stopped.p).toBeGreaterThan(moving.p);
    expect(stopped.p).toBeLessThan(SPEC.strokeM);
  });

  it('PRT-003 a goto reaches its target within 0.0005 m and stops, without overshoot', () => {
    for (const strokeM of [0.4, 1, 3])
      for (const speedMps of [0.1, 0.5, 2])
        for (const accelMps2 of [0.5, 2, 10])
          for (const frac of [0.001 / strokeM, 0.01, 0.37, 1])
            for (const up of [true, false]) {
              const spec: AxisSpec = { strokeM, speedMps, accelMps2 };
              const dist = frac * strokeM;
              const from = up ? 0 : strokeM;
              const target = up ? dist : strokeM - dist;
              const bound = dist / speedMps + (2 * speedMps) / accelMps2 + 0.1;
              let worst = 0;
              const end = run({ p: from, v: 0 }, { mode: 'goto', target }, spec, bound, (s) => {
                worst = Math.max(worst, up ? s.p - target : target - s.p);
              });
              const label = JSON.stringify({ spec, dist, up });
              expect([label, worst <= 0.001]).toEqual([label, true]);
              expect([label, end.p === target && end.v === 0]).toEqual([label, true]);
            }
  });

  it('PRT-003 a goto target outside the stroke is clamped to it', () => {
    expect(run(REST, { mode: 'goto', target: 5 }, SPEC, 5)).toEqual({ p: SPEC.strokeM, v: 0 });
    expect(run({ p: 0.5, v: 0 }, { mode: 'goto', target: -5 }, SPEC, 5)).toEqual({ p: 0, v: 0 });
  });

  it('PRT-006 a goto with a target changed mid-move reverses without overshooting the new target', () => {
    const mid = run(REST, { mode: 'goto', target: 0.9 }, SPEC, 1);
    expect(mid.v).toBeGreaterThan(0);
    const newTarget = mid.p - 0.2;
    let worst = 0;
    const end = run(mid, { mode: 'goto', target: newTarget }, SPEC, 4, (s) => {
      worst = Math.max(worst, newTarget - s.p);
    });
    expect(worst).toBeLessThanOrEqual(0.001);
    expect(end).toEqual({ p: newTarget, v: 0 });
  });

  it('PRT-008 a stuck axis returns its state unchanged', () => {
    const s: AxisState = { p: 0.3, v: 0.4 };
    expect(stepAxis(s, { mode: 'goto', target: 0.9 }, SPEC, DT, true)).toEqual(s);
    expect(stepAxis(s, { mode: 'jog', dir: -1 }, SPEC, DT, true)).toEqual(s);
  });

  it('PLT-006 the axis law is bit-exact: the same inputs give the same state sequence, hashed', () => {
    const trace = (): string => {
      const h = createHash('sha256');
      let s = REST;
      for (let i = 0; i < 4000; i += 1) {
        const cmd: AxisCommand = i % 700 < 300 ? { mode: 'jog', dir: i % 1400 < 700 ? 1 : -1 } : { mode: 'goto', target: (i % 13) / 13 };
        s = stepAxis(s, cmd, SPEC, DT, i % 97 === 0);
        h.update(`${s.p},${s.v};`);
      }
      return h.digest('hex');
    };
    expect(trace()).toBe(trace());
  });

  it('PLT-006 a run uses no Math function beyond abs, min and max, no clock and no random, and repeats exactly', () => {
    const forbidden = ['sqrt', 'pow', 'exp', 'log', 'sin', 'cos', 'random', 'hypot', 'cbrt', 'atan2'] as const;
    const math = Math as unknown as Record<string, unknown>;
    const saved = new Map<string, unknown>(forbidden.map((k) => [k, math[k]]));
    const realNow = Date.now;
    const realPerf = performance.now;
    const trace = (): number[] => {
      const out: number[] = [];
      let s = REST;
      for (let i = 0; i < 2000; i += 1) {
        s = stepAxis(s, i % 500 < 250 ? { mode: 'goto', target: (i % 7) / 7 } : { mode: 'jog', dir: 1 }, SPEC, DT, false);
        out.push(s.p, s.v);
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
});
