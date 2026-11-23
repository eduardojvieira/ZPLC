import { afterEach, describe, expect, it } from 'bun:test';
import { setupDom } from '../test/dom';

const dom = await setupDom();
await (await import('../test/dom')).stubProjectLoader();
const { useIDEStore } = await import('../store/useIDEStore');
const { useMainProcessBridge } = await import('./useCommandHost');
const { resetCommandsForTest } = await import('./bus');
const { entriesForLevel } = await import('../store/consoleEntries');

type MenuCallback = (id: string) => void;

function Host() {
  useMainProcessBridge();
  return null;
}

afterEach(() => {
  resetCommandsForTest();
  useIDEStore.setState({ consoleEntries: [] });
  delete (window as { electronAPI?: unknown }).electronAPI;
});

describe('a menu command the state does not offer (MSG-004, MSG-005)', () => {
  it('MSG-005 the refusal is a warning, so the normal level of Output shows it', () => {
    let menu: MenuCallback | undefined;
    (window as { electronAPI?: unknown }).electronAPI = {
      menu: { onCommand: (callback: MenuCallback) => ((menu = callback), () => undefined) },
    };
    dom.render(<Host />);
    useIDEStore.setState({ consoleEntries: [] });
    menu?.('file.save');
    const entries = useIDEStore.getState().consoleEntries;
    expect(entries.map((entry) => [entry.type, entry.message])).toEqual([['warning', 'Save is not available now.']]);
    expect(entriesForLevel(entries, 'normal')).toHaveLength(1);
  });
});
