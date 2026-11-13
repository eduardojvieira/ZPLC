import { describe, expect, it } from 'bun:test';
import { setupDom, stubProjectLoader } from '../../test/dom';

const dom = await setupDom();
await stubProjectLoader();
const { useIDEStore } = await import('../../store/useIDEStore');
const { saveAllDocuments } = await import('../../store/saveAll');
const { createCatalogue } = await import('../core/catalogue');
const { createSceneEditor } = await import('./model');
const { createMapEditor } = await import('./mapEditor');
const { EditorPanel } = await import('./EditorPanel');
const { SignalTable } = await import('./SignalTable');
const { plantEditorLearnerEn, plantEditorLearnerEs } = await import('../../i18n/catalog/plantEditorLearner');
const { plantEditorEn, plantEditorEs } = await import('../../i18n/catalog/plantEditor');
import type { PartDefinition, ScenePart } from '../contracts';

const belt: PartDefinition = {
  id: 'belt',
  family: 'conveyors',
  names: { en: 'Belt', es: 'Cinta' },
  config: { speedMps: { kind: 'number', min: 0.1, max: 1, default: 0.5, unit: 'm/s' } },
  signals: (p: ScenePart) => [{ name: `${p.name}.run`, direction: 'command', type: 'BOOL' }],
  actions: [],
  snapPoints: () => [],
  doc: { en: '', es: '' },
};
const sensor: PartDefinition = {
  ...belt,
  id: 'sensor',
  family: 'sensors',
  names: { en: 'Sensor', es: 'Sensor' },
  config: {},
  signals: (p: ScenePart) => [{ name: `${p.name}.seen`, direction: 'sensor', type: 'BOOL' }],
};
const catalogue = createCatalogue([belt, sensor]);
const part = (id: string, name: string, kind = 'belt'): ScenePart => ({
  id,
  part: kind,
  name,
  position: [0, 0, 0],
  rotationYDeg: 0,
  config: {},
});

function mount(stopped = true, scene?: Parameters<typeof createSceneEditor>[1], projectScene = false) {
  const editor = createSceneEditor(catalogue, scene);
  const mapEditor = createMapEditor(editor.signals(), 'floor');
  const view = dom.render(<EditorPanel editor={editor} mapEditor={mapEditor} stopped={stopped} catalogue={catalogue} projectScene={projectScene} />);
  return { editor, mapEditor, screen: dom.screen, within: dom.within, ...view };
}

describe('scene editor panel', () => {
  it('SCN-014 a small scene is built from the empty floor by keyboard alone', async () => {
    const pointer: string[] = [];
    for (const type of ['pointerdown', 'pointerup', 'mousedown', 'mouseup'])
      document.addEventListener(type, () => pointer.push(type), true);
    const { editor, mapEditor, user, screen } = mount();
    const key = async (el: HTMLElement, keys: string) => {
      dom.act(() => el.focus());
      await user.keyboard(keys);
    };
    const add = async (id: string) => {
      dom.fireEvent.change(screen.getByLabelText('Part to add'), { target: { value: id } });
      await key(screen.getByRole('button', { name: 'Add part' }), '{Enter}');
    };
    await add('belt');
    await key(screen.getByLabelText('Position X (m)'), '{Control>}a{/Control}1.5{Enter}');
    await key(screen.getByLabelText('Position Z (m)'), '{Control>}a{/Control}2{Enter}');
    await key(screen.getByLabelText('Rotation (degrees)'), '{Control>}a{/Control}90{Enter}');
    await add('sensor');
    expect(editor.state().scene.parts.map((p) => p.part)).toEqual(['belt', 'sensor']);
    const belt1 = editor.state().scene.parts[0];
    expect(belt1.position).toEqual([1.5, 0, 2]);
    expect(belt1.rotationYDeg).toBe(90);
    await key(screen.getByLabelText('Program point for Belt1.run'), 'Main.run{Enter}');
    await key(screen.getByLabelText('Program point for Sensor1.seen'), 'Main.seen{Enter}');
    expect(mapEditor.map().signals).toEqual({});
    // The panel rebuilt the map editor for the new signals, so the bindings are in the one it holds now.
    expect(screen.getByText('Bound to Main.run')).toBeTruthy();
    expect(screen.getByText('Bound to Main.seen')).toBeTruthy();
    expect(pointer).toEqual([]);
  });

  it('SCN-015 a problem is shown at the part that causes it and the part is focusable from the list', () => {
    const { screen } = mount(true, { schemaVersion: 1, name: 'x', cameras: [], parts: [part('belt-1', 'Same'), part('belt-2', 'Same')] });
    const row = screen.getByRole('button', { name: 'Same, Belt', description: /Same/ } as never);
    expect(row).toBeTruthy();
    const second = screen.getAllByRole('button', { name: 'Same, Belt' })[1];
    dom.act(() => second.focus());
    expect(document.activeElement).toBe(second);
    const note = document.getElementById(second.getAttribute('aria-describedby') ?? '');
    expect(note?.textContent).toContain('"Same"');
  });

  it('SCN-011 the signal table lists type and direction', () => {
    const { screen, within } = mount(true, {
      schemaVersion: 1,
      name: 'x',
      cameras: [],
      parts: [part('belt-1', 'Belt1'), part('sensor-1', 'Sensor1', 'sensor')],
    });
    const rows = screen.getByRole('table', { name: 'Signals of the scene' });
    const run = within(rows.querySelector('[data-signal="Belt1.run"]') as HTMLElement);
    expect(run.getByText('BOOL')).toBeTruthy();
    expect(run.getByText('Command')).toBeTruthy();
    expect(within(rows.querySelector('[data-signal="Sensor1.seen"]') as HTMLElement).getByText('Sensor')).toBeTruthy();
  });

  it('SCN-013 the button appears only with the prop and calls it with the chosen language', async () => {
    const signals = [{ name: 'Belt1.run', direction: 'command' as const, type: 'BOOL' as const }];
    const props = { signals, bindings: {}, problems: [], disabled: false, onBind() {}, onUnbind() {} };
    const without = dom.render(<SignalTable {...props} />);
    expect(without.container.querySelector('table')).toBeTruthy();
    expect(dom.screen.queryByRole('button', { name: 'Create declarations' })).toBeNull();
    without.unmount();
    const chosen: string[] = [];
    const { user } = dom.render(<SignalTable {...props} onCreateDeclarations={(l) => chosen.push(l)} />);
    await user.click(dom.screen.getByRole('button', { name: 'Create declarations' }));
    dom.fireEvent.change(dom.screen.getByLabelText('Language of the program'), { target: { value: 'IL' } });
    await user.click(dom.screen.getByRole('button', { name: 'Create declarations' }));
    expect(chosen).toEqual(['ST', 'IL']);
  });

  it('SCN-013 the declarations text exists in Spanish for every English key', () => {
    expect(Object.keys(plantEditorLearnerEs).sort()).toEqual(Object.keys(plantEditorLearnerEn).sort());
  });

  it('SCN-008 the form is disabled with a message while the plant runs', () => {
    const { screen, editor } = mount(false, { schemaVersion: 1, name: 'x', cameras: [], parts: [part('belt-1', 'Belt1')] });
    editor.select('belt-1');
    expect(screen.getByRole('status').textContent).toContain('stopped');
    expect((screen.getByRole('button', { name: 'Add part' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Delete Belt1' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('SCN-009 a setting outside its range is refused at its field and not applied', async () => {
    const { screen, editor, user } = mount(true, { schemaVersion: 1, name: 'x', cameras: [], parts: [part('belt-1', 'Belt1')] });
    await user.click(screen.getByRole('button', { name: 'Belt1, Belt' }));
    const field = screen.getByLabelText('speedMps (m/s)');
    dom.act(() => field.focus());
    await user.keyboard('{Control>}a{/Control}9{Enter}');
    expect(editor.state().scene.parts[0].config.speedMps).toBeUndefined();
    expect(screen.getByRole('alert').textContent).toContain('limit');
  });

  it('FLW-005 a modified scene is saved by Save all, an unmodified one is not', async () => {
    const written: string[] = [];
    const fake = {
      getDirectoryHandle: async () => ({
        getFileHandle: async (name: string) => ({
          createWritable: async () => ({ write: async (s: string) => void written.push(`${name}:${s.length}`), close: async () => {} }),
        }),
      }),
    } as unknown as FileSystemDirectoryHandle;
    dom.patchStore(useIDEStore, { directoryHandle: fake });
    const { user, screen } = mount();
    expect((await saveAllDocuments()).saved).toBe(0);
    await user.click(screen.getByRole('button', { name: 'Add part' }));
    expect((await saveAllDocuments()).saved).toBe(1);
    expect(written[0]).toContain('Empty floor.scene.json');
    expect((await saveAllDocuments()).saved).toBe(0);
  });

  it('CRS-012 the project scene is saved by Save all as the root scene.json, with no scenes folder', async () => {
    const written: string[] = [];
    const created: string[] = [];
    const fake = {
      getDirectoryHandle: async (name: string) => void created.push(name),
      getFileHandle: async (name: string) => ({
        createWritable: async () => ({ write: async () => void written.push(name), close: async () => {} }),
      }),
    } as unknown as FileSystemDirectoryHandle;
    dom.patchStore(useIDEStore, { directoryHandle: fake });
    const { user, screen } = mount(true, undefined, true);
    await user.click(screen.getByRole('button', { name: 'Add part' }));
    expect((await saveAllDocuments()).saved).toBe(1);
    expect(written).toEqual(['scene.json']);
    expect(created).toEqual([]);
  });

  it('VIS-011 English and Spanish render with no missing key', () => {
    const en = Object.keys(plantEditorEn).sort();
    expect(Object.keys(plantEditorEs).sort()).toEqual(en);
    const holes = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join();
    for (const k of en)
      expect(holes(plantEditorEs[k as keyof typeof plantEditorEs])).toBe(holes(plantEditorEn[k as keyof typeof plantEditorEn]));
    const { container } = mount();
    expect(container.textContent).not.toContain('plantEditor.');
    const es = dom.render(
      <EditorPanel editor={createSceneEditor(catalogue)} mapEditor={createMapEditor([], 'x')} stopped catalogue={catalogue} />,
      { locale: 'es' },
    );
    expect(es.container.textContent).not.toContain('plantEditor.');
    expect(es.container.querySelector('h3')?.textContent).toBe('Piezas');
  });
});
