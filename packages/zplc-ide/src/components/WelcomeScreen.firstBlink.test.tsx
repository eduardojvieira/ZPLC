import { describe, expect, it, mock } from 'bun:test';
import { setupDom, stubProjectLoader } from '../test/dom';

const dom = await setupDom();
await stubProjectLoader();
const { useIDEStore } = await import('../store/useIDEStore');
const { EXAMPLE_CATALOG } = await import('../utils/exampleCatalog');
const { WelcomeScreen } = await import('./WelcomeScreen');

const exampleId = Object.entries(EXAMPLE_CATALOG).find(([, entry]) => entry.showOnWelcome)![0];

function prepare() {
  (window as unknown as { showDirectoryPicker: () => void }).showDirectoryPicker = () => undefined;
  const copyExampleProjectToFolder = mock<(id: string, folder?: unknown) => Promise<boolean>>(async () => true);
  dom.patchStore(useIDEStore, {
    copyExampleProjectToFolder: copyExampleProjectToFolder as never,
    getExampleProjects: () => [{ id: exampleId, name: EXAMPLE_CATALOG[exampleId]!.title, description: '' }] as never,
    refreshRecentProjects: async () => undefined,
    recentProjects: [],
    projectOpenError: null,
  });
  return { copyExampleProjectToFolder };
}

const exampleButton = () => document.querySelector<HTMLButtonElement>(`button[data-welcome-example="${exampleId}"]`)!;

describe('Welcome screen: the first blink (GDE-010)', () => {
  it('GDE-010 the first blink takes at most three actions', async () => {
    const { copyExampleProjectToFolder } = prepare();
    const { user } = dom.render(<WelcomeScreen />);
    // Action 1: the example is one click on the start page, with no step before it.
    expect(document.querySelectorAll('[role="dialog"], [role="alertdialog"]').length).toBe(0);
    await user.click(exampleButton());
    expect(copyExampleProjectToFolder).toHaveBeenCalledTimes(1);
    // Nothing is left to dismiss before Run (action 2): no dialog and no alert came up.
    expect(document.querySelectorAll('[role="dialog"], [role="alertdialog"], [role="alert"]').length).toBe(0);
  });

  it('GDE-010 the questions Studio asks before the first blink are at most one', async () => {
    const { copyExampleProjectToFolder } = prepare();
    const { user } = dom.render(<WelcomeScreen />);
    await user.click(exampleButton());
    // The example is copied with no folder given: the one folder question is asked by the copy itself, and nothing else asks.
    expect(copyExampleProjectToFolder.mock.calls[0]).toEqual([exampleId]);
    expect(document.querySelectorAll('[role="dialog"], [role="alertdialog"]').length).toBe(0);
  });
});
