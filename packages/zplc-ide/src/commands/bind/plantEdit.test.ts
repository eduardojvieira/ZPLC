import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { setupDom, stubProjectLoader } from '../../test/dom';

const dom = await setupDom();
await stubProjectLoader();
// The code editor is Monaco: its history is its own, and the command only asks the focused one for it.
const triggered: string[] = [];
let focused = true;
await mock.module('../../components/monacoRuntime', () => ({
  DiffEditor: () => null,
  monacoEditor: {
    getEditors: () => [{ hasTextFocus: () => focused, trigger: (_source: string, id: string) => void triggered.push(id) }],
  },
}));
await import('../../plant/core/plantCore'); // registers the shipped parts, as the application does
const { bindCommands, resetCommandsForTest, runCommand } = await import('../bus');
const { plantEditHandlers } = await import('./plantEdit');
const { usePlantEdit } = await import('../../plant/editSession');
const { usePlantDocument } = await import('../../store/usePlantDocument');
const { usePlantChoice } = await import('../../plant/ui/usePlantChoice');
const { PlantActivityView } = await import('../../plant/ui/PlantActivityView');
const { PlantPartInspector } = await import('../../components/PlantPartInspector');
const { announcementsSnapshot } = await import('../../utils/announce');
const { parseScene } = await import('../../plant/core/scene');

const SCENES = join(import.meta.dir, '../../../plant-scenes/belt-to-sensor');
const parsed = parseScene(readFileSync(join(SCENES, 'scene.json'), 'utf8'));
if ('problems' in parsed) throw new Error('fixture scene');
const scene = parsed.scene;
const KEY = 'belt-to-sensor';
const session = usePlantEdit.getState;
const parts = () => session().editor!.state().scene.parts.length;
const listed = () => document.querySelectorAll('li[data-part]').length;

beforeEach(() => {
  triggered.length = 0;
  focused = true;
  resetCommandsForTest();
  bindCommands(plantEditHandlers());
  usePlantDocument.setState({ open: true, active: true });
  usePlantChoice.getState().show({ panel: 'test', key: KEY, scene, map: undefined });
  dom.act(() => session().begin({ scene, map: null }, KEY));
});
afterEach(() => {
  session().setRunning(false);
  session().end();
  usePlantChoice.setState({ request: undefined, shown: undefined });
  usePlantDocument.setState({ open: false, active: false });
  resetCommandsForTest();
});

describe('the Edit menu commands of the plant (PLS-005, SCN-008, SCN-010)', () => {
  it('SCN-010 Edit > Undo and Redo act on the plant edit session and update every view', async () => {
    dom.render(createElement('div', null, createElement(PlantActivityView), createElement(PlantPartInspector)));
    const before = parts();
    dom.act(() => void session().editor!.place('belt-2', 'belt', [4, 0, 4]));
    expect([parts(), listed()]).toEqual([before + 1, before + 1]);
    expect(dom.screen.getByLabelText(dom.t('plantEditor.name'))).toBeTruthy(); // the Inspector shows the new part
    await dom.act(async () => void runCommand('edit.undo'));
    expect([parts(), listed()]).toEqual([before, before]);
    expect(dom.screen.queryByLabelText(dom.t('plantEditor.name'))).toBeNull();
    await dom.act(async () => void runCommand('edit.redo'));
    expect([parts(), listed()]).toEqual([before + 1, before + 1]);
    expect(triggered).toEqual([]); // the code editor was not asked
  });

  it("SCN-010 in a code editor Undo is the code editor's", async () => {
    dom.act(() => void session().editor!.place('belt-2', 'belt', [4, 0, 4]));
    const before = parts();
    usePlantDocument.setState({ active: false }); // a program is the active document, and a scene is still being edited
    await dom.act(async () => void runCommand('edit.undo'));
    await dom.act(async () => void runCommand('edit.redo'));
    expect(triggered).toEqual(['undo', 'redo']);
    expect(parts()).toBe(before);
    expect(session().editor!.state().future).toBe(0);
    // with the plant document active but no scene being edited, it is the code editor's too
    session().end();
    usePlantDocument.setState({ active: true });
    await dom.act(async () => void runCommand('edit.undo'));
    expect(triggered).toEqual(['undo', 'redo', 'undo']);
  });

  it('SCN-008 undo is refused while the plant runs', async () => {
    dom.act(() => void session().editor!.place('belt-2', 'belt', [4, 0, 4]));
    const before = parts();
    dom.act(() => session().setRunning(true));
    expect(runCommand('edit.undo')).toBe('ran');
    await dom.settle();
    expect(parts()).toBe(before);
    expect(session().editor!.state().past).toBeGreaterThan(0);
    expect(announcementsSnapshot().polite.message).toBe(dom.t('plantEditor.running'));
    expect(triggered).toEqual([]);
  });
});
