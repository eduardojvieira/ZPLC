import { describe, expect, it } from 'bun:test';
import {
  cameraFromPreset, cameraKeyAction, cameraPosition, orbitCamera, panCamera, zoomCamera,
  DISTANCE_MAX, DISTANCE_MIN, POLAR_MAX_DEG, POLAR_MIN_DEG,
} from './camera';

const base = cameraFromPreset({ name: 'a', position: [0, 5, 5], target: [0, 0, 0] });

describe('camera', () => {
  it('VIS-002 orbit, pan and zoom are bounded and keyboard-equivalent', () => {
    expect(orbitCamera(base, 0, 500).polarDeg).toBe(POLAR_MAX_DEG);
    expect(orbitCamera(base, 0, -500).polarDeg).toBe(POLAR_MIN_DEG);
    expect(orbitCamera(base, 30, 0).azimuthDeg).toBeCloseTo(base.azimuthDeg + 30);
    expect(zoomCamera(base, 1e6).distance).toBe(DISTANCE_MIN);
    expect(zoomCamera(base, 1e-6).distance).toBe(DISTANCE_MAX);
    expect(zoomCamera(base, 2).distance).toBeCloseTo(base.distance / 2);
    // Camera at +Z looking at the origin: forward is -Z, right is +X.
    const p = panCamera({ ...base, azimuthDeg: 0 }, 1, 2);
    expect(p.target[0]).toBeCloseTo(1);
    expect(p.target[2]).toBeCloseTo(-2);
    expect(p.target[1]).toBe(0);

    expect(cameraKeyAction('ArrowLeft', false)).toEqual({ kind: 'orbit', dxDeg: -5, dyDeg: 0 });
    expect(cameraKeyAction('ArrowDown', true)).toEqual({ kind: 'orbit', dxDeg: 0, dyDeg: 15 });
    expect(cameraKeyAction('+', false)).toMatchObject({ kind: 'zoom' });
    const zin = cameraKeyAction('+', false);
    const zout = cameraKeyAction('-', false);
    expect(zin?.kind === 'zoom' && zin.factor > 1).toBe(true);
    expect(zout?.kind === 'zoom' && zout.factor < 1).toBe(true);
    expect(cameraKeyAction('w', false)).toEqual({ kind: 'pan', dx: 0, dz: 0.5 });
    expect(cameraKeyAction('A', true)).toEqual({ kind: 'pan', dx: -2, dz: 0 });
    expect(cameraKeyAction('q', false)).toBeNull();
  });

  it('VIS-002 a scene preset moves the camera to its named position', () => {
    const s = cameraFromPreset({ name: 'side', position: [3, 4, 5], target: [1, 0, 1] });
    const pos = cameraPosition(s);
    expect(pos[0]).toBeCloseTo(3);
    expect(pos[1]).toBeCloseTo(4);
    expect(pos[2]).toBeCloseTo(5);
    expect(s.target).toEqual([1, 0, 1]);
  });

  it('VIS-002 a preset straight above the target is held inside the polar bounds', () => {
    expect(cameraFromPreset({ name: 'top', position: [0, 10, 0], target: [0, 0, 0] }).polarDeg).toBe(POLAR_MIN_DEG);
  });
});
