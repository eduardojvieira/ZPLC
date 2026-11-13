// Pure linear axis motion law (rules R-A1 to R-A3 of plan M3). Determinism: `+ - * /`, comparisons and
// Math.abs/min/max only; no root, power, clock or random.

export interface AxisSpec {
  strokeM: number;
  speedMps: number;
  accelMps2: number;
}
/** Position along the stroke in m (0..strokeM) and velocity in m/s. */
export interface AxisState {
  p: number;
  v: number;
}
export type AxisCommand = { mode: 'jog'; dir: -1 | 0 | 1 } | { mode: 'goto'; target: number };

/** A limit sensor is TRUE within this distance of an end. */
export const AT_LIMIT_M = 0.001 as const;

const SNAP_M = 0.0005;

const toward = (v: number, target: number, dv: number): number => (v < target ? Math.min(v + dv, target) : Math.max(v - dv, target));

/** One plant step of `dtS` seconds. `stuck` freezes the axis (fault action). */
export function stepAxis(s: AxisState, cmd: AxisCommand, spec: AxisSpec, dtS: number, stuck: boolean): AxisState {
  if (stuck) return s;
  const dv = spec.accelMps2 * dtS;
  let target = 0;
  let goal: number | null = null;
  if (cmd.mode === 'jog') target = cmd.dir * spec.speedMps;
  else if (Number.isFinite(cmd.target)) {
    goal = Math.max(0, Math.min(spec.strokeM, cmd.target));
    const d = goal - s.p;
    // R-A1 braking test, applied to the velocity this step would reach (one-step lookahead), so the
    // discrete step cannot carry the axis past the point where it can still stop.
    const vc = toward(s.v, d < 0 ? -spec.speedMps : spec.speedMps, dv);
    const braking = (vc * vc) / (2 * spec.accelMps2);
    target = Math.abs(d - vc * dtS) <= braking ? 0 : d < 0 ? -spec.speedMps : spec.speedMps;
  }
  let v = toward(s.v, target, dv);
  let p = s.p + v * dtS;
  if (p <= 0 || p >= spec.strokeM) {
    p = p <= 0 ? 0 : spec.strokeM;
    v = 0;
  }
  if (goal !== null && Math.abs(goal - p) <= SNAP_M && Math.abs(v) <= dv) return { p: goal, v: 0 };
  return { p, v };
}
