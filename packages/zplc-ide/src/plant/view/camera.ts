import type { CameraPreset, Vec3 } from '../contracts';

/** Orbit camera state. Angles in degrees: azimuth around Y, polar from the vertical. */
export interface CameraState {
  target: Vec3;
  azimuthDeg: number;
  polarDeg: number;
  distance: number;
}

export const POLAR_MIN_DEG = 5;
export const POLAR_MAX_DEG = 85;
export const DISTANCE_MIN = 0.5;
export const DISTANCE_MAX = 200;

/** The vertical field of view of the plant camera, in degrees. */
export const FOV_DEG = 45;
/** The share of each half-frame that stays empty around the scene after a fit. */
const FIT_MARGIN = 0.06;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const RAD = Math.PI / 180;

function bounded(s: CameraState): CameraState {
  return {
    ...s,
    polarDeg: clamp(s.polarDeg, POLAR_MIN_DEG, POLAR_MAX_DEG),
    distance: clamp(s.distance, DISTANCE_MIN, DISTANCE_MAX),
  };
}

/** The state that places the camera at `position` looking at `target`. */
export function cameraFromPreset(preset: CameraPreset): CameraState {
  const [px, py, pz] = preset.position;
  const [tx, ty, tz] = preset.target;
  const dx = px - tx;
  const dy = py - ty;
  const dz = pz - tz;
  const distance = Math.hypot(dx, dy, dz) || 1;
  return bounded({
    target: preset.target,
    azimuthDeg: Math.atan2(dx, dz) / RAD,
    polarDeg: Math.acos(clamp(dy / distance, -1, 1)) / RAD,
    distance,
  });
}

/**
 * The lowest a first view may look from (S3-10): polar at most 62°, the catalogue's angle. At 90° less half the field of view
 * (67.5°) the fitted picture still showed a band of sky, so the cap keeps the horizon out with room to spare. A scene whose first
 * preset looks lower opens raised to it, keeping the preset's azimuth; the scene file is not changed.
 */
export const FIRST_VIEW_POLAR_MAX_DEG = 62;

/** The state a scene opens with: its first preset, raised so the picture shows the plant and not the horizon. */
export function firstViewCamera(preset: CameraPreset): CameraState {
  const s = cameraFromPreset(preset);
  return { ...s, polarDeg: Math.min(s.polarDeg, FIRST_VIEW_POLAR_MAX_DEG) };
}

export function cameraPosition(s: CameraState): Vec3 {
  const az = s.azimuthDeg * RAD;
  const po = s.polarDeg * RAD;
  const flat = s.distance * Math.sin(po);
  return [s.target[0] + flat * Math.sin(az), s.target[1] + s.distance * Math.cos(po), s.target[2] + flat * Math.cos(az)];
}

export interface Bounds {
  min: Vec3;
  max: Vec3;
}

/**
 * The camera that shows all of `bounds` on a panel of `aspect` (width over height), seen from the direction of `from`: it aims at
 * the centre of the bounds and backs off until every corner is inside both the vertical and the horizontal field of view, with
 * a small margin. Distance is limited like any other camera, so a very large scene is cut rather than lost to the far plane.
 */
export function fitCamera(from: CameraState, bounds: Bounds, aspect: number): CameraState {
  const target: Vec3 = [0, 1, 2].map((i) => (bounds.min[i]! + bounds.max[i]!) / 2) as unknown as Vec3;
  const az = from.azimuthDeg * RAD;
  const po = clamp(from.polarDeg, POLAR_MIN_DEG, POLAR_MAX_DEG) * RAD;
  // The view axes: `f` from the camera to the target, `r` to the right of the picture, `u` up.
  const f: Vec3 = [-Math.sin(po) * Math.sin(az), -Math.cos(po), -Math.sin(po) * Math.cos(az)];
  const rl = Math.hypot(f[0], f[2]) || 1;
  const r: Vec3 = [-f[2] / rl, 0, f[0] / rl];
  const u: Vec3 = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
  const tanV = Math.tan((FOV_DEG * RAD) / 2) * (1 - FIT_MARGIN);
  const tanH = tanV * (aspect > 0 ? aspect : 1);
  const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  let distance = DISTANCE_MIN;
  for (const x of [bounds.min[0], bounds.max[0]])
    for (const y of [bounds.min[1], bounds.max[1]])
      for (const z of [bounds.min[2], bounds.max[2]]) {
        const v: Vec3 = [x - target[0], y - target[1], z - target[2]];
        const depth = dot(v, f); // how much farther than the target this corner is
        distance = Math.max(distance, Math.abs(dot(v, r)) / tanH - depth, Math.abs(dot(v, u)) / tanV - depth, 0.5 - depth);
      }
  return bounded({ ...from, target, distance });
}

export function orbitCamera(s: CameraState, dxDeg: number, dyDeg: number): CameraState {
  return bounded({ ...s, azimuthDeg: s.azimuthDeg + dxDeg, polarDeg: s.polarDeg + dyDeg });
}

/** Pan on the ground plane, relative to the view: dx to the right, dz forward (away from the camera). */
export function panCamera(s: CameraState, dx: number, dz: number): CameraState {
  const az = s.azimuthDeg * RAD;
  const rightX = Math.cos(az);
  const rightZ = -Math.sin(az);
  const fwdX = -Math.sin(az);
  const fwdZ = -Math.cos(az);
  return {
    ...s,
    target: [s.target[0] + rightX * dx + fwdX * dz, s.target[1], s.target[2] + rightZ * dx + fwdZ * dz],
  };
}

/** `factor` above 1 zooms in. */
export function zoomCamera(s: CameraState, factor: number): CameraState {
  return bounded({ ...s, distance: s.distance / (factor > 0 ? factor : 1) });
}

export type CameraKeyAction =
  { kind: 'orbit'; dxDeg: number; dyDeg: number } | { kind: 'zoom'; factor: number } | { kind: 'pan'; dx: number; dz: number };

/** Keyboard equivalent of mouse control (VIS-002): arrows orbit, + and - zoom, WASD pan; Shift takes bigger steps. */
export function cameraKeyAction(key: string, shift: boolean): CameraKeyAction | null {
  const orbit = shift ? 15 : 5;
  const pan = shift ? 2 : 0.5;
  const zoom = shift ? 1.5 : 1.1;
  switch (key) {
    case 'ArrowLeft':
      return { kind: 'orbit', dxDeg: -orbit, dyDeg: 0 };
    case 'ArrowRight':
      return { kind: 'orbit', dxDeg: orbit, dyDeg: 0 };
    case 'ArrowUp':
      return { kind: 'orbit', dxDeg: 0, dyDeg: -orbit };
    case 'ArrowDown':
      return { kind: 'orbit', dxDeg: 0, dyDeg: orbit };
    case '+':
    case '=':
      return { kind: 'zoom', factor: zoom };
    case '-':
    case '_':
      return { kind: 'zoom', factor: 1 / zoom };
    case 'w':
    case 'W':
      return { kind: 'pan', dx: 0, dz: pan };
    case 's':
    case 'S':
      return { kind: 'pan', dx: 0, dz: -pan };
    case 'a':
    case 'A':
      return { kind: 'pan', dx: -pan, dz: 0 };
    case 'd':
    case 'D':
      return { kind: 'pan', dx: pan, dz: 0 };
    default:
      return null;
  }
}
