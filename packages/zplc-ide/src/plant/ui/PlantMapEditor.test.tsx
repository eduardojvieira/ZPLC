import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'bun:test';
import type { ProjectFileWithHandle } from '../../types';
import type { IoMap } from '../../runtime/ioMap';
import { isFocused, setupDom, stubProjectLoader } from '../../test/dom';

const dom = await setupDom();
await stubProjectLoader();
const { registerParts, catalogue } = await import('../core/catalogue');
const { itemParts } = await import('../core/parts/items');
const { conveyorParts } = await import('../core/parts/conveyors');
const { sourceParts } = await import('../core/parts/sources');
const { sensorParts } = await import('../core/parts/sensors');
const { flowParts } = await import('../core/parts/flow');
const { panelParts } = await import('../core/parts/panel');
const { PlantMapEditor } = await import('./PlantMapEditor');
const { usePlantMapProblems } = await import('./plantMapProblems');
const { createSceneEditor } = await import('../editor/model');
const { parseScene } = await import('../core/scene');
const { useIDEStore } = await import('../../store/useIDEStore');

registerParts(
  [...itemParts, ...conveyorParts, ...sourceParts, ...sensorParts, ...flowParts, ...panelParts].filter((d) => !catalogue.get(d.id)),
);

const SCENES = join(import.meta.dir, '../../../plant-scenes');
const parsed = parseScene(readFileSync(join(SCENES, 'belt-to-sensor', 'scene.json'), 'utf8'));
if ('problems' in parsed) throw new Error('fixture scene');
const scene = parsed.scene;
const signals = createSceneEditor(catalogue, scene).signals();
const first = signals[0]!;
const EMPTY: IoMap = { inputs: [], outputs: [] };

const file = (id: string, language: ProjectFileWithHandle['language'], content: string): ProjectFileWithHandle => ({
  id,
  name: id,
  language,
  content,
  isModified: false,
  path: id,
  parentPath: '',
});
const open = (f: ProjectFileWithHandle) => useIDEStore.setState({ loadedFiles: new Map([[f.id, f]]), activeFileId: f.id });
const content = (id: string) => useIDEStore.getState().loadedFiles.get(id)!.content;

afterEach(() => {
  usePlantMapProblems.getState().publish([]);
  useIDEStore.setState({ loadedFiles: new Map(), activeFileId: null });
});

describe('the plant map editor (PLS-006, SCN-012, SCN-013, LNK-002)', () => {
  it('SCN-012 an unbound signal is a problem that opens its row', async () => {
    const view = dom.render(<PlantMapEditor scene={scene} ioMap={EMPTY} />);
    const published = usePlantMapProblems.getState().problems.find((p) => p.signal === first.name);
    expect(published?.kind).toBe('unbound');
    const button = view.container.querySelector<HTMLButtonElement>(`[data-problem-signal="${first.name}"]`)!;
    await view.user.click(button);
    const row = view.container.querySelector(`tr[data-signal="${first.name}"]`)!;
    expect(isFocused(row.querySelector('input')!)).toBe(true);
  });

  it('SCN-012 a type mismatch is a problem that opens its row', async () => {
    const bool = signals.find((s) => s.type === 'BOOL')!;
    const point = 'Main.Wrong';
    const io = {
      inputs: bool.direction === 'sensor' ? [{ path: point, pou: 'Main', name: 'Wrong', type: 'INT' }] : [],
      outputs: bool.direction === 'command' ? [{ path: point, pou: 'Main', name: 'Wrong', type: 'INT', region: 'OPI', address: 0, size: 2 }] : [],
    } as unknown as IoMap;
    const map = { schemaVersion: 2, target: { scene: scene.name }, signals: { [bool.name]: { direction: bool.direction, type: 'BOOL', point } } };
    const view = dom.render(<PlantMapEditor scene={scene} map={map as never} ioMap={io} />);
    expect(usePlantMapProblems.getState().problems.find((p) => p.signal === bool.name)?.kind).toBe('mismatch');
    await view.user.click(view.container.querySelector<HTMLButtonElement>(`[data-problem-signal="${bool.name}"]`)!);
    const row = view.container.querySelector(`tr[data-signal="${bool.name}"]`)!;
    expect(isFocused(row.querySelector('input')!)).toBe(true);
  });

  it('SCN-013 Create the declarations adds the variables of the scene to the open program without overwriting its text', async () => {
    const original = 'PROGRAM Main\n  VAR\n    Counter : INT;\n  END_VAR\n  Counter := Counter + 1;\nEND_PROGRAM\n';
    open(file('Main.st', 'ST', original));
    const view = dom.render(<PlantMapEditor scene={scene} ioMap={EMPTY} />);
    await view.user.click(dom.screen.getByRole('button', { name: dom.t('plantEditor.declCreate') }));
    const text = content('Main.st');
    // every line of the program is still there, in order, and the block is new text
    let at = 0;
    for (const line of original.split('\n').filter(Boolean)) {
      at = text.indexOf(line, at);
      expect(at).toBeGreaterThanOrEqual(0);
    }
    expect(text).toMatch(/VAR_INPUT|VAR_OUTPUT/);
    view.unmount();

    const ld = JSON.stringify({ name: 'Main', variables: { local: [{ name: 'Mine', type: 'INT' }], outputs: [] }, rungs: [] }, null, 2) + '\n';
    open(file('Main.ld.json', 'LD', ld));
    const again = dom.render(<PlantMapEditor scene={scene} ioMap={EMPTY} />);
    await again.user.click(dom.screen.getByRole('button', { name: dom.t('plantEditor.declCreate') }));
    const model = JSON.parse(content('Main.ld.json')) as { variables: { local: { name: string }[]; inputs?: unknown[]; outputs: unknown[] } };
    expect(model.variables.local.map((v) => v.name)).toEqual(['Mine']);
    expect((model.variables.inputs?.length ?? 0) + model.variables.outputs.length).toBe(signals.length);
  });

  it('LNK-002 no address is chosen', async () => {
    open(file('Main.st', 'ST', 'PROGRAM Main\nEND_PROGRAM\n'));
    const view = dom.render(<PlantMapEditor scene={scene} ioMap={EMPTY} />);
    await view.user.click(dom.screen.getByRole('button', { name: dom.t('plantEditor.declCreate') }));
    expect(content('Main.st')).not.toMatch(/\bAT\b|%[IQM]/);
    // and nothing was bound by the action: every row still says so
    expect(view.container.querySelectorAll('tr[data-signal]').length).toBe(signals.length);
    expect(usePlantMapProblems.getState().problems.filter((p) => p.kind === 'unbound').length).toBe(signals.length);
    view.unmount();
    open(file('Main.fbd.json', 'FBD', JSON.stringify({ name: 'Main', variables: { local: [], outputs: [] }, blocks: [], connections: [] })));
    const again = dom.render(<PlantMapEditor scene={scene} ioMap={EMPTY} />);
    await again.user.click(dom.screen.getByRole('button', { name: dom.t('plantEditor.declCreate') }));
    expect(content('Main.fbd.json')).not.toContain('address');
  });
});
