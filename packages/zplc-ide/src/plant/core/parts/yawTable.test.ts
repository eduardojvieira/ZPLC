import { describe, expect, it } from 'bun:test';
import { yawQuat } from './items';
import { buildYawTable, yawEntry, YAW_STEP_DEG } from './yawTable';

const TOL = 1e-12;
const near = (a: number, b: number): boolean => Math.abs(a - b) <= TOL;

describe('yaw table', () => {
  it('PLT-006 the table equals Math.sin and Math.cos of the angle within 1e-12 for every entry', () => {
    let worst = 0;
    for (let i = -1440; i <= 1440; i += 1) {
      const deg = i * YAW_STEP_DEG;
      const e = yawEntry(deg);
      const a = (deg * Math.PI) / 180;
      worst = Math.max(worst, Math.abs(e.sin - Math.sin(a)), Math.abs(e.cos - Math.cos(a)));
    }
    expect(worst).toBeLessThanOrEqual(TOL);
  });

  it('PLT-006 known angles: 0, 30, 45, 90, 180, 270 degrees and the table step', () => {
    const known: [number, number, number][] = [
      [0, 0, 1],
      [30, 0.5, Math.sqrt(3) / 2],
      [45, Math.SQRT1_2, Math.SQRT1_2],
      [90, 1, 0],
      [180, 0, -1],
      [270, -1, 0],
      [-90, -1, 0],
      [0.25, Math.sin((0.25 * Math.PI) / 180), Math.cos((0.25 * Math.PI) / 180)],
    ];
    for (const [deg, s, c] of known) {
      expect(Math.abs(yawEntry(deg).sin - s)).toBeLessThanOrEqual(1e-12);
      expect(Math.abs(yawEntry(deg).cos - c)).toBeLessThanOrEqual(1e-12);
    }
  });

  it('PLT-006 yawEntry(deg).q equals yawQuat(deg) within 1e-12 and has unit length', () => {
    for (const deg of [0, 0.25, 30, 45, 90, 135, 180, 270, 359.75, -45, -180, -360, 360]) {
      const q = yawEntry(deg).q;
      const ref = yawQuat(deg);
      for (let k = 0; k < 4; k += 1) expect(near(q[k], ref[k])).toBe(true);
      expect(Math.abs(Math.hypot(...q) - 1)).toBeLessThanOrEqual(TOL);
    }
  });

  it('PLT-006 an angle is rounded to the nearest quarter degree and wraps outside minus 360 to 360', () => {
    expect(yawEntry(90.1)).toBe(yawEntry(90));
    expect(yawEntry(90.2)).toBe(yawEntry(90.25));
    expect(yawEntry(450)).toBe(yawEntry(90));
    expect(yawEntry(-450)).toBe(yawEntry(-90));
  });

  it('PLT-006 yawEntry returns the same frozen object for the same angle', () => {
    expect(yawEntry(33.25)).toBe(yawEntry(33.25));
    expect(Object.isFrozen(yawEntry(33.25))).toBe(true);
    expect(Object.isFrozen(yawEntry(33.25).q)).toBe(true);
  });

  it('PLT-006 a build and a lookup call no sin, cos, sqrt, pow, clock or random', () => {
    const names = ['sin', 'cos', 'sqrt', 'pow', 'random'] as const;
    const saved = names.map((n) => Math[n]);
    const now = Date.now;
    const pnow = performance.now;
    const boom = (): never => {
      throw new Error('forbidden call');
    };
    try {
      for (const n of names) (Math as unknown as Record<string, unknown>)[n] = boom;
      Date.now = boom;
      performance.now = boom;
      const t = buildYawTable();
      expect(t.length).toBe(2881);
      expect(yawEntry(12.3).cos).toBeGreaterThan(0.9);
    } finally {
      names.forEach((n, i) => ((Math as unknown as Record<string, unknown>)[n] = saved[i]));
      Date.now = now;
      performance.now = pnow;
    }
  });

  it('PLT-006 two builds are bit-identical', () => {
    const a = buildYawTable();
    const b = buildYawTable();
    for (let i = 0; i < a.length; i += 1) {
      expect(Object.is(a[i].sin, b[i].sin) && Object.is(a[i].cos, b[i].cos)).toBe(true);
    }
  });
});
