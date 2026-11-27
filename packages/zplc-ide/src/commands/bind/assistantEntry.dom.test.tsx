import { afterEach, describe, expect, it } from 'bun:test';
import { setupDom, stubMonaco, stubProjectLoader } from '../../test/dom';

// AIX-003, AIX-007: the editors ask the Assistant about the selection, and the palette opens the MCP connection panel.
const dom = await setupDom();
await stubProjectLoader();
await stubMonaco();
const { useIDEStore } = await import('../../store/useIDEStore');
const { usePreferencesDocument } = await import('../../store/usePreferencesDocument');
const { useAssistantEntry } = await import('../../store/useAssistantEntry');
const { useSelection } = await import('../../shell/useSelection');
const { usePreferencesCommands } = await import('./preferences');
const { useAssistantCommands } = await import('./assistant');
const { runCommand, resetCommandsForTest } = await import('../bus');

function Host() {
  usePreferencesCommands();
  useAssistantCommands();
  return null;
}
afterEach(() => {
  resetCommandsForTest();
  useSelection.getState().clear();
  useAssistantEntry.getState().take();
  usePreferencesDocument.setState({ open: false, active: false, requests: 0, anchor: null });
});

describe('ai.connectMcp (AIX-007)', () => {
  it('AIX-007 opens Preferences at the MCP connection panel, with or without a project', async () => {
    dom.render(<Host />);
    await dom.act(async () => void runCommand('ai.connectMcp'));
    expect(usePreferencesDocument.getState()).toMatchObject({ open: true, active: true, anchor: 'mcp-connection' });
  });
});

describe('ai.askAboutSelection (AIX-003)', () => {
  function open(path: string) {
    dom.patchStore(useIDEStore, {
      isProjectOpen: true,
      activeFileId: `file:${path}`,
      loadedFiles: new Map([[`file:${path}`, { id: `file:${path}`, path, content: '' }]]),
    } as never);
  }

  it('AIX-003 in a diagram it attaches the selected element, by its rung, block, step or transition', async () => {
    open('src/Lamp.ld.json');
    dom.render(<Host />);
    useSelection.getState().setElement({ file: 'src/Lamp.ld.json', element: 'rung:r1/cell:0,1', names: [] });
    await dom.act(async () => void runCommand('ai.askAboutSelection'));
    const pending = useAssistantEntry.getState().pending!;
    expect(pending.mode).toBe('ask');
    expect(pending.context.fields.selection).toEqual({ element: 'rung:r1' });
  });

  it('AIX-003 with no selection it still opens the Assistant on the open file, with nothing invented', async () => {
    open('src/Main.st');
    dom.render(<Host />);
    await dom.act(async () => void runCommand('ai.askAboutSelection'));
    const pending = useAssistantEntry.getState().pending!;
    expect(pending.mode).toBe('ask');
    expect(pending.context.fields.selection).toBeUndefined();
  });
});
