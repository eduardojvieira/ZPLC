import type { Vec3 } from '../contracts';
import type { Catalogue } from '../core/catalogue';
import { cameraPosition, type CameraState } from '../view/camera';
import { snapPlacement } from './commands';
import type { SceneEditor } from './model';

/** The renderer's vertical field of view (PerspectiveCamera(45, ...) in view/renderer.ts). */
export const FOV_DEG = 45;
const EPS = 1e-9;

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const norm = (a: Vec3): Vec3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/**
 * Where the pointer, as normalised device coordinates (x right, y up, both in -1..1), meets the floor y = 0, or null when the
 * ray is parallel to the floor or points away from it. Pure maths over the orbit camera state; `aspect` is width / height.
 */
export function pointerToGround(ndc: readonly [number, number], camera: CameraState, aspect = 16 / 9): Vec3 | null {
  const eye = cameraPosition(camera);
  const forward = norm(sub(camera.target, eye));
  const right = norm(cross(forward, [0, 1, 0]));
  const up = cross(right, forward);
  const h = Math.tan((FOV_DEG * Math.PI) / 360);
  const sx = ndc[0] * h * aspect;
  const sy = ndc[1] * h;
  const dir: Vec3 = [
    forward[0] + right[0] * sx + up[0] * sy,
    forward[1] + right[1] * sx + up[1] * sy,
    forward[2] + right[2] * sx + up[2] * sy,
  ];
  if (dir[1] > -EPS) return null; // parallel to the floor, or looking up from above it
  const t = -eye[1] / dir[1];
  if (t <= 0) return null; // the camera is under the floor
  return [eye[0] + dir[0] * t, 0, eye[2] + dir[2] * t];
}

export interface DragPlan {
  /** Records the pointer's ground point as the new target; the scene is not touched. */
  move(to: Vec3): void;
  /** Where the part will land (grid or snap point), when a catalogue was given and a move was made. */
  preview(): { position: Vec3; rotationYDeg: number } | null;
  /** One editor.move of the last target: one undo step, same as the keyboard path. A drag without a move changes nothing. */
  commit(): void;
  cancel(): void;
}

/** A pointer drag of part `id`. Refused while the plant runs (SCN-008); the commit is the editor's own move (SCN-010). */
export function dragPlan(editor: SceneEditor, id: string, catalogue?: Catalogue): DragPlan {
  const stopped = () => {
    if (editor.state().running) throw new Error('the scene can only be edited while the plant is stopped');
  };
  stopped();
  const part = editor.state().scene.parts.find((p) => p.id === id);
  if (!part) throw new Error(`no part "${id}" in the scene`);
  let target: Vec3 | null = null;
  let done = false;
  const open = () => {
    if (done) throw new Error('the drag is finished');
    stopped();
  };
  return {
    move(to) {
      open();
      target = to;
    },
    preview() {
      if (!target || !catalogue) return null;
      const now = editor.state().scene;
      const p = now.parts.find((q) => q.id === id) ?? part;
      const s = snapPlacement(now, catalogue, p.part, target, p.rotationYDeg, id);
      return { position: s.position, rotationYDeg: s.rotationYDeg };
    },
    commit() {
      if (done) return;
      stopped();
      done = true;
      if (target) editor.move(id, target);
    },
    cancel() {
      done = true;
      target = null;
    },
  };
}
