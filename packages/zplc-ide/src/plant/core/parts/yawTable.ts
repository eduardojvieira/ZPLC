import type { Quat } from '../../contracts';

/** Yaw table for rotating kinematic bodies: sine and cosine of an angle in degrees, and the yaw quaternion,
 *  built at module load with `+ - * /` only (no libm), so a pose does not depend on the platform's `Math.sin`. */
export interface YawEntry {
  q: Quat;
  cos: number;
  sin: number;
}

export const YAW_STEP_DEG = 0.25;
const STEPS_PER_DEG = 4;
const MAX_STEPS = 360 * STEPS_PER_DEG; // table covers -360 to 360 degrees
const PI = 3.141592653589793;

// Taylor series of sin and cos on 0 to 45 degrees (x <= 0.7854): 14 terms give an error well below 1e-16.
const taylor = (x: number): [number, number] => {
  let s = 0;
  let c = 0;
  let ts = x; // x^(2n+1)/(2n+1)!
  let tc = 1; // x^(2n)/(2n)!
  for (let n = 0; n < 14; n += 1) {
    s += n % 2 === 0 ? ts : -ts;
    c += n % 2 === 0 ? tc : -tc;
    tc = (tc * x * x) / ((2 * n + 1) * (2 * n + 2));
    ts = (ts * x * x) / ((2 * n + 2) * (2 * n + 3));
  }
  return [s, c];
};

/** (sin, cos) of `deg` in -360 to 360, by the symmetries of both functions down to 0 to 45 degrees. */
const sinCos = (deg: number): [number, number] => {
  if (deg < 0) {
    const [s, c] = sinCos(-deg);
    return [-s, c];
  }
  if (deg >= 360) return sinCos(deg - 360);
  if (deg > 180) {
    const [s, c] = sinCos(deg - 180);
    return [-s, -c];
  }
  if (deg > 90) {
    const [s, c] = sinCos(180 - deg);
    return [s, -c];
  }
  if (deg > 45) {
    const [s, c] = sinCos(90 - deg);
    return [c, s];
  }
  return taylor((deg * PI) / 180);
};

/** Builds the 2881 entries (index = quarter degrees + 1440). Exported for the determinism test. */
export function buildYawTable(): readonly YawEntry[] {
  const out: YawEntry[] = [];
  for (let i = -MAX_STEPS; i <= MAX_STEPS; i += 1) {
    const deg = i / STEPS_PER_DEG;
    const [sin, cos] = sinCos(deg);
    const [hs, hc] = sinCos(deg / 2);
    out.push(Object.freeze({ q: Object.freeze([0, hs, 0, hc]) as unknown as Quat, cos, sin }));
  }
  return out;
}

const TABLE = buildYawTable();

/** The entry for an angle in degrees, rounded to the nearest 0.25 and wrapped into -360 to 360. Shared frozen object. */
export function yawEntry(deg: number): YawEntry {
  let i = Math.round(deg * STEPS_PER_DEG);
  if (i > MAX_STEPS) i -= MAX_STEPS;
  else if (i < -MAX_STEPS) i += MAX_STEPS;
  return TABLE[i + MAX_STEPS];
}
