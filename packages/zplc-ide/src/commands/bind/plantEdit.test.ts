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
    getEditors: () => [
      {
        hasTextFocus: () => focused,
        getModel: () => ({ uri: { path: '/1/file:src/Motor.st' } }),
        trigger: (_source: string, id: string) => void triggered.push(id),
      },
    ],
  },
}));
await import('../../plant/core/plantCore'); // registers the shipped parts, as the application does
const { bindCommands, resetCommandsForTest, runCommand } = await import('../bus');
const { plantEditHandlers, offerVisualHistory, usePlantEditCommands } = await import('./plantEdit');
const { useIDEStore } = await import('../../store/useIDEStore');
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
  offerVisualHistory(() => false)();
  session().setRunning(false);
  session().end();
  usePlantEdit.setState({ unsaved: {} });
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
  it("SCN-010 in a visual editor Undo is the visual editor's", async () => {
    dom.act(() => void session().editor!.place('belt-2', 'belt', [4, 0, 4]));
    const before = parts();
    usePlantDocument.setState({ active: false }); // a Ladder, FBD or SFC diagram is the active document
    focused = false; // and no code editor has the keyboard
    const asked: string[] = [];
    const withdraw = offerVisualHistory((direction) => (asked.push(direction), true));
    await dom.act(async () => void runCommand('edit.undo'));
    await dom.act(async () => void runCommand('edit.redo'));
    expect(asked).toEqual(['undo', 'redo']);
    expect(triggered).toEqual([]);
    expect(parts()).toBe(before);
    // with a text file active the editor area does nothing, and the code editor that shows it has it
    withdraw();
    offerVisualHistory(() => false);
    dom.patchStore(useIDEStore, {
      activeFileId: 'file:src/Motor.st',
      loadedFiles: new Map([
        ['file:src/Motor.st', { id: 'file:src/Motor.st', name: 'Motor.st', path: 'src/Motor.st', content: '' }],
      ]) as never,
    });
    await dom.act(async () => void runCommand('edit.undo'));
    expect(triggered).toEqual(['undo']);
  });

  it('SCN-010 with no code editor focused and none showing the active file, Undo does nothing', async () => {
    focused = false;
    usePlantDocument.setState({ active: false });
    offerVisualHistory(() => false);
    dom.patchStore(useIDEStore, {
      activeFileId: 'file:src/Other.st',
      loadedFiles: new Map([
        ['file:src/Other.st', { id: 'file:src/Other.st', name: 'Other.st', path: 'src/Other.st', content: '' }],
      ]) as never,
    });
    await dom.act(async () => void runCommand('edit.undo'));
    expect(triggered).toEqual([]);
  });

  it("SCN-010 in a plain text field Undo is the field's", async () => {
    dom.act(() => void session().editor!.place('belt-2', 'belt', [4, 0, 4]));
    const before = parts();
    const field = document.createElement('input');
    document.body.append(field);
    field.focus();
    const native: string[] = [];
    const original = document.execCommand;
    document.execCommand = ((command: string) => (native.push(command), true)) as typeof document.execCommand;
    try {
      // the plant document is active and a scene is being edited: a focused field still keeps its own history
      await dom.act(async () => void runCommand('edit.undo'));
      await dom.act(async () => void runCommand('edit.redo'));
    } finally {
      document.execCommand = original;
      field.remove();
    }
    expect(native).toEqual(['undo', 'redo']);
    expect(parts()).toBe(before);
    expect(triggered).toEqual([]);
  });
  it('SCN-010 a checkbox, a radio or a button keeps no history of its own: Undo reaches the plant edit', async () => {
    dom.act(() => void session().editor!.place('belt-2', 'belt', [4, 0, 4]));
    const before = parts();
    const box = document.createElement('input');
    box.type = 'checkbox';
    document.body.append(box);
    box.focus();
    await dom.act(async () => void runCommand('edit.undo'));
    box.remove();
    expect(parts()).toBe(before - 1);
  });

  describe('the keys of Undo and Redo on Windows and Linux', () => {
    const press = (target: Element, init: KeyboardEventInit) => {
      const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
      target.dispatchEvent(event);
      return event;
    };
    const row = () => {
      const button = document.createElement('button');
      document.body.append(button);
      button.focus();
      return button;
    };

    it('SCN-010 Ctrl+Z on a part row undoes the plant edit on Windows and Linux', async () => {
      dom.render(createElement(() => (usePlantEditCommands(), null)));
      dom.act(() => void session().editor!.place('belt-2', 'belt', [4, 0, 4]));
      const before = parts();
      const target = row();
      const undone = press(target, { key: 'z', ctrlKey: true });
      expect(parts()).toBe(before - 1);
      expect(undone.defaultPrevented).toBe(true);
      press(target, { key: 'Z', ctrlKey: true, shiftKey: true });
      expect(parts()).toBe(before);
      press(target, { key: 'z', ctrlKey: true });
      press(target, { key: 'y', ctrlKey: true });
      expect(parts()).toBe(before);
      target.remove();
    });

    it('SCN-010 the keys do nothing in a text field, in a code editor, or when the plant document is not the active one', async () => {
      dom.render(createElement(() => (usePlantEditCommands(), null)));
      dom.act(() => void session().editor!.place('belt-2', 'belt', [4, 0, 4]));
      const before = parts();
      const field = document.createElement('input');
      const monaco = document.createElement('div');
      monaco.className = 'monaco-editor';
      const area = document.createElement('textarea');
      monaco.append(area);
      document.body.append(field, monaco);
      for (const target of [field, area]) {
        target.focus();
        expect(press(target, { key: 'z', ctrlKey: true }).defaultPrevented).toBe(false);
      }
      const other = row();
      usePlantDocument.setState({ active: false });
      expect(press(other, { key: 'z', ctrlKey: true }).defaultPrevented).toBe(false);
      expect(parts()).toBe(before);
      expect(triggered).toEqual([]);
      field.remove();
      monaco.remove();
      other.remove();
    });
  });
});
