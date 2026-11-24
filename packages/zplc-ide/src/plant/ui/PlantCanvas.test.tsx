import { describe, expect, it } from 'bun:test';
import { setupDom, stubProjectLoader } from '../../test/dom';

const dom = await setupDom();
await stubProjectLoader();
const { PlantCanvas } = await import('./PlantCanvas');
const { createSceneEditor } = await import('../editor/model');
const { createCatalogue } = await import('../core/catalogue');
import type { PartDefinition, PlantSceneFile, ScenePart } from '../contracts';
import type { PlantEngine } from './loadPlantEngine';
import type { PlantRenderer } from '../view/renderer';
import type { SnapshotFeed } from './usePlantSession';

const conveyor: PartDefinition = {
  id: 'conveyor',
  family: 'conveyors',
  names: { en: 'Conveyor', es: 'Cinta' },
  config: {},
  signals: (p: ScenePart) => [{ name: `${p.name}.run`, direction: 'command', type: 'BOOL' }],
  actions: [],
  snapPoints: () => [],
  doc: { en: '', es: '' },
};
const cat = createCatalogue([conveyor]);
const scene: PlantSceneFile = { schemaVersion: 1, name: 'Edit', parts: [], cameras: [] };
// Looking straight down at the origin: a pointer at the centre of a 100 x 100 canvas is the ground point (0, 0, 0).
const CAMERA = { target: [0, 0, 0] as [number, number, number], azimuthDeg: 0, polarDeg: 1, distance: 10 };

function rig() {
  const log: string[] = [];
  const ghosts: unknown[] = [];
  const fake: PlantRenderer = {
    webgl2: true,
    setSnapshot: () => undefined,
    setQuality: () => undefined,
    setCameraPreset: () => undefined,
    cameraState: () => CAMERA,
    setGhost: (position) => void ghosts.push(position),
    orbit: () => void log.push('orbit'),
    pan: () => undefined,
    zoom: () => undefined,
    onContext: () => () => undefined,
    fps: () => ({ current: 60, p5: 60 }),
    resize: () => undefined,
    dispose: () => undefined,
  };
  const engine = { loadRenderer: async () => fake } as unknown as PlantEngine;
  const feed: SnapshotFeed = { latest: () => undefined, subscribe: () => () => undefined, count: () => 0 };
  const editor = createSceneEditor(cat, scene);
  editor.place('c1', 'conveyor', [0, 0, 0]);
  const edited: number[] = [];
  const mount = async () => {
    dom.render(
      <PlantCanvas
        engine={engine}
        scene={scene}
        feed={feed}
        visible
        quality={undefined}
        display={{ mode: 'light', reducedMotion: false }}
        label="canvas"
        edit={{ editor, catalogue: cat, onEdited: () => void edited.push(editor.state().past) }}
        onRenderer={() => undefined}
        onFailure={() => undefined}
      />,
    );
    await dom.settle();
    const canvas = document.querySelector<HTMLCanvasElement>('[data-plant-canvas]')!;
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 100 }) as DOMRect;
    return canvas;
  };
  return { log, ghosts, editor, edited, mount };
}
// Pointer position as a canvas pixel; (50, 50) is the centre.
const at = (x: number, y: number) => ({ clientX: x, clientY: y, pointerId: 1 });

describe('pointer placement on the 3D canvas (SCN-008, SCN-010, SCN-014)', () => {
  it('SCN-008 a drag that starts on a part moves it with one editor.move to the snapped position, and one undo step', async () => {
    const r = rig();
    const canvas = await r.mount();
    const past = r.editor.state().past;
    dom.fireEvent.pointerDown(canvas, at(50, 50));
    dom.fireEvent.pointerMove(canvas, at(60, 50));
    dom.fireEvent.pointerMove(canvas, at(70, 50));
    expect(r.ghosts.at(-1)).not.toBeNull();
    expect(r.editor.state().scene.parts[0]!.position).toEqual([0, 0, 0]); // nothing is committed while the pointer is down
    dom.fireEvent.pointerUp(canvas, at(70, 50));
    const moved = r.editor.state().scene.parts[0]!.position;
    expect(moved[0]).toBeGreaterThan(0);
    expect(moved[0] % 0.25).toBeCloseTo(0, 6); // on the grid
    expect(r.editor.state().past).toBe(past + 1);
    expect(r.ghosts.at(-1)).toBeNull();
    expect(r.edited).toEqual([past + 1]);
    r.editor.undo();
    expect(r.editor.state().scene.parts[0]!.position).toEqual([0, 0, 0]);
  });

  it('SCN-008 Escape cancels the drag and leaves the scene unchanged', async () => {
    const r = rig();
    const canvas = await r.mount();
    const past = r.editor.state().past;
    dom.fireEvent.pointerDown(canvas, at(50, 50));
    dom.fireEvent.pointerMove(canvas, at(70, 50));
    dom.fireEvent.keyDown(canvas, { key: 'Escape' });
    dom.fireEvent.pointerUp(canvas, at(70, 50));
    expect(r.editor.state().past).toBe(past);
    expect(r.editor.state().scene.parts[0]!.position).toEqual([0, 0, 0]);
    expect(r.ghosts.at(-1)).toBeNull();
  });

  it('SCN-008 pointercancel cancels the drag', async () => {
    const r = rig();
    const canvas = await r.mount();
    dom.fireEvent.pointerDown(canvas, at(50, 50));
    dom.fireEvent.pointerMove(canvas, at(70, 50));
    dom.fireEvent.pointerCancel(canvas, at(70, 50));
    expect(r.editor.state().past).toBe(1);
    expect(r.editor.state().scene.parts[0]!.position).toEqual([0, 0, 0]);
  });

  it('SCN-008 no part is dragged while the plant runs', async () => {
    const r = rig();
    const canvas = await r.mount();
    r.editor.setRunning(true);
    dom.fireEvent.pointerDown(canvas, at(50, 50));
    dom.fireEvent.pointerMove(canvas, at(70, 50));
    dom.fireEvent.pointerUp(canvas, at(70, 50));
    expect(r.editor.state().scene.parts[0]!.position).toEqual([0, 0, 0]);
    expect(r.ghosts.length).toBe(0);
  });

  it('SCN-008 the camera does not orbit during a part drag, and still orbits from empty floor', async () => {
    const r = rig();
    const canvas = await r.mount();
    dom.fireEvent.pointerDown(canvas, at(50, 50));
    dom.fireEvent.pointerMove(canvas, at(70, 50));
    dom.fireEvent.pointerUp(canvas, at(70, 50));
    expect(r.log).toEqual([]);
    dom.fireEvent.pointerDown(canvas, at(95, 95)); // far from every part
    dom.fireEvent.pointerMove(canvas, at(90, 95));
    dom.fireEvent.pointerUp(canvas, at(90, 95));
    expect(r.log).toEqual(['orbit']);
  });
});

await import('../core/plantCore'); // registers the shipped parts, whose signals the hover label names

describe('the part under the pointer and the focused part (VIS-003)', () => {
  const belt: ScenePart = { id: 'b1', part: 'belt', name: 'Belt1', position: [0, 0.5, 0], rotationYDeg: 0, config: {} };
  const shipped: PlantSceneFile = { schemaVersion: 1, name: 'Hover', parts: [belt], cameras: [] };
  function hoverRig() {
    const highlights: Array<string | null> = [];
    const picks: Array<readonly [number, number]> = [];
    const fake: PlantRenderer = {
      webgl2: true,
      setSnapshot: () => undefined,
      setQuality: () => undefined,
      setCameraPreset: () => undefined,
      cameraState: () => CAMERA,
      orbit: () => undefined,
      pan: () => undefined,
      zoom: () => undefined,
      onContext: () => () => undefined,
      fps: () => ({ current: 60, p5: 60 }),
      resize: () => undefined,
      dispose: () => undefined,
      // The belt fills the left half of the canvas.
      pick: (ndc) => (picks.push(ndc), ndc[0] < 0 ? 'b1' : null),
      setHighlight: (id) => void highlights.push(id),
      anchorOf: () => [0.25, 0.4],
    };
    const engine = { loadRenderer: async () => fake } as unknown as PlantEngine;
    const feed: SnapshotFeed = { latest: () => undefined, subscribe: () => () => undefined, count: () => 0 };
    const mount = async (focusedPart?: string) => {
      dom.render(
        <PlantCanvas
          engine={engine}
          scene={shipped}
          feed={feed}
          visible
          quality={undefined}
          display={{ mode: 'light', reducedMotion: false }}
          label="canvas"
          {...(focusedPart ? { focusedPart } : {})}
          onRenderer={() => undefined}
          onFailure={() => undefined}
        />,
      );
      await dom.settle();
      const canvas = document.querySelector<HTMLCanvasElement>('[data-plant-canvas]')!;
      canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 100 }) as DOMRect;
      return canvas;
    };
    const label = () => document.querySelector<HTMLElement>('[data-plant-part-label]');
    return { highlights, picks, mount, label };
  }

  it('VIS-003 a pointer over a part marks it and shows its name and signal names; leaving the part removes both', async () => {
    const r = hoverRig();
    const canvas = await r.mount();
    expect(r.label()).toBeNull();
    dom.fireEvent.pointerMove(canvas, at(20, 50));
    await dom.settle();
    expect(r.picks.at(-1)![0]).toBeCloseTo(-0.6, 9);
    expect(r.picks.at(-1)![1]).toBeCloseTo(0, 9);
    expect(r.label()?.textContent).toBe('Belt1 · signals: Belt1.run');
    expect(r.label()?.dataset.plantPartLabel).toBe('b1');
    expect(r.label()?.style.left).toBe('25%');
    expect(r.highlights.at(-1)).toBe('b1');
    dom.fireEvent.pointerMove(canvas, at(80, 50)); // empty floor
    await dom.settle();
    expect(r.label()).toBeNull();
    expect(r.highlights.at(-1)).toBeNull();
    dom.fireEvent.pointerMove(canvas, at(20, 50));
    dom.fireEvent.pointerLeave(canvas, at(20, 50));
    await dom.settle();
    expect(r.label()).toBeNull();
  });

  it('VIS-003 the part whose control has the keyboard focus is marked and named without a pointer', async () => {
    const r = hoverRig();
    await r.mount('b1');
    await dom.settle();
    expect(r.label()?.textContent).toBe('Belt1 · signals: Belt1.run');
    expect(r.highlights.at(-1)).toBe('b1');
  });

  it('VIS-003 a drag still orbits and does not pick', async () => {
    const r = hoverRig();
    const canvas = await r.mount();
    dom.fireEvent.pointerDown(canvas, at(20, 50));
    const before = r.picks.length;
    dom.fireEvent.pointerMove(canvas, at(30, 50));
    dom.fireEvent.pointerUp(canvas, at(30, 50));
    expect(r.picks.length).toBe(before);
  });
});
