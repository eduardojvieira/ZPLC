import { describe, expect, it } from 'bun:test';
import type { PartDefinition, ScenePart } from '../contracts';
import { createCatalogue } from '../core/catalogue';
import { cameraFromPreset, cameraPosition, type CameraState } from '../view/camera';
import { createSceneEditor } from './model';
import { dragPlan, pointerToGround } from './pointer';

const conveyor: PartDefinition = {
  id: 'conveyor',
  family: 'conveyors',
  names: { en: 'Conveyor', es: 'Cinta' },
  config: {},
  signals: (p: ScenePart) => [{ name: `${p.name}.run`, direction: 'command', type: 'BOOL' }],
  actions: [],
  snapPoints: () => [{ name: 'end', position: [1, 0, 0], normalYDeg: 0, accepts: ['conveyor'] }],
  doc: { en: '', es: '' },
};
const cat = createCatalogue([conveyor]);
const cam: CameraState = { target: [2, 0, 3], azimuthDeg: 30, polarDeg: 50, distance: 10 };
const close = (a: readonly number[], b: readonly number[]) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i]!, 6));

describe('pointer placement', () => {
  it('SCN-008 a pointer at the centre of the view looks at the ground point under the camera target', () => {
    close(pointerToGround([0, 0], cam)!, [2, 0, 3]);
  });

  it('SCN-008 a pointer to the right of centre hits the ground to the right of the target, seen from the camera', () => {
    const topDown = cameraFromPreset({ name: 'top', position: [0, 10, 0.0001], target: [0, 0, 0] });
    const hit = pointerToGround([0.5, 0], { ...topDown, polarDeg: 5, azimuthDeg: 0 })!;
    expect(hit[0]).toBeGreaterThan(0); // azimuth 0: the camera is on +z looking at -z, so screen right is +x
    expect(hit[1]).toBeCloseTo(0, 9);
  });

  it('SCN-008 a ray parallel to the floor returns null', () => {
    // Camera at the target height (polar 90 is clamped by the view, so build the state directly), pointer at the horizon.
    const flat: CameraState = { target: [0, 0, 0], azimuthDeg: 0, polarDeg: 90, distance: 10 };
    expect(cameraPosition(flat)[1]).toBeCloseTo(0, 9);
    expect(pointerToGround([0, 0], flat)).toBeNull();
  });

  it('SCN-008 a pointer above the horizon returns null: the ray never reaches the floor', () => {
    const low: CameraState = { target: [0, 3, 0], azimuthDeg: 0, polarDeg: 80, distance: 10 };
    expect(pointerToGround([0, 1], low)).toBeNull();
  });

  it('SCN-008 the aspect ratio widens the horizontal reach', () => {
    const a = pointerToGround([1, 0], { ...cam, azimuthDeg: 0 }, 1)!;
    const b = pointerToGround([1, 0], { ...cam, azimuthDeg: 0 }, 2)!;
    expect(Math.abs(b[0] - 2)).toBeGreaterThan(Math.abs(a[0] - 2));
  });
});

describe('drag plan', () => {
  const setup = () => {
    const ed = createSceneEditor(cat);
    ed.place('c1', 'conveyor', [0, 0, 0]);
    ed.place('c2', 'conveyor', [5, 0, 5]);
    return ed;
  };
  const posOf = (ed: ReturnType<typeof setup>, id: string) => ed.state().scene.parts.find((p) => p.id === id)!.position;

  it('SCN-010 a drag is one undo step and cancel leaves the scene unchanged', () => {
    const ed = setup();
    const before = ed.state();
    const cancelled = dragPlan(ed, 'c2');
    cancelled.move([6.1, 0, 6.1]);
    cancelled.move([7.3, 0, 7.4]);
    cancelled.cancel();
    expect(ed.state().scene).toEqual(before.scene);
    expect(ed.state().past).toBe(before.past);

    const drag = dragPlan(ed, 'c2');
    for (const x of [5.2, 5.9, 6.4, 7.3]) drag.move([x, 0, 8]);
    expect(posOf(ed, 'c2')).toEqual([5, 0, 5]); // a preview never touches the scene
    drag.commit();
    expect(posOf(ed, 'c2')).toEqual([7.25, 0, 8]);
    expect(ed.state().past).toBe(before.past + 1);
    ed.undo();
    expect(ed.state().scene).toEqual(before.scene);
    ed.redo();
    expect(posOf(ed, 'c2')).toEqual([7.25, 0, 8]);
  });

  it('SCN-010 the pointer path leaves the same scene as the keyboard path (editor.move)', () => {
    const a = setup();
    const b = setup();
    const drag = dragPlan(a, 'c2');
    drag.move([3.3, 0, 1.1]);
    drag.commit();
    b.move('c2', [3.3, 0, 1.1]);
    expect(a.state().scene).toEqual(b.state().scene);
    expect(a.state().past).toBe(b.state().past);
  });

  it('SCN-008 the drag preview snaps to the grid and to a snap point, as the commit will', () => {
    const ed = setup();
    const drag = dragPlan(ed, 'c2', cat);
    drag.move([0.1, 0, 0.37]);
    expect(drag.preview()).toEqual({ position: [0, 0, 0.25], rotationYDeg: 0 });
    drag.move([1.05, 0, 0.05]); // within the snap radius of the end of c1 at [1, 0, 0]
    expect(drag.preview()).toEqual({ position: [1, 0, 0], rotationYDeg: 0 });
    drag.commit();
    expect(posOf(ed, 'c2')).toEqual([1, 0, 0]);
  });

  it('SCN-008 a commit without a move changes nothing, and a finished drag takes no more moves', () => {
    const ed = setup();
    const past = ed.state().past;
    const idle = dragPlan(ed, 'c2');
    idle.commit();
    expect(ed.state().past).toBe(past);
    expect(() => idle.move([1, 0, 1])).toThrow('finished');
    const d = dragPlan(ed, 'c2');
    d.move([1, 0, 1]);
    d.commit();
    d.commit();
    expect(ed.state().past).toBe(past + 1);
  });

  it('SCN-008 a drag is refused while the plant runs, and one running at commit leaves the scene alone', () => {
    const ed = setup();
    const drag = dragPlan(ed, 'c2');
    drag.move([1, 0, 1]);
    ed.setRunning(true);
    expect(() => drag.commit()).toThrow('stopped');
    expect(posOf(ed, 'c2')).toEqual([5, 0, 5]);
    expect(() => dragPlan(ed, 'c2')).toThrow('stopped');
    expect(() => drag.move([2, 0, 2])).toThrow('stopped');
  });

  it('SCN-008 a drag of a part that is not in the scene is refused', () => {
    expect(() => dragPlan(setup(), 'nope')).toThrow('no part');
  });
});
