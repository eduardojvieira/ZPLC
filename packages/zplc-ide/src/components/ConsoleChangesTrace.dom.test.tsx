import { afterEach, describe, expect, it } from 'bun:test';
import { setupDom, stubMonaco, stubProjectLoader } from '../test/dom';

// VF-007: the contents of the Changes tab (candidate review) and of the Trace tab, driven through user events. The desktop bridge
// of the main process is a fake that answers like it; the Monaco diff view is the stub of src/test/dom.ts (it is a browser test).
const dom = await setupDom();
await stubProjectLoader();
await stubMonaco();
const { useIDEStore } = await import('../store/useIDEStore');
const { Console } = await import('./Console');
const { translatorFor } = await import('../i18n');
const { tn } = translatorFor('en');

const restores: Array<() => void> = [];
afterEach(() => {
  while (restores.length > 0) restores.pop()!();
});

function open(tab: string, over: Record<string, unknown> = {}) {
  dom.patchStore(useIDEStore, {
    isConsoleCollapsed: false,
    activeConsoleTab: tab as never,
    consoleEntries: [],
    compilerMessages: [],
    compilerMessagesChecked: false,
    isProjectOpen: true,
    ...over,
  } as never);
}
function desktop(review: (request: unknown) => Promise<unknown>) {
  const reviews: unknown[] = [];
  (window as unknown as { electronAPI?: unknown }).electronAPI = {
    workspaceTests: {
      run: async () => ({}),
      compile: async () => ({}),
      safetyCheck: async () => ({}),
      lessonCheck: async () => ({}),
      cancel: async () => undefined,
    },
    candidateChangeSet: {
      review: async (request: unknown) => {
        reviews.push(request);
        return review(request);
      },
    },
  };
  restores.push(() => {
    delete (window as unknown as { electronAPI?: unknown }).electronAPI;
  });
  return reviews;
}
/** A saved workspace with one structured-text file whose buffer differs from the disk. */
function modifiedFile(disk: string, buffer: string) {
  const file = {
    id: 'f1',
    name: 'main.st',
    path: 'src/main.st',
    language: 'ST',
    content: buffer,
    isModified: buffer !== disk,
    parentPath: 'src',
    handle: { getFile: async () => ({ text: async () => disk }) },
  };
  return {
    projectSession: 7,
    workspaceScenarioLink: { workspaceId: 'w1', projectSession: 7 },
    activeFileId: 'f1',
    loadedFiles: new Map([['f1', file]]),
  };
}
const panel = () => dom.within(dom.screen.getByRole('tabpanel'));
const reviewButton = () => panel().getByRole('button', { name: dom.t('console.reviewActiveStChange') }) as HTMLButtonElement;

describe('Changes tab contents in a DOM (VF-007)', () => {
  it('without the desktop app it says so and the review button is disabled', () => {
    open('changes');
    dom.render(<Console />);
    expect(panel().getByText(dom.t('console.changeReviewRequiresThe')).getAttribute('role')).toBe('status');
    expect(reviewButton().disabled).toBe(true);
    expect(panel().getByText(dom.t('console.hostEvidenceBadge'))).toBeTruthy();
  });

  it('with the desktop app and no saved workspace linked it offers to choose the workspace file', () => {
    desktop(async () => ({}));
    open('changes', { projectSession: 7, workspaceScenarioLink: null });
    dom.render(<Console />);
    expect(panel().getByText(dom.t('console.chooseTheSavedWorkspace'))).toBeTruthy();
    expect((panel().getByRole('button', { name: dom.t('console.chooseZplcJson') }) as HTMLButtonElement).disabled).toBe(false);
    expect(reviewButton().disabled).toBe(true);
  });

  it('with a workspace linked but a buffer that is not modified it says only a modified file can be reviewed', () => {
    desktop(async () => ({}));
    open('changes', modifiedFile('PROGRAM Main\nEND_PROGRAM\n', 'PROGRAM Main\nEND_PROGRAM\n'));
    dom.render(<Console />);
    expect(panel().getByText(dom.t('console.onlyAModifiedActive'))).toBeTruthy();
    expect(reviewButton().disabled).toBe(true);
  });

  it(
    'reviewing a modified file sends the path and the buffer, and a rejected result is shown with its diagnostic and without a save ' +
      'button',
    async () => {
      const reviews = desktop(async () => ({
        schemaVersion: 1,
        accepted: false,
        evidenceScope: 'native-posix-host',
        diagnostics: [{ code: 'CHANGESET_INVALID' }],
      }));
      const buffer = 'PROGRAM Main\nVAR x : BOOL; END_VAR\nEND_PROGRAM\n';
      open('changes', modifiedFile('PROGRAM Main\nEND_PROGRAM\n', buffer));
      const { user } = dom.render(<Console />);
      expect(reviewButton().disabled).toBe(false);
      await user.click(reviewButton());
      const result = await dom.screen.findByRole('region', { name: dom.t('console.changeReviewResult') });
      expect(reviews).toEqual([{ workspaceId: 'w1', edit: { path: 'src/main.st', content: buffer } }]);
      expect(dom.within(result).getByRole('heading', { name: dom.t('console.review', { path: 'src/main.st' }) })).toBeTruthy();
      expect(dom.within(result).getByText('CHANGESET_INVALID')).toBeTruthy();
      expect(dom.within(result).queryByRole('button', { name: dom.t('console.saveReviewedChange') })).toBeNull();
      expect(dom.within(result).getByText(dom.t('console.noFileHasBeen'))).toBeTruthy();
    },
  );

  it(
    'a review that the host cannot answer ends in a status, and a buffer equal to the disk is reported as such without asking the ' +
      'host',
    async () => {
      const reviews = desktop(async () => {
        throw new Error('host closed');
      });
      open('changes', modifiedFile('PROGRAM Main\nEND_PROGRAM\n', 'PROGRAM Main\nVAR x : BOOL; END_VAR\nEND_PROGRAM\n'));
      const { user } = dom.render(<Console />);
      await user.click(reviewButton());
      await dom.waitFor(() => expect(panel().getByText(dom.t('console.theReviewCouldNot'))).toBeTruthy());
      expect(reviews).toHaveLength(1);

      const same = 'PROGRAM Main\nEND_PROGRAM\n';
      const file = modifiedFile(same, same);
      file.loadedFiles.get('f1')!.isModified = true;
      open('changes', file);
      await user.click(reviewButton());
      await dom.waitFor(() => expect(panel().getByText(dom.t('console.theActiveBufferMatches'))).toBeTruthy());
      expect(reviews).toHaveLength(1);
    },
  );
});

const sample = (uptimeMs: number, cycles: number, over: Record<string, unknown> = {}) => ({
  source: 'native',
  uptimeMs,
  cycles,
  state: 'running',
  pc: 255,
  error: null,
  overruns: 0,
  opi: [],
  ipi: [],
  programGeneration: 1,
  forceCount: 0,
  compilerRunId: 1,
  receivedAtMs: uptimeMs,
  ...over,
});

describe('Trace tab contents in a DOM (VF-007)', () => {
  it('with no sample it shows an empty state, and the tab name carries no count', () => {
    open('trace');
    dom.patchStore(useIDEStore, { debug: { ...useIDEStore.getState().debug, nativeTrace: [] } } as never);
    dom.render(<Console />);
    expect(dom.within(dom.screen.getByRole('tabpanel')).getByText(dom.t('panel.trace.empty.title'))).toBeTruthy();
    expect(dom.screen.queryByRole('table')).toBeNull();
  });

  it('with samples it is a captioned table with named columns and one row per sample, the newest first', () => {
    open('trace');
    dom.patchStore(useIDEStore, {
      debug: {
        ...useIDEStore.getState().debug,
        nativeTrace: [sample(100, 10), sample(200, 20, { pc: null, overruns: 3 }), sample(300, 30)],
      },
    } as never);
    dom.render(<Console />);
    const table = dom.screen.getByRole('table', { name: dom.t('console.nativePosixHostTrace2') });
    const headers = dom
      .within(table)
      .getAllByRole('columnheader')
      .map((cell) => cell.textContent);
    expect(headers).toEqual([
      dom.t('console.uptime'),
      dom.t('console.cycles'),
      dom.t('console.state'),
      dom.t('console.pc'),
      dom.t('console.error'),
      dom.t('console.overruns'),
    ]);
    const rows = dom.within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(3);
    expect(rows.map((row) => dom.within(row).getAllByRole('cell')[1]!.textContent)).toEqual(['30', '20', '10']);
    expect(dom.within(rows[0]!).getAllByRole('cell')[3]!.textContent).toBe(dom.t('console.0x', { value: 'FF' }));
    expect(dom.within(rows[1]!).getAllByRole('cell')[3]!.textContent).toBe('—');
    expect(dom.within(rows[1]!).getAllByRole('cell')[5]!.textContent).toBe('3');
    expect(dom.screen.getByRole('tab', { name: tn('console.tab.traceAria', 3) })).toBeTruthy();
  });

  it('the clear button of the tab empties the trace', async () => {
    open('trace');
    dom.patchStore(useIDEStore, { debug: { ...useIDEStore.getState().debug, nativeTrace: [sample(100, 10)] } } as never);
    const { user } = dom.render(<Console />);
    expect(dom.screen.getByRole('table')).toBeTruthy();
    await user.click(dom.screen.getByRole('button', { name: dom.t('console.clear', { tab: dom.t('panel.trace').toLowerCase() }) }));
    expect(useIDEStore.getState().debug.nativeTrace).toHaveLength(0);
    await dom.waitFor(() => expect(dom.screen.queryByRole('table')).toBeNull());
  });
});
