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

export function cameraPosition(s: CameraState): Vec3 {
  const az = s.azimuthDeg * RAD;
  const po = s.polarDeg * RAD;
  const flat = s.distance * Math.sin(po);
  return [
    s.target[0] + flat * Math.sin(az),
    s.target[1] + s.distance * Math.cos(po),
    s.target[2] + flat * Math.cos(az),
  ];
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
  | { kind: 'orbit'; dxDeg: number; dyDeg: number }
  | { kind: 'zoom'; factor: number }
  | { kind: 'pan'; dx: number; dz: number };

/** Keyboard equivalent of mouse control (VIS-002): arrows orbit, + and - zoom, WASD pan; Shift takes bigger steps. */
export function cameraKeyAction(key: string, shift: boolean): CameraKeyAction | null {
  const orbit = shift ? 15 : 5;
  const pan = shift ? 2 : 0.5;
  const zoom = shift ? 1.5 : 1.1;
  switch (key) {
    case 'ArrowLeft': return { kind: 'orbit', dxDeg: -orbit, dyDeg: 0 };
    case 'ArrowRight': return { kind: 'orbit', dxDeg: orbit, dyDeg: 0 };
    case 'ArrowUp': return { kind: 'orbit', dxDeg: 0, dyDeg: -orbit };
    case 'ArrowDown': return { kind: 'orbit', dxDeg: 0, dyDeg: orbit };
    case '+': case '=': return { kind: 'zoom', factor: zoom };
    case '-': case '_': return { kind: 'zoom', factor: 1 / zoom };
    case 'w': case 'W': return { kind: 'pan', dx: 0, dz: pan };
    case 's': case 'S': return { kind: 'pan', dx: 0, dz: -pan };
    case 'a': case 'A': return { kind: 'pan', dx: -pan, dz: 0 };
    case 'd': case 'D': return { kind: 'pan', dx: pan, dz: 0 };
    default: return null;
  }
}
