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
const { parseSettings } = await import('../../utils/appSettings');
const { registerParts, catalogue } = await import('../core/catalogue');
const { itemParts } = await import('../core/parts/items');
const { conveyorParts } = await import('../core/parts/conveyors');
const { sourceParts } = await import('../core/parts/sources');
const { sensorParts } = await import('../core/parts/sensors');
const { flowParts } = await import('../core/parts/flow');
const { panelParts } = await import('../core/parts/panel');
const { PlantPanel } = await import('./PlantPanel');
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
    await dom.act(async () => dom.fireEvent.click(dom.screen.getByRole('button', { name: dom.t('plantEditor.add') })));
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

  it('SCN-010 Undo and Redo of the editor toolbar reach the editor', async () => {
    const r = rig();
    dom.render(<PlantPanel controller={r.controller} visible deps={r.deps} />);
    await ready();
    await dom.act(async () => dom.fireEvent.click(document.querySelector('[data-plant-edit-scene]')!));
    const count = () => document.querySelectorAll('[data-plant-editor] ul[aria-label] li').length;
    const start = count();
    await dom.act(async () => dom.fireEvent.click(dom.screen.getByRole('button', { name: dom.t('plantEditor.add') })));
    expect(count()).toBe(start + 1);
    await dom.act(async () => dom.fireEvent.click(document.querySelector('[data-plant-undo]')!));
    expect(count()).toBe(start);
    await dom.act(async () => dom.fireEvent.click(document.querySelector('[data-plant-redo]')!));
    expect(count()).toBe(start + 1);
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
    dom.patchStore(useIDEStore, { directoryHandle: fake });
    const { saveAllDocuments } = await import('../../store/saveAll');
    const r = rig();
    dom.render(<PlantPanel controller={r.controller} visible deps={r.deps} />);
    await ready();
    await dom.act(async () => dom.fireEvent.click(document.querySelector('[data-plant-edit-scene]')!));
    await dom.act(async () => dom.fireEvent.click(dom.screen.getByRole('button', { name: dom.t('plantEditor.add') })));
    expect((await saveAllDocuments()).saved).toBeGreaterThanOrEqual(1);
    expect(written.some((name) => name.endsWith('.scene.json'))).toBe(true);
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
