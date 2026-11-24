import { afterEach, describe, expect, it } from 'bun:test';
import { setupDom } from '../test/dom';

const dom = await setupDom();
await (await import('../test/dom')).stubProjectLoader();
const { useIDEStore } = await import('../store/useIDEStore');
const { useMainProcessBridge, useShellCommands } = await import('./useCommandHost');
const { listedCommands, resetCommandsForTest } = await import('./bus');
const { COMMAND_LIST } = await import('./registry');
const { entriesForLevel } = await import('../store/consoleEntries');

type MenuCallback = (id: string) => void;

function Host() {
  useMainProcessBridge();
  return null;
}

function ShellHost() {
  useMainProcessBridge();
  useShellCommands();
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

  // A command that acts on something not on screen is still the shell's: it runs and says what it needs (FND-002).
  it('FND-002 the palette lists Fit scene with no plant on screen, and run from the menu it says why it fitted nothing', () => {
    let menu: MenuCallback | undefined;
    (window as { electronAPI?: unknown }).electronAPI = {
      menu: { onCommand: (callback: MenuCallback) => ((menu = callback), () => undefined) },
    };
    useIDEStore.setState({ isProjectOpen: true });
    try {
      dom.render(<ShellHost />);
      expect(listedCommands(COMMAND_LIST).map((command) => command.id)).toContain('view.fitPlantScene');
      useIDEStore.setState({ consoleEntries: [] });
      menu?.('view.fitPlantScene');
      const entries = useIDEStore.getState().consoleEntries;
      expect(entries.map((entry) => [entry.type, entry.message])).toEqual([['warning', dom.t('plant.panel.fitNoView')]]);
      expect(entriesForLevel(entries, 'normal')).toHaveLength(1);
    } finally {
      useIDEStore.setState({ isProjectOpen: false });
    }
  });
});
