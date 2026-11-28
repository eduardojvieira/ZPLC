import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'bun:test';
import { setupDom, stubProjectLoader } from '../../test/dom';

const dom = await setupDom();
await stubProjectLoader();
const { useIDEStore } = await import('../../store/useIDEStore');
const { useAppSettings } = await import('../../store/useAppSettings');
const { activeTransport } = await import('../../store/useTransport');
const { announcementsSnapshot } = await import('../../utils/announce');
const { runCommand } = await import('../../commands/bus');
const { parseSettings } = await import('../../utils/appSettings');
const { registerParts, catalogue } = await import('../core/catalogue');
const { itemParts } = await import('../core/parts/items');
const { conveyorParts } = await import('../core/parts/conveyors');
const { sourceParts } = await import('../core/parts/sources');
const { sensorParts } = await import('../core/parts/sensors');
const { flowParts } = await import('../core/parts/flow');
const { panelParts } = await import('../core/parts/panel');
const { PlantPanel } = await import('./PlantPanel');
const { PlantActivityView } = await import('./PlantActivityView');
const { usePlantChoice } = await import('./usePlantChoice');
const { PlantDocument } = await import('../../shell/PlantDocument');
import { SCENE_INDEX } from '../../generated/sceneIndex';
import type { PlantCore, PlantSession, PlantSessionEvent, PlantSnapshot } from '../contracts';
import type { PlantRenderer } from '../view/renderer';
import type { PlantEngine } from './loadPlantEngine';
import type { PlantSessionHandle } from '../session/plantSession';

// The shipped scenes register their parts when the real core loads; the fake engine of these tests does not load it.
registerParts(
  [...itemParts, ...conveyorParts, ...sourceParts, ...sensorParts, ...flowParts, ...panelParts].filter((d) => !catalogue.get(d.id)),
);

const SCENES = join(import.meta.dir, '../../../plant-scenes');
const sceneFiles = (id: string) => ({
  scene: readFileSync(join(SCENES, id, 'scene.json'), 'utf8'),
  map: readFileSync(join(SCENES, id, 'plant-map.json'), 'utf8'),
});
const TIMING = { lostMs: 40, slowMs: 80, sampleMs: 20 };

const snapshot = (items = 0, scans = 0): PlantSnapshot => ({
  timeMs: scans * 10,
  scans,
  parts: [],
  items: Array.from({ length: items }, (_, index) => ({
    id: `item-${index}`,
    part: 'box',
    kind: 'item' as const,
    size: [0.4, 0.3, 0.3] as const,
    p: [index, 0.5, 0] as const,
    q: [0, 0, 0, 1] as const,
  })),
  facts: {},
});

function fakeCore(log: string[], scene: string) {
  let items = 0;
  const core: PlantCore & { throwOnAdd?: string } = {
    stepMs: 5,
    signals: [],
    apply: () => undefined,
    advance: () => undefined,
    sense: () => ({}),
    facts: () => ({}),
    operate: (signal, value) => void log.push(`operate ${signal} ${String(value)}`),
    act: (part, action) => void log.push(`act ${part} ${action}`),
    addItem(kind) {
      if (core.throwOnAdd) throw new Error(core.throwOnAdd);
      items += 1;
      log.push(`add ${kind}`);
      return `added-${items}`;
    },
    removeItem: (id) => void log.push(`remove ${id}`),
    snapshot: () => snapshot(items),
    capture: () => ({ format: 1, bytes: new Uint8Array() }),
    restore: () => undefined,
    reset: () => void log.push(`reset ${scene}`),
    traceHash: async () => '',
    dispose: () => void log.push(`dispose ${scene}`),
  };
  return core;
}

type FakeSession = PlantSessionHandle & { emit(event: PlantSessionEvent): void; stops: number };
function fakeSession(initial: PlantSession['state'] = 'idle'): FakeSession {
  const listeners = new Set<(event: PlantSessionEvent) => void>();
  let state = initial;
  const set = (next: PlantSession['state']) => {
    state = next;
    listeners.forEach((listener) => listener({ kind: 'state', state }));
  };
  const session: FakeSession = {
    get state() {
      return state;
    },
    slowdown: 1,
    scans: 0,
    heldSteps: 0,
    scanMs: 10,
    stops: 0,
    start: async () => set('running'),
    pause: () => set('paused'),
    resume: () => set('running'),
    step: async () => undefined,
    stop: async () => {
      session.stops += 1;
      set('stopped');
    },
    reset: async () => set('idle'),
    onChange: (listener) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    settled: async () => undefined,
    emit: (event) => listeners.forEach((listener) => listener(event)),
  };
  return session;
}

const runtimePort = () => ({
  connected: true,
  type: 'native',
  setClockMode: async () => ({ scanIntervalMs: 10 }),
  scenarioStep: async () => undefined,
  getInfo: async () => ({ cycles: 0 }),
  peek: async (_a: number, length: number) => new Uint8Array(length),
  pokeN: async () => undefined,
  reset: async () => undefined,
});

/** A fake engine, a fake session factory and the logs they write; the renderer behaves as `mode` says. */
function rig(mode: 'ok' | 'unavailable' = 'ok', initialState: PlantSession['state'] = 'idle') {
  const log: string[] = [];
  const cores: ReturnType<typeof fakeCore>[] = [];
  const sessions: FakeSession[] = [];
  const scenes: { parts: unknown[] }[] = [];
  const renderer = {
    snapshots: 0,
    last: undefined as PlantSnapshot | undefined,
    options: [] as unknown[],
    qualities: [] as string[],
    presets: [] as string[],
    fits: 0,
    keys: [] as string[],
    context: undefined as ((event: 'lost' | 'restored' | 'unavailable') => void) | undefined,
    p5: 60,
    disposed: 0,
    camera: { target: [0, 0, 0] as [number, number, number], azimuthDeg: 0, polarDeg: 1, distance: 10 },
  };
  const fake: PlantRenderer = {
    webgl2: true,
    setSnapshot: (next) => {
      renderer.snapshots += 1;
      renderer.last = next;
    },
    setQuality: (level) => void renderer.qualities.push(level),
    setCameraPreset: (name) => void renderer.presets.push(name),
    fitScene: () => void (renderer.fits += 1),
    cameraState: () => renderer.camera,
    orbit: () => void renderer.keys.push('orbit'),
    pan: () => void renderer.keys.push('pan'),
    zoom: () => void renderer.keys.push('zoom'),
    onContext: (listener) => {
      renderer.context = listener;
      return () => undefined;
    },
    fps: () => ({ current: renderer.p5, p5: renderer.p5 }),
    resize: () => undefined,
    dispose: () => void (renderer.disposed += 1),
  };
  const engine: PlantEngine = {
    async createPlantCore(scene) {
      scenes.push(scene);
      const core = fakeCore(log, `core${cores.length}`);
      cores.push(core);
      return core;
    },
    async loadRenderer(_canvas, _scene, options) {
      renderer.options.push(options);
      return mode === 'ok' ? fake : { unavailable: 'WebGL 2 is not available' };
    },
    async shippedScene(id) {
      return sceneFiles(id);
    },
  };
  const deps = {
    loadEngine: async () => engine,
    createSession: () => {
      const session = fakeSession(initialState);
      sessions.push(session);
      return session;
    },
    timing: TIMING,
  };
  const controller = { adapter: runtimePort(), vmState: 'idle', debugCapabilities: null } as never;
  return { log, cores, scenes, sessions, renderer, deps, controller };
}

const text = () => document.querySelector('[data-plant-text]')?.textContent ?? '';
const ready = () => dom.waitFor(() => expect(document.querySelector('[data-plant-text]')).toBeTruthy());

describe('the plant panel (VIS-001, VIS-006, VIS-010, PLS-003, PLS-004, PLS-010)', () => {
  it('VIS-001 the panel shows the 3D canvas as the content of the plant document', async () => {
    dom.patchStore(useIDEStore, {
      loadedFiles: new Map([
        ['scene', { id: 'scene', name: 'scene.json', path: 'scene.json', content: sceneFiles('belt-to-sensor').scene }],
      ]) as never,
    });
    dom.render(<PlantDocument controller={undefined} visible />);
    await dom.waitFor(() => expect(document.querySelector('[data-plant-document] [data-plant-canvas]')).toBeTruthy());
    expect(document.querySelector('[data-plant-canvas]')?.getAttribute('aria-label')).toContain('Belt to sensor');
  });

  it('VIS-006 with no WebGL 2 the panel says so and offers the schematic, and the session keeps running', async () => {
    const r = rig('unavailable', 'running');
    dom.render(<PlantPanel controller={r.controller} visible deps={r.deps} />);
    await dom.waitFor(() => expect(document.querySelector('[data-plant-failure="unavailable"]')).toBeTruthy());
    expect(document.querySelector('[data-plant-failure]')?.textContent).toContain('WebGL 2 is not available');
    await dom.act(async () => r.sessions[0]!.emit({ kind: 'scan', scans: 1, snapshot: snapshot(2, 1) }));
    await dom.waitFor(() => expect(text()).toContain('2 items'));
    await dom.act(async () => r.sessions[0]!.emit({ kind: 'scan', scans: 2, snapshot: snapshot(5, 2) }));
    await dom.waitFor(() => expect(text()).toContain('5 items'));
    dom.screen.getByRole('button', { name: dom.t('plant.panel.showSchematic') }).click();
    await dom.waitFor(() => expect(document.querySelector('[data-plant-schematic]')).toBeTruthy());
    expect(document.querySelector('[data-plant-failure]')).toBeNull();
    expect(text()).toContain('5 items');
  });

  it('VIS-006 a lost context offers the schematic after the time without restoration, and a restored one does not', async () => {
    const r = rig();
    dom.render(<PlantPanel controller={r.controller} visible deps={r.deps} />);
    await dom.waitFor(() => expect(r.renderer.context).toBeDefined());
    await dom.act(async () => r.renderer.context!('lost'));
    await dom.act(async () => r.renderer.context!('restored'));
    await new Promise((resolve) => setTimeout(resolve, TIMING.lostMs * 2));
    expect(document.querySelector('[data-plant-failure]')).toBeNull();
    await dom.act(async () => r.renderer.context!('lost'));
    expect(document.querySelector('[data-plant-failure]')).toBeNull();
    await dom.waitFor(() => expect(document.querySelector('[data-plant-failure="lost"]')).toBeTruthy());
    expect(dom.screen.getByRole('button', { name: dom.t('plant.panel.showSchematic') })).toBeTruthy();
  });

  it('VIS-006 a frame rate under 30 for long enough offers the schematic only while the plant feeds it', async () => {
    const r = rig('ok', 'running');
    r.renderer.p5 = 12;
    dom.render(<PlantPanel controller={r.controller} visible deps={r.deps} />);
    await dom.waitFor(() => expect(r.renderer.snapshots).toBeGreaterThan(0));
    await new Promise((resolve) => setTimeout(resolve, TIMING.slowMs * 2));
    expect(document.querySelector('[data-plant-failure]')).toBeNull(); // no scans, so the low rate says nothing about the graphics
    const feeding = setInterval(() => r.sessions[0]?.emit({ kind: 'scan', scans: 1, snapshot: snapshot(1, 1) }), 5);
    try {
      await dom.waitFor(() => expect(document.querySelector('[data-plant-failure="slow"]')).toBeTruthy());
    } finally {
      clearInterval(feeding);
    }
  });

  it('VIS-010 the push button works by pointer and by keyboard', async () => {
    const r = rig();
    dom.render(<PlantPanel controller={r.controller} visible deps={r.deps} />);
    await ready();
    const button = dom.screen.getByRole('button', { name: dom.t('plant.panel.press', { name: 'StartButton' }) });
    dom.fireEvent.pointerDown(button);
    dom.fireEvent.pointerUp(button);
    dom.fireEvent.keyDown(button, { key: ' ' });
    dom.fireEvent.keyUp(button, { key: ' ' });
    dom.fireEvent.keyDown(button, { key: 'Enter' });
    dom.fireEvent.keyUp(button, { key: 'Enter' });
    expect(r.log.filter((line) => line.startsWith('operate'))).toEqual([
      'operate StartButton.pressed true',
      'operate StartButton.pressed false',
      'operate StartButton.pressed true',
      'operate StartButton.pressed false',
      'operate StartButton.pressed true',
      'operate StartButton.pressed false',
    ]);
  });

  it('VIS-010 a fault action is triggered from the menu by keyboard', async () => {
    const r = rig();
    dom.render(<PlantPanel controller={r.controller} visible deps={r.deps} />);
    await ready();
    const menu = document.querySelector<HTMLSelectElement>('[data-plant-fault="Belt1"]')!;
    const action = menu.options[1]!.value;
    await dom.act(async () => {
      dom.fireEvent.change(menu, { target: { value: action } });
    });
    expect(r.log.filter((line) => line.startsWith('act'))).toEqual([]);
    await dom.act(async () => void document.querySelector<HTMLButtonElement>('[data-plant-fault-trigger="Belt1"]')!.click());
    expect(r.log).toContain(`act Belt1 ${action}`);
  });

  it('VIS-010 add item puts an item at the emitter, and is refused with a located message when the scene has no emitter', async () => {
    const r = rig();
    dom.render(<PlantPanel controller={r.controller} visible deps={r.deps} />);
    await ready();
    await dom.act(async () => void dom.screen.getByRole('button', { name: dom.t('plant.panel.addItem') }).click());
    expect(r.log).toContain('add box');
    await dom.waitFor(() => expect(document.querySelector('[data-plant-remove-item]')).toBeTruthy());
    r.cores[0]!.throwOnAdd = 'the scene already holds 1000 items';
    await dom.act(async () => void dom.screen.getByRole('button', { name: dom.t('plant.panel.addItem') }).click());
    expect(document.querySelector('[data-plant-message]')?.textContent).toContain('1000 items');
    // a scene without an emitter: the project's scene, written without one
    const noEmitter = JSON.parse(sceneFiles('belt-to-sensor').scene) as { parts: { part: string }[] };
    noEmitter.parts = noEmitter.parts.filter((part) => part.part !== 'emitter');
    dom.patchStore(useIDEStore, {
      loadedFiles: new Map([
        ['scene', { id: 'scene', name: 'scene.json', path: 'scene.json', content: JSON.stringify(noEmitter) }],
      ]) as never,
    });
    dom.render(<PlantPanel controller={r.controller} visible deps={r.deps} />);
    await dom.waitFor(() => expect(document.querySelectorAll('[data-plant-add-item]').length).toBe(2));
    const second = document.querySelectorAll<HTMLButtonElement>('[data-plant-add-item]')[1]!;
    await dom.act(async () => second.click());
    await dom.waitFor(() =>
      expect([...document.querySelectorAll('[data-plant-message]')].some((m) => m.textContent === dom.t('plant.panel.noEmitter'))).toBe(
        true,
      ),
    );
  });

  it('VIS-011 every visible string comes from the catalogue in English and Spanish', async () => {
    for (const locale of ['en', 'es'] as const) {
      const r = rig('unavailable');
      const view = dom.render(<PlantPanel controller={r.controller} visible deps={r.deps} />, { locale });
      await dom.waitFor(() => expect(document.querySelector('[data-plant-failure]')).toBeTruthy());
      const shown = view.container.textContent ?? '';
      expect(shown).not.toMatch(/plant\.(panel|quality|text|session)\./);
      expect(shown).toContain(dom.tFor(locale)('plant.panel.resetPlant'));
      expect(shown).toContain(dom.tFor(locale)('plant.panel.showSchematic'));
      view.unmount();
    }
  });

  it('PLT-016 the slowdown message is shown and announced once per change', async () => {
    const r = rig('ok', 'running');
    dom.render(<PlantPanel controller={r.controller} visible deps={r.deps} />);
    await ready();
    const before = announcementsSnapshot().polite.seq;
    const message = dom.t('plant.session.slowdown', { percent: 50 });
    await dom.act(async () => r.sessions[0]!.emit({ kind: 'slowdown', factor: 0.5, message }));
    expect(document.querySelector('[data-plant-slowdown]')?.textContent).toBe(message);
    expect(announcementsSnapshot().polite.message).toBe(message);
    expect(announcementsSnapshot().polite.seq).toBe(before + 1);
    await dom.act(async () => r.sessions[0]!.emit({ kind: 'slowdown', factor: 1, message: dom.t('plant.session.realtime') }));
    expect(document.querySelector('[data-plant-slowdown]')).toBeNull();
    expect(announcementsSnapshot().polite.seq).toBe(before + 2);
  });

  it('PLS-003 the panel renders no Run, Pause, Step, Stop or Reset control', async () => {
    const r = rig();
    dom.render(<PlantPanel controller={r.controller} visible deps={r.deps} />);
    await ready();
    const names = [...document.querySelectorAll('button')].map((button) => button.textContent ?? '');
    for (const word of ['Run', 'Pause', 'Step', 'Stop', 'Resume', 'Play']) expect(names.filter((name) => name === word)).toEqual([]);
    // "Reset plant" is a plant tool, not the transport's Reset
    expect(names.some((name) => name === dom.t('plant.panel.resetPlant'))).toBe(true);
  });

  it('PLS-003 while the document is open the session is the active transport, and the command bar Run starts it', async () => {
    const r = rig();
    const view = dom.render(<PlantPanel controller={r.controller} visible deps={r.deps} />);
    await dom.waitFor(() => expect(activeTransport(r.controller).kind).toBe('plant'));
    await dom.act(async () => activeTransport(r.controller).run());
    expect(r.sessions[0]!.state).toBe('running');
    view.unmount();
    expect(activeTransport(r.controller).kind).toBe('program');
    expect(r.sessions[0]!.stops).toBe(1);
  });

  it('PLS-003 changing the scene unregisters the transport of the old one and registers the new one', async () => {
    const r = rig('ok', 'running');
    dom.render(<PlantPanel controller={r.controller} visible deps={r.deps} />);
    await dom.waitFor(() => expect(r.sessions.length).toBe(1));
    const chooser = dom.screen.getByLabelText(dom.t('plant.panel.scene'));
    await dom.act(async () => {
      dom.fireEvent.change(chooser, { target: { value: 'counted-queue' } });
    });
    await dom.waitFor(() => expect(r.sessions.length).toBe(2));
    expect(r.sessions[0]!.stops).toBe(1);
    expect(r.log).toContain('dispose core0');
    await dom.waitFor(() => expect(activeTransport(r.controller).kind).toBe('plant'));
  });

  it('PLS-004 Edit scene is offered only while the transport is stopped', async () => {
    const r = rig();
    dom.render(<PlantPanel controller={r.controller} visible deps={r.deps} />);
    await ready();
    const edit = () => document.querySelector<HTMLButtonElement>('[data-plant-edit-scene]')!;
    expect(edit().disabled).toBe(false);
    await dom.act(async () => activeTransport(r.controller).run());
    await dom.waitFor(() => expect(edit().disabled).toBe(true));
    await dom.act(async () => activeTransport(r.controller).stop());
    await dom.waitFor(() => expect(edit().disabled).toBe(false));
  });

  it('SCN-008 Edit scene opens the editor only while stopped; an edit, then Done, rebuilds the plant from the edited scene', async () => {
    const r = rig();
    dom.render(<PlantPanel controller={r.controller} visible deps={r.deps} />);
    await ready();
    const edit = () => document.querySelector<HTMLButtonElement>('[data-plant-edit-scene]')!;
    await dom.act(async () => activeTransport(r.controller).run());
    await dom.waitFor(() => expect(edit().disabled).toBe(true));
    await dom.act(async () => activeTransport(r.controller).stop());
    await dom.waitFor(() => expect(edit().disabled).toBe(false));
    await dom.act(async () => dom.fireEvent.click(edit()));
    expect(document.querySelector('[data-plant-editor]')).toBeTruthy();
    const before = r.scenes[0]!.parts.length;
    // a part added in the Plant activity is an edit of the session
    const { usePlantEdit } = await import('../editSession');
    dom.act(() => void usePlantEdit.getState().editor!.place('belt-x', 'belt', [4, 0, 4]));
    await dom.act(async () => dom.fireEvent.click(document.querySelector('[data-plant-edit-done]')!));
    await dom.waitFor(() => expect(r.scenes.length).toBe(2));
    expect(r.scenes[1]!.parts.length).toBe(before + 1);
    expect(document.querySelector('[data-plant-editor]')).toBeNull();
  });

  it(
    'SCN-008 SCN-014 edit mode keeps the 3D canvas next to the editor; dragging a part there moves it, and Done keeps the ' + 'move',
    async () => {
      const r = rig();
      dom.render(<PlantPanel controller={r.controller} visible deps={r.deps} />);
      await ready();
      await dom.act(async () => dom.fireEvent.click(document.querySelector('[data-plant-edit-scene]')!));
      expect(document.querySelector('[data-plant-editor]')).toBeTruthy(); // the pointer-free path is still there
      const canvas = document.querySelector<HTMLCanvasElement>('[data-plant-canvas]')!;
      expect(canvas).toBeTruthy();
      const first = r.scenes[0]!.parts[0] as { position: [number, number, number] };
      r.renderer.camera.target = [first.position[0], 0, first.position[2]]; // the part is under the centre of the view
      canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 100 }) as DOMRect;
      const at = (x: number) => ({ clientX: x, clientY: 50, pointerId: 1 });
      await dom.act(async () => {
        dom.fireEvent.pointerDown(canvas, at(50));
        dom.fireEvent.pointerMove(canvas, at(75));
        dom.fireEvent.pointerUp(canvas, at(75));
      });
      expect(r.renderer.keys).not.toContain('orbit');
      await dom.act(async () => dom.fireEvent.click(document.querySelector('[data-plant-edit-done]')!));
      await dom.waitFor(() => expect(r.scenes.length).toBe(2));
      const moved = (r.scenes[1]!.parts[0] as { position: [number, number, number] }).position;
      expect(moved[0]).not.toBe(first.position[0]);
    },
  );

  it(
    'PLS-005 the plant document holds Done and no editor panel: the part list, the form and the signals are in the activity, the ' +
      'Inspector and the map',
    async () => {
      const r = rig();
      dom.render(<PlantPanel controller={r.controller} visible deps={r.deps} />);
      await ready();
      await dom.act(async () => dom.fireEvent.click(document.querySelector('[data-plant-edit-scene]')!));
      const bar = document.querySelector<HTMLElement>('[data-plant-editor]')!;
      expect(bar.querySelector('[data-plant-edit-done]')).toBeTruthy();
      expect(bar.querySelector('[data-part], ul, form, table, select, input')).toBeNull();
      expect(dom.screen.queryByRole('button', { name: dom.t('plantEditor.add') })).toBeNull();
    },
  );

  it('SCN-008 Finish editing is refused while the plant runs', async () => {
    const { bindCommands, resetCommandsForTest } = await import('../../commands/bus');
    const { plantEditHandlers } = await import('../../commands/bind/plantEdit');
    const { usePlantEdit } = await import('../editSession');
    resetCommandsForTest();
    bindCommands(plantEditHandlers());
    const r = rig();
    dom.render(<PlantPanel controller={r.controller} visible deps={r.deps} />);
    await ready();
    await dom.act(async () => dom.fireEvent.click(document.querySelector('[data-plant-edit-scene]')!));
    // the session is edited while stopped, then the plant runs
    await dom.act(async () => activeTransport(r.controller).run());
    await dom.waitFor(() => expect((document.querySelector('[data-plant-edit-done]') as HTMLButtonElement).disabled).toBe(true));
    expect(runCommand('plant.endEdit')).toBe('ran');
    await dom.settle();
    expect(usePlantEdit.getState().editor).not.toBeNull();
    expect(r.scenes.length).toBe(1); // the plant was not rebuilt
    expect(announcementsSnapshot().polite.message).toBe(dom.t('plantEditor.running'));
    await dom.act(async () => activeTransport(r.controller).stop());
    resetCommandsForTest();
  });

  it('FLW-005 reopening the plant document shows the scene that was edited and not saved', async () => {
    const { usePlantEdit } = await import('../editSession');
    const r = rig();
    const first = dom.render(<PlantPanel controller={r.controller} visible deps={r.deps} />);
    await ready();
    await dom.act(async () => dom.fireEvent.click(document.querySelector('[data-plant-edit-scene]')!));
    const before = r.scenes[0]!.parts.length;
    dom.act(() => void usePlantEdit.getState().editor!.place('belt-x', 'belt', [4, 0, 4]));
    await dom.act(async () => dom.fireEvent.click(document.querySelector('[data-plant-edit-done]')!));
    await dom.waitFor(() => expect(r.scenes.length).toBe(2));
    first.unmount(); // the plant document is closed, and opened again
    dom.render(<PlantPanel controller={r.controller} visible deps={r.deps} />);
    await dom.waitFor(() => expect(r.scenes.length).toBe(3)); // the plant core was built again for the reopened document
    expect(r.scenes[2]!.parts.length).toBe(before + 1);
    usePlantEdit.setState({ unsaved: {} });
  });

  it('FLW-005 the scene being edited joins Save all', async () => {
    const written: string[] = [];
    const fake = {
      getDirectoryHandle: async () => ({
        getFileHandle: async (name: string) => ({
          createWritable: async () => ({ write: async () => void written.push(name), close: async () => {} }),
        }),
      }),
    } as unknown as FileSystemDirectoryHandle;
    const files = new Map([['a', { id: 'a', name: 'Main.st', path: 'Main.st', content: 'PROGRAM Main', isModified: false }]]);
    dom.patchStore(useIDEStore, { directoryHandle: fake, loadedFiles: files as never });
    const { saveAllDocuments } = await import('../../store/saveAll');
    const { usePlantEdit } = await import('../editSession');
    const r = rig();
    dom.render(<PlantPanel controller={r.controller} visible deps={r.deps} />);
    await ready();
    expect((await saveAllDocuments()).saved).toBe(0);
    await dom.act(async () => dom.fireEvent.click(document.querySelector('[data-plant-edit-scene]')!));
    expect((await saveAllDocuments()).saved).toBe(0); // editing with no change writes nothing
    // an edit made in the session, as the Plant activity and the Inspector make it
    dom.act(() => void usePlantEdit.getState().editor!.place('belt-x', 'belt', [4, 0, 4]));
    expect((await saveAllDocuments()).saved).toBe(1);
    expect(written.filter((name) => name.endsWith('.scene.json'))).toHaveLength(1);
    expect(written.every((name) => /\.(scene|plant-map)\.json$/.test(name))).toBe(true); // the scene and its map, nothing else
    expect(useIDEStore.getState().loadedFiles.get('a')).toEqual(files.get('a') as never);
    expect((await saveAllDocuments()).saved).toBe(0);
  });

  it('PLS-010 with visible false no frame is drawn and scan events still arrive', async () => {
    const r = rig('ok', 'running');
    const view = dom.render(<PlantPanel controller={r.controller} visible={false} deps={r.deps} />);
    await dom.waitFor(() => expect(r.renderer.options.length).toBe(1));
    await ready();
    const drawn = r.renderer.snapshots;
    await dom.act(async () => r.sessions[0]!.emit({ kind: 'scan', scans: 1, snapshot: snapshot(3, 1) }));
    await dom.waitFor(() => expect(text()).toContain('3 items'));
    expect(r.renderer.snapshots).toBe(drawn);
    view.rerender(<PlantPanel controller={r.controller} visible deps={r.deps} />);
    await dom.waitFor(() => expect(r.renderer.last?.items.length).toBe(3));
  });

  it('PLS-012 the quality level is read from Preferences, and an unknown stored value falls back to automatic', async () => {
    const settings = useAppSettings.getState().settings;
    dom.patchStore(useAppSettings, { settings: { ...settings, plantQuality: parseSettings({ plantQuality: 'ultra' }).plantQuality } });
    const a = rig();
    const first = dom.render(<PlantPanel controller={a.controller} visible deps={a.deps} />);
    await dom.waitFor(() => expect(a.renderer.options.length).toBe(1));
    expect(a.renderer.options[0]).not.toHaveProperty('quality');
    first.unmount();
    dom.patchStore(useAppSettings, { settings: { ...settings, plantQuality: 'low' } });
    const b = rig();
    dom.render(<PlantPanel controller={b.controller} visible deps={b.deps} />);
    await dom.waitFor(() => expect(b.renderer.options.length).toBe(1));
    expect(b.renderer.options[0]).toMatchObject({ quality: 'low' });
    await dom.act(async () => useAppSettings.getState().update({ plantQuality: 'high' }));
    await dom.waitFor(() => expect(b.renderer.qualities).toEqual(['high']));
  });

  // The shell binds the command in every state (FND-002); the 3D view on screen is what it fits.
  it(
    'VIS-002 the Fit scene button and the command of the same name refit the view while a 3D view is shown, and once none is the ' +
      'command fits nothing and says why',
    async () => {
      const { fitPlantScene } = await import('../../commands/bind/plant');
      const r = rig();
      dom.render(<PlantPanel controller={r.controller} visible deps={r.deps} />);
      const fit = () => document.querySelector<HTMLButtonElement>('[data-command="view.fitPlantScene"]')!;
      await dom.waitFor(() => expect(fit().disabled).toBe(false));
      expect(fit().textContent).toBe(dom.t('command.view.fitPlantScene'));
      await dom.act(async () => void fit().click());
      expect(r.renderer.fits).toBe(1);
      fitPlantScene();
      expect(r.renderer.fits).toBe(2);
      await dom.act(async () => void dom.fireEvent.click(dom.screen.getByRole('button', { name: dom.t('plant.panel.viewSchematic') })));
      expect(document.querySelector('[data-command="view.fitPlantScene"]')).toBeNull();
      useIDEStore.setState({ consoleEntries: [] });
      fitPlantScene();
      expect(r.renderer.fits).toBe(2);
      expect(useIDEStore.getState().consoleEntries.map((entry) => [entry.type, entry.message])).toEqual([
        ['warning', dom.t('plant.panel.fitNoView')],
      ]);
    },
  );

  it('VIS-002 the plant toolbar keeps the place of Reset plant and Edit scene when the scene becomes ready', async () => {
    const r = rig();
    dom.render(<PlantPanel controller={r.controller} visible deps={r.deps} />);
    const toolbar = () => document.querySelector('[role="toolbar"]')!;
    const place = (selector: string) =>
      [...toolbar().children].findIndex((child) => child.matches(selector) || child.querySelector(selector));
    const before = (selector: string) => [...toolbar().children].slice(0, place(selector)).map((child) => child.textContent);
    expect(document.querySelector('[data-command="view.fitPlantScene"]')).toBeNull();
    const reset = [place('[data-plant-reset]'), before('[data-plant-reset]')];
    const edit = [place('[data-plant-edit-scene]'), before('[data-plant-edit-scene]')];
    await dom.waitFor(() => expect(document.querySelector('[data-command="view.fitPlantScene"]')).toBeTruthy());
    expect([place('[data-plant-reset]'), before('[data-plant-reset]')]).toEqual(reset);
    expect([place('[data-plant-edit-scene]'), before('[data-plant-edit-scene]')]).toEqual(edit);
  });

  it('VIS-002 the keyboard moves the camera and the preset chooser sets a preset', async () => {
    const r = rig();
    dom.render(<PlantPanel controller={r.controller} visible deps={r.deps} />);
    await dom.waitFor(() => expect(r.renderer.context).toBeDefined());
    const canvas = document.querySelector('canvas')!;
    for (const key of ['ArrowLeft', '+', 'w']) dom.fireEvent.keyDown(canvas, { key });
    expect(r.renderer.keys).toEqual(['orbit', 'zoom', 'pan']);
    await dom.waitFor(() => expect((dom.screen.getByLabelText(dom.t('plant.panel.camera')) as HTMLSelectElement).disabled).toBe(false));
    await dom.act(async () => {
      dom.fireEvent.change(dom.screen.getByLabelText(dom.t('plant.panel.camera')), { target: { value: 'Overview' } });
    });
    expect(r.renderer.presets).toEqual(['Overview']);
  });
});

/** A project folder with the file API the plant panel uses: `scenes/` of named texts, listable, readable and writable. */
function fakeProject(initial: Record<string, string> = {}) {
  const files = new Map(Object.entries(initial));
  const entry = (name: string) => ({
    getFile: async () => ({ size: (files.get(name) ?? '').length, text: async () => files.get(name) ?? '' }),
    createWritable: async () => ({
      write: async (value: string) => void files.set(name, value),
      close: async () => undefined,
    }),
  });
  const folder = {
    async *values() {
      for (const name of files.keys()) yield { kind: 'file', name };
    },
    getFileHandle: async (name: string, options?: { create?: boolean }) => {
      if (!files.has(name) && !options?.create) throw new Error('not found');
      return entry(name);
    },
  };
  const root = { getDirectoryHandle: async () => folder } as unknown as FileSystemDirectoryHandle;
  return { root, files };
}

const choices = () => [...dom.screen.getByLabelText(dom.t('plant.panel.scene')).querySelectorAll('option')].map((o) => o.textContent);

describe('opening and saving scenes (SCN-001, SCN-006, SCN-016)', () => {
  it('SCN-016 the chooser lists the empty floor and every shipped scene, and the empty floor opens with no parts', async () => {
    const r = rig();
    dom.render(<PlantPanel controller={r.controller} visible deps={r.deps} />);
    await ready();
    expect(choices()).toContain(dom.t('plant.panel.emptyFloor'));
    expect(choices().length).toBe(SCENE_INDEX.length + 1);
    await dom.act(async () => {
      dom.fireEvent.change(dom.screen.getByLabelText(dom.t('plant.panel.scene')), { target: { value: 'empty' } });
    });
    await dom.waitFor(() => expect(r.scenes.at(-1)?.parts.length).toBe(0));
  });

  it('SCN-001 any shipped scene opens from the chooser with no file in the project', async () => {
    // The precondition is set here, not inherited: another test file can leave a file loaded in the shared store.
    dom.patchStore(useIDEStore, { loadedFiles: new Map() as never });
    const r = rig();
    dom.render(<PlantPanel controller={r.controller} visible deps={r.deps} />);
    await ready();
    expect(useIDEStore.getState().loadedFiles.size).toBe(0);
    await dom.act(async () => {
      dom.fireEvent.change(dom.screen.getByLabelText(dom.t('plant.panel.scene')), { target: { value: 'merge-lines' } });
    });
    await dom.waitFor(() => expect(r.scenes.length).toBe(2));
    expect((r.scenes.at(-1) as { name?: string }).name).toBe('Merge two lines');
  });

  it('SCN-006 the scenes of the project folder are listed from the folder and one opens from there', async () => {
    const project = fakeProject({ 'line.scene.json': sceneFiles('counted-queue').scene, 'notes.txt': 'x' });
    dom.patchStore(useIDEStore, { directoryHandle: project.root });
    const r = rig();
    dom.render(<PlantPanel controller={r.controller} visible deps={r.deps} />);
    await dom.waitFor(() => expect(choices()).toContain('line'));
    expect(choices()).not.toContain('notes');
    await dom.act(async () => {
      dom.fireEvent.change(dom.screen.getByLabelText(dom.t('plant.panel.scene')), { target: { value: 'file:line' } });
    });
    await dom.waitFor(() => expect((r.scenes.at(-1) as { name?: string }).name).toBe('Counted queue'));
  });

  it('SCN-006 a project with saved scenes and no scene.json opens its first saved scene until a person chooses', async () => {
    const project = fakeProject({ 'line.scene.json': sceneFiles('counted-queue').scene });
    dom.patchStore(useIDEStore, { directoryHandle: project.root });
    const r = rig();
    dom.render(<PlantPanel controller={r.controller} visible deps={r.deps} />);
    await dom.waitFor(() => expect((dom.screen.getByLabelText(dom.t('plant.panel.scene')) as HTMLSelectElement).value).toBe('file:line'));
    await dom.waitFor(() => expect((r.scenes.at(-1) as { name?: string }).name).toBe('Counted queue'));
  });

  it('SCN-016 a template is saved into the project under a name, then listed and open as a project scene', async () => {
    const project = fakeProject();
    dom.patchStore(useIDEStore, { directoryHandle: project.root });
    const r = rig();
    const { user } = dom.render(<PlantPanel controller={r.controller} visible deps={r.deps} />);
    await ready();
    await user.click(dom.screen.getByRole('button', { name: dom.t('plant.panel.saveToProject') }));
    const field = dom.screen.getByLabelText(dom.t('plant.panel.saveName'));
    await user.clear(field);
    await user.type(field, 'my line');
    await user.click(dom.screen.getByRole('button', { name: dom.t('plant.panel.saveConfirm') }));
    await dom.waitFor(() => expect(project.files.has('my line.scene.json')).toBe(true));
    expect(project.files.get('my line.plant-map.json')).toContain('"schemaVersion":2');
    await dom.waitFor(() => expect(choices()).toContain('my line'));
    expect((dom.screen.getByLabelText(dom.t('plant.panel.scene')) as HTMLSelectElement).value).toBe('file:my line');
    expect(document.querySelector('[data-plant-save-scene]')).toBeNull();
  });

  it('SCN-006 a name the project already holds, or a path, is refused and nothing is written', async () => {
    const project = fakeProject({ 'line.scene.json': sceneFiles('counted-queue').scene });
    dom.patchStore(useIDEStore, { directoryHandle: project.root });
    const r = rig();
    const { user } = dom.render(<PlantPanel controller={r.controller} visible deps={r.deps} />);
    await dom.waitFor(() => expect(choices()).toContain('line'));
    await dom.act(async () => {
      dom.fireEvent.change(dom.screen.getByLabelText(dom.t('plant.panel.scene')), { target: { value: 'empty' } });
    });
    await ready();
    await user.click(dom.screen.getByRole('button', { name: dom.t('plant.panel.saveToProject') }));
    const field = dom.screen.getByLabelText(dom.t('plant.panel.saveName'));
    for (const name of ['line', '../zplc']) {
      await user.clear(field);
      await user.type(field, name);
      await user.click(dom.screen.getByRole('button', { name: dom.t('plant.panel.saveConfirm') }));
      expect(document.querySelector('[role="dialog"] [role="alert"], [role="dialog"] [aria-invalid="true"]')).toBeTruthy();
    }
    expect([...project.files.keys()]).toEqual(['line.scene.json']);
  });
});

describe('the scene of the project itself (CRS-012)', () => {
  it('Save to project writes the root scene.json and plant-map.json, and creates no scenes folder', async () => {
    const written = new Map<string, string>();
    const asked: string[] = []; // folders created
    const handle = {
      getDirectoryHandle: async (name: string, options?: { create?: boolean }) => {
        if (options?.create) asked.push(name);
        throw new Error('not found');
      },
      getFileHandle: async (name: string) => ({
        createWritable: async () => ({ write: async (value: string) => void written.set(name, value), close: async () => undefined }),
      }),
    } as unknown as FileSystemDirectoryHandle;
    dom.patchStore(useIDEStore, {
      directoryHandle: handle,
      loadedFiles: new Map([
        ['scene', { id: 'scene', name: 'scene.json', path: 'scene.json', content: sceneFiles('belt-to-sensor').scene }],
        ['map', { id: 'map', name: 'plant-map.json', path: 'plant-map.json', content: sceneFiles('belt-to-sensor').map }],
      ]) as never,
    });
    const r = rig();
    dom.render(<PlantPanel controller={r.controller} visible deps={r.deps} />);
    await ready();
    expect((dom.screen.getByLabelText(dom.t('plant.panel.scene')) as HTMLSelectElement).value).toBe('project');
    await dom.act(async () => dom.fireEvent.click(document.querySelector('[data-plant-save-scene]')!));
    await dom.waitFor(() => expect(written.has('scene.json')).toBe(true));
    expect(JSON.parse(written.get('scene.json')!).name).toBe('Belt to sensor');
    expect(written.has('plant-map.json')).toBe(true);
    expect(asked).not.toContain('scenes');
  });

  it('a project whose root holds scene.json opens it as its scene although no file of it is open', async () => {
    const files = new Map([['scene.json', sceneFiles('belt-to-sensor').scene]]);
    const handle = {
      getDirectoryHandle: async () => {
        throw new Error('not found');
      },
      getFileHandle: async (name: string) => {
        const text = files.get(name);
        if (text === undefined) throw new Error('not found');
        return { getFile: async () => ({ size: text.length, text: async () => text }) };
      },
    } as unknown as FileSystemDirectoryHandle;
    dom.patchStore(useIDEStore, { directoryHandle: handle, loadedFiles: new Map() as never });
    const r = rig();
    dom.render(<PlantPanel controller={r.controller} visible deps={r.deps} />);
    await dom.waitFor(() => expect((dom.screen.getByLabelText(dom.t('plant.panel.scene')) as HTMLSelectElement).value).toBe('project'));
    await dom.waitFor(() => expect((r.scenes.at(-1) as { name?: string }).name).toBe('Belt to sensor'));
  });
});

describe('one plant edit session and the plant toolbar (PLS-004, PLS-005, PLS-009, PLS-010, PLT-013)', () => {
  const toolbar = () => document.querySelector<HTMLElement>('[role="toolbar"]')!;
  const projectScene = (content: string, map?: string) =>
    dom.patchStore(useIDEStore, {
      loadedFiles: new Map([
        ['scene', { id: 'scene', name: 'scene.json', path: 'scene.json', content }],
        ...(map ? [['map', { id: 'map', name: 'plant-map.json', path: 'plant-map.json', content: map }] as const] : []),
      ]) as never,
    });

  it('PLS-004 the toolbar holds only the view switch, cameras, Reset plant, faults, items and Edit scene', async () => {
    // a project folder, so the save of a template would be offered: it is not a plant thing, and not on the toolbar
    dom.patchStore(useIDEStore, { directoryHandle: fakeProject().root, loadedFiles: new Map() as never });
    const r = rig();
    dom.render(<PlantPanel controller={r.controller} visible deps={r.deps} />);
    await ready();
    await dom.waitFor(() => expect((dom.screen.getByLabelText(dom.t('plant.panel.camera')) as HTMLSelectElement).disabled).toBe(false));
    const allowed = [
      dom.t('plant.panel.view3d'),
      dom.t('plant.panel.viewSchematic'),
      dom.t('plant.panel.resetPlant'),
      dom.t('plant.panel.editScene'),
      dom.t('command.view.fitPlantScene'),
    ];
    const controls = () => [...toolbar().querySelectorAll<HTMLElement>('button, select, input, textarea')];
    const check = () => {
      for (const control of controls()) {
        if (control.tagName === 'SELECT') expect(control).toBe(dom.screen.getByLabelText(dom.t('plant.panel.camera')));
        else expect(allowed).toContain(control.textContent ?? '');
      }
      expect(toolbar().contains(dom.screen.getByLabelText(dom.t('plant.panel.scene')))).toBe(false);
      for (const gone of ['[data-plant-save-scene]', '[data-plant-undo]', '[data-plant-redo]', '[data-plant-edit-done]'])
        expect(toolbar().querySelector(gone)).toBeNull();
    };
    check();
    // the scene chooser and the save are still in the document, outside the toolbar, until their homes exist (P2, P5, P6)
    expect(dom.screen.getByLabelText(dom.t('plant.panel.scene'))).toBeTruthy();
    expect(document.querySelector('[data-plant-save-scene]')).toBeTruthy();
    // the faults and the items of the plant are offered in the document
    expect(document.querySelector('[data-plant-fault-trigger]')).toBeTruthy();
    expect(document.querySelector('[data-plant-add-item]')).toBeTruthy();
    // while editing, Done is in the editor of the session, not on the toolbar
    await dom.act(async () => dom.fireEvent.click(document.querySelector('[data-plant-edit-scene]')!));
    expect(document.querySelector('[data-plant-editor] [data-plant-edit-done]')).toBeTruthy();
    check();
  });

  it('PLS-004 Edit scene is offered only while the plant is stopped', async () => {
    const r = rig();
    dom.render(<PlantPanel controller={r.controller} visible deps={r.deps} />);
    await ready();
    const edit = () => toolbar().querySelector<HTMLButtonElement>('[data-plant-edit-scene]')!;
    expect(edit().disabled).toBe(false);
    await dom.act(async () => activeTransport(r.controller).run());
    await dom.waitFor(() => expect(edit().disabled).toBe(true));
    await dom.act(async () => dom.fireEvent.click(edit()));
    expect(document.querySelector('[data-plant-editor]')).toBeNull();
    await dom.act(async () => activeTransport(r.controller).stop());
    await dom.waitFor(() => expect(edit().disabled).toBe(false));
    await dom.act(async () => dom.fireEvent.click(edit()));
    expect(document.querySelector('[data-plant-editor]')).toBeTruthy();
    // while the scene is edited, the toolbar says so and Done editing ends it
    expect(edit().getAttribute('aria-pressed')).toBe('true');
    await dom.act(async () => dom.fireEvent.click(document.querySelector('[data-plant-edit-done]')!));
    expect(document.querySelector('[data-plant-editor]')).toBeNull();
    await dom.waitFor(() => expect(edit().getAttribute('aria-pressed')).toBe('false'));
  });

  it('PLS-005 two views of the session show the same selection after a select in one of them', async () => {
    const { usePlantEdit } = await import('../editSession');
    const { EditorPanel } = await import('../editor/EditorPanel');
    function SecondView() {
      const editor = usePlantEdit((state) => state.editor);
      const mapEditor = usePlantEdit((state) => state.mapEditor);
      usePlantEdit((state) => state.version);
      return editor && mapEditor ? <EditorPanel editor={editor} mapEditor={mapEditor} stopped catalogue={catalogue} /> : null;
    }
    const r = rig();
    dom.render(<PlantPanel controller={r.controller} visible deps={r.deps} />);
    await ready();
    await dom.act(async () => dom.fireEvent.click(document.querySelector('[data-plant-edit-scene]')!));
    const second = dom.render(<SecondView />).container;
    // the first view is the Plant activity, the second the part list of an editor panel
    const first = dom.render(<PlantActivityView />).container;
    const id = (r.scenes[0]!.parts[1] as { id: string }).id;
    const pressed = (root: HTMLElement) => root.querySelector(`[data-part="${id}"] [aria-pressed="true"]`);
    expect(pressed(first)).toBeNull();
    expect(pressed(second)).toBeNull();
    await dom.act(async () => dom.fireEvent.click(first.querySelector(`[data-part="${id}"] [aria-pressed]`)!));
    expect(pressed(first)).toBeTruthy();
    expect(pressed(second)).toBeTruthy();
    // and back: a select in the second view is seen by the first
    const other = (r.scenes[0]!.parts[0] as { id: string }).id;
    await dom.act(async () => dom.fireEvent.click(second.querySelector(`[data-part="${other}"] [aria-pressed]`)!));
    expect(first.querySelector(`[data-part="${other}"] [aria-pressed="true"]`)).toBeTruthy();
    expect(pressed(first)).toBeNull();
  });

  it('PLS-009 an unreadable scene is a message in the plant document that says where the text breaks, with no schematic', async () => {
    projectScene('{\n  "schemaVersion": 1,\n  "parts": [');
    const r = rig();
    dom.render(<PlantDocument controller={r.controller} visible deps={r.deps} />);
    await dom.waitFor(() => expect(document.querySelector('[data-plant-document] [data-plant-load-failed]')).toBeTruthy());
    const message = document.querySelector<HTMLElement>('[data-plant-load-failed]')!;
    expect(message.getAttribute('role')).toBe('alert');
    // the text ends inside the list of parts: line 3, column 13, just after "["
    expect(message.textContent).toContain(dom.t('plant.panel.breaksAt', { line: 3, column: 13 }));
    expect(message.textContent).not.toContain(': :');
    expect(message.querySelector('[data-plant-show-schematic]')).toBeNull();
  });

  it('PLS-009 an invalid scene that can be read is a message in the plant document with the schematic offered and drawn', async () => {
    projectScene(sceneFiles('belt-to-sensor').scene);
    const r = rig();
    const engine = await r.deps.loadEngine();
    const refused = 'plant: invalid scene: parts[0].config.length: 99 is above the limit of 20 m';
    const deps = {
      ...r.deps,
      loadEngine: async () => ({
        ...engine,
        createPlantCore: async () => {
          throw new Error(refused);
        },
      }),
    };
    dom.render(<PlantDocument controller={r.controller} visible deps={deps} />);
    await dom.waitFor(() => expect(document.querySelector('[data-plant-document] [data-plant-load-failed]')).toBeTruthy());
    const message = document.querySelector<HTMLElement>('[data-plant-load-failed]')!;
    expect(message.textContent).toContain(refused);
    expect(message.textContent).not.toContain(': :');
    const show = message.querySelector<HTMLButtonElement>('[data-plant-show-schematic]')!;
    expect(show.textContent).toBe(dom.t('plant.panel.showSchematic'));
    await dom.act(async () => show.click());
    expect(document.querySelector('[data-plant-schematic]')?.getAttribute('aria-label')).toBe(
      dom.t('plant.panel.schematic', { scene: 'Belt to sensor' }),
    );
    expect(document.querySelectorAll('[data-plant-schematic] rect').length).toBeGreaterThan(0);
  });

  it('PLS-005 the Undo and Redo buttons are gone from the toolbar', async () => {
    const { bindCommands, resetCommandsForTest } = await import('../../commands/bus');
    const { plantEditHandlers } = await import('../../commands/bind/plantEdit');
    const { usePlantEdit } = await import('../editSession');
    resetCommandsForTest();
    bindCommands(plantEditHandlers());
    const r = rig();
    dom.render(<PlantPanel controller={r.controller} visible deps={r.deps} />);
    await ready();
    // Edit scene is the command plant.edit: the Edit menu and the palette start the same edit
    expect(runCommand('plant.edit')).toBe('ran');
    await dom.waitFor(() => expect(document.querySelector('[data-plant-editor]')).toBeTruthy());
    expect(usePlantEdit.getState().editor).not.toBeNull();
    for (const gone of ['[data-plant-undo]', '[data-plant-redo]']) expect(document.querySelector(gone)).toBeNull();
    expect(dom.screen.queryByRole('button', { name: dom.t('plantEditor.undo') })).toBeNull();
    expect(dom.screen.queryByRole('button', { name: dom.t('plantEditor.redo') })).toBeNull();
    // and Done is plant.endEdit
    expect(runCommand('plant.endEdit')).toBe('ran');
    await dom.waitFor(() => expect(document.querySelector('[data-plant-editor]')).toBeNull());
    expect(usePlantEdit.getState().editor).toBeNull();
    resetCommandsForTest();
  });

  it('CRS-012 the project scene is saved by Save all as the root scene.json, with no scenes folder', async () => {
    const written: string[] = [];
    const created: string[] = [];
    const fake = {
      // listing the saved scenes opens the folder without creating it; only a save would create it
      getDirectoryHandle: async (name: string, options?: { create?: boolean }) => {
        if (options?.create) created.push(name);
        throw new Error('not found');
      },
      getFileHandle: async (name: string) => ({
        createWritable: async () => ({ write: async () => void written.push(name), close: async () => {} }),
      }),
    } as unknown as FileSystemDirectoryHandle;
    projectScene(sceneFiles('belt-to-sensor').scene);
    dom.patchStore(useIDEStore, { directoryHandle: fake });
    const { saveAllDocuments } = await import('../../store/saveAll');
    const { usePlantEdit } = await import('../editSession');
    const r = rig();
    dom.render(<PlantPanel controller={r.controller} visible deps={r.deps} />);
    await ready();
    await dom.act(async () => dom.fireEvent.click(document.querySelector('[data-plant-edit-scene]')!));
    dom.act(() => void usePlantEdit.getState().editor!.place('belt-x', 'belt', [4, 0, 4]));
    expect((await saveAllDocuments()).saved).toBe(1);
    expect(written).toEqual(['scene.json']);
    expect(created).toEqual([]);
  });

  it("A4 one panel's session is never ended or marked running by another panel on another scene", async () => {
    const { usePlantEdit } = await import('../editSession');
    dom.patchStore(useIDEStore, { loadedFiles: new Map() as never });
    const a = rig();
    const b = rig();
    const viewA = dom.render(<PlantPanel controller={a.controller} visible deps={a.deps} />);
    await dom.waitFor(() => expect(a.scenes.length).toBe(1));
    const viewB = dom.render(<PlantPanel controller={b.controller} visible deps={b.deps} />);
    await dom.waitFor(() => expect(b.scenes.length).toBe(1));
    await dom.act(async () => {
      dom.fireEvent.change(dom.within(viewB.container).getByLabelText(dom.t('plant.panel.scene')), {
        target: { value: 'counted-queue' },
      });
    });
    await dom.waitFor(() => expect(b.scenes.length).toBe(2));
    const inA = (selector: string) => viewA.container.querySelector<HTMLElement>(selector);
    await dom.act(async () => dom.fireEvent.click(inA('[data-plant-edit-scene]')!));
    const before = a.scenes[0]!.parts.length;
    dom.act(() => void usePlantEdit.getState().editor!.place('belt-x', 'belt', [4, 0, 4]));
    // B runs: A is still stopped, and its editor still edits
    await dom.act(async () => b.sessions.at(-1)!.start());
    await dom.settle();
    expect(usePlantEdit.getState().running).toBe(false);
    expect(usePlantEdit.getState().editor!.state().running).toBe(false);
    expect((inA('[data-plant-edit-done]') as HTMLButtonElement).disabled).toBe(false);
    // B closes: A's edits survive, and Done rebuilds A's plant with them
    viewB.unmount();
    expect(inA('[data-plant-editor]')).toBeTruthy();
    expect(usePlantEdit.getState().sceneRef).not.toBeNull();
    await dom.act(async () => dom.fireEvent.click(inA('[data-plant-edit-done]')!));
    await dom.waitFor(() => expect(a.scenes.length).toBe(2));
    expect(a.scenes[1]!.parts.length).toBe(before + 1);
  });

  it('PLS-010 a hidden plant document receives no snapshot and draws no frame', async () => {
    projectScene(sceneFiles('belt-to-sensor').scene, sceneFiles('belt-to-sensor').map); // with its map, so a session binds
    const r = rig('ok', 'running');
    const view = dom.render(<PlantDocument controller={r.controller} visible={false} deps={r.deps} />);
    await dom.waitFor(() => expect(r.renderer.options.length).toBe(1));
    await ready();
    const drawn = r.renderer.snapshots;
    await dom.act(async () => r.sessions[0]!.emit({ kind: 'scan', scans: 1, snapshot: snapshot(3, 1) }));
    await dom.act(async () => r.sessions[0]!.emit({ kind: 'scan', scans: 2, snapshot: snapshot(4, 2) }));
    await dom.waitFor(() => expect(text()).toContain('4 items')); // the plant core keeps running (P14)
    expect(r.renderer.snapshots).toBe(drawn);
    view.rerender(<PlantDocument controller={r.controller} visible deps={r.deps} />);
    await dom.waitFor(() => expect(r.renderer.last?.items.length).toBe(4));
  });

  it('PLT-013 a plant that is not edited renders as before', async () => {
    const { usePlantEdit } = await import('../editSession');
    dom.patchStore(useIDEStore, { loadedFiles: new Map() as never });
    const r = rig();
    dom.render(<PlantPanel controller={r.controller} visible deps={r.deps} />);
    await ready();
    expect(usePlantEdit.getState().editor).toBeNull();
    expect(document.querySelector('[data-plant-editor]')).toBeNull();
    expect(document.querySelector('[data-plant-canvas]')).toBeTruthy();
    expect(document.querySelector('[data-plant-add-item]')).toBeTruthy();
    expect(document.querySelector('[data-plant-fault-trigger]')).toBeTruthy();
    expect(text()).not.toBe('');
    expect(r.scenes.length).toBe(1); // one core, built once from the scene as shipped
    expect(r.scenes[0]!.parts.length).toBe(JSON.parse(sceneFiles(SCENE_INDEX[0]!.id).scene).parts.length);
  });
});

describe('a scene picked in the Plant activity (plan-u3 P2)', () => {
  let activity: HTMLElement;
  const pick = (value: string) =>
    dom.act(async () => void dom.fireEvent.change(dom.within(activity).getByLabelText(dom.t('plant.panel.scene')), { target: { value } }));
  const defaultName = () => (JSON.parse(sceneFiles(SCENE_INDEX[0]!.id).scene) as { name: string }).name;

  it('PLS-005 an activity pick is taken by one panel only and never ends the edit session of another', async () => {
    const { usePlantEdit } = await import('../editSession');
    dom.patchStore(useIDEStore, { loadedFiles: new Map() as never });
    const a = rig();
    const b = rig();
    const viewA = dom.render(<PlantPanel controller={a.controller} visible deps={a.deps} />);
    await dom.waitFor(() => expect(a.scenes.length).toBe(1));
    const viewB = dom.render(<PlantPanel controller={b.controller} visible deps={b.deps} />);
    activity = dom.render(<PlantActivityView />).container;
    await dom.waitFor(() => expect(b.scenes.length).toBe(1));
    // B is on another scene than A, which is the one being edited
    await dom.act(async () => {
      dom.fireEvent.change(dom.within(viewB.container).getByLabelText(dom.t('plant.panel.scene')), { target: { value: 'counted-queue' } });
    });
    await dom.waitFor(() => expect(b.scenes.length).toBe(2));
    await dom.waitFor(() => expect(viewA.container.querySelector('[data-plant-text]')).toBeTruthy());
    await dom.act(async () => dom.fireEvent.click(viewA.container.querySelector('[data-plant-edit-scene]')!));
    expect(usePlantEdit.getState().editor).not.toBeNull();
    await dom.waitFor(() => expect(usePlantChoice.getState().shown?.key).toBe('counted-queue'));
    await pick('merge-lines');
    await dom.waitFor(() => expect(b.scenes.length).toBe(3));
    expect(usePlantEdit.getState().editor).not.toBeNull();
    expect(a.scenes.length).toBe(1);
  });

  it('PLS-005 a panel that is editing keeps its scene and the activity says to finish editing first', async () => {
    const { usePlantEdit } = await import('../editSession');
    dom.patchStore(useIDEStore, { loadedFiles: new Map() as never });
    const a = rig();
    const view = dom.render(<PlantPanel controller={a.controller} visible deps={a.deps} />);
    activity = dom.render(<PlantActivityView />).container;
    await dom.waitFor(() => expect(a.scenes.length).toBe(1));
    await dom.waitFor(() => expect(usePlantChoice.getState().shown).toBeDefined());
    await dom.waitFor(() => expect(view.container.querySelector('[data-plant-text]')).toBeTruthy());
    await dom.act(async () => dom.fireEvent.click(view.container.querySelector('[data-plant-edit-scene]')!));
    await pick('counted-queue');
    expect(dom.screen.getByText(dom.t('plant.activity.finishEditing'))).toBeTruthy();
    expect(usePlantEdit.getState().editor).not.toBeNull();
    expect(a.scenes.length).toBe(1);
  });

  it('PLS-005 a panel opened later starts on the default scene, not on an earlier pick', async () => {
    dom.patchStore(useIDEStore, { loadedFiles: new Map() as never });
    const a = rig();
    const first = dom.render(<PlantPanel controller={a.controller} visible deps={a.deps} />);
    activity = dom.render(<PlantActivityView />).container;
    await dom.waitFor(() => expect(usePlantChoice.getState().shown).toBeDefined());
    await pick('counted-queue');
    await dom.waitFor(() => expect(a.scenes.length).toBe(2));
    await pick('merge-lines');
    await dom.waitFor(() => expect(a.scenes.length).toBe(3));
    first.unmount();
    const b = rig();
    dom.render(<PlantPanel controller={b.controller} visible deps={b.deps} />);
    await dom.waitFor(() => expect(b.scenes.length).toBe(1));
    expect((b.scenes[0] as { name?: string }).name).toBe(defaultName());
  });

  it('PLS-005 a project switch clears a pending scene request', () => {
    usePlantChoice
      .getState()
      .show({ panel: 'x', key: 'belt-to-sensor', scene: JSON.parse(sceneFiles('belt-to-sensor').scene), map: undefined });
    usePlantChoice.getState().ask({ kind: 'file', name: 'line' });
    expect(usePlantChoice.getState().request).toBeDefined();
    dom.patchStore(useIDEStore, { directoryHandle: {} as FileSystemDirectoryHandle });
    try {
      expect(usePlantChoice.getState().request).toBeUndefined();
    } finally {
      dom.patchStore(useIDEStore, { directoryHandle: null });
    }
  });
});
