import { afterEach, describe, expect, it } from 'bun:test';
import { setupDom, stubMonaco, stubProjectLoader } from '../test/dom';

// SHL-004, IDE-030: the review document of the editor area. The desktop bridge is a fake that answers like the main process.
const dom = await setupDom();
await stubProjectLoader();
await stubMonaco();
const { useIDEStore } = await import('../store/useIDEStore');
const { useReviewDocument } = await import('../store/useReviewDocument');
const { ReviewDocument } = await import('./ReviewDocument');
const { useReviewCommands } = await import('../commands/bind/review');
const { runCommand, resetCommandsForTest } = await import('../commands/bus');
const { useNotifications } = await import('../store/notifications');

const restores: Array<() => void> = [];
afterEach(() => {
  while (restores.length > 0) restores.pop()!();
  useReviewDocument.setState({ open: false, active: false, requests: 0, review: { kind: 'idle' }, busy: false });
  useNotifications.setState({ items: [] });
});

function desktop(review: (request: unknown) => Promise<unknown>) {
  const reviews: unknown[] = [];
  (window as unknown as { electronAPI?: unknown }).electronAPI = {
    workspaceTests: { cancel: async () => undefined },
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
const DISK = 'PROGRAM Main\nEND_PROGRAM\n';
function modifiedFile(buffer: string) {
  const written: string[] = [];
  const file = {
    id: 'f1',
    name: 'main.st',
    path: 'src/main.st',
    language: 'ST',
    content: buffer,
    isModified: buffer !== DISK,
    parentPath: 'src',
    handle: {
      getFile: async () => ({ text: async () => DISK }),
      createWritable: async () => ({ write: async (t: string) => written.push(t), close: async () => undefined }),
    },
  };
  return {
    written,
    file,
    state: {
      isProjectOpen: true,
      projectSession: 7,
      workspaceScenarioLink: { workspaceId: 'w1', projectSession: 7 },
      activeFileId: 'f1',
      loadedFiles: new Map([['f1', file]]),
    },
  };
}
const reviewButton = () => dom.screen.getByRole('button', { name: dom.t('console.reviewActiveStChange') }) as HTMLButtonElement;
const sha = async (text: string) =>
  Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');

describe('the review document (SHL-004)', () => {
  it('IDE-030 the list of pending changes is reachable with no AI provider configured', () => {
    desktop(async () => ({}));
    dom.patchStore(useIDEStore, { isProjectOpen: true } as never);
    dom.render(<ReviewDocument />);
    expect(dom.screen.getByRole('heading', { name: dom.t('review.title') })).toBeTruthy();
    expect(dom.screen.getByText(dom.t('review.empty'))).toBeTruthy();
    expect(reviewButton().disabled).toBe(true);
    expect((window as unknown as { electronAPI: Record<string, unknown> }).electronAPI.aiProvider).toBeUndefined();
  });

  it('SHL-004 the review document lists pending changes and opens the review of one; a rejected change has no save button', async () => {
    const reviews = desktop(async () => ({
      schemaVersion: 1,
      accepted: false,
      evidenceScope: 'native-posix-host',
      diagnostics: [{ code: 'CHANGESET_INVALID' }],
    }));
    const buffer = 'PROGRAM Main\nVAR x : BOOL; END_VAR\nEND_PROGRAM\n';
    const ctx = modifiedFile(buffer);
    dom.patchStore(useIDEStore, ctx.state as never);
    const { user } = dom.render(<ReviewDocument />);
    expect(reviewButton().disabled).toBe(false);
    await user.click(reviewButton());
    const result = await dom.screen.findByRole('region', { name: dom.t('console.changeReviewResult') });
    expect(reviews).toEqual([{ workspaceId: 'w1', edit: { path: 'src/main.st', content: buffer } }]);
    expect(dom.within(result).getByText('CHANGESET_INVALID')).toBeTruthy();
    expect(dom.within(result).queryByRole('button', { name: dom.t('console.saveReviewedChange') })).toBeNull();
    expect(ctx.written).toEqual([]);
  });

  // The Changes tab of 2.0 asked for the project's zplc.json when no workspace was linked; the review document links the open
  // project itself, as Build, Tests and Simulate do (IDE-001), so leaving the panel took no way to review a change away (SHL-004).
  it('SHL-004 with no workspace linked yet, Review links the open project and reviews the change', async () => {
    const reviews = desktop(async () => ({
      schemaVersion: 1,
      accepted: false,
      evidenceScope: 'native-posix-host',
      diagnostics: [{ code: 'CHANGESET_INVALID' }],
    }));
    const registered: unknown[] = [];
    const api = (window as unknown as { electronAPI: { workspaceTests: Record<string, unknown> } }).electronAPI;
    api.workspaceTests.registerProjectRoot = async (request: unknown) => (registered.push(request), { workspaceId: 'w9' });
    const { chooseProjectFolder } = await import('../ipc/projectFilesHandles');
    const directoryHandle = await chooseProjectFolder({
      chooseFolder: async () => ({ ok: true, value: { rootId: 'root-1', name: 'plant' } }),
    } as never);
    const buffer = 'PROGRAM Main\nVAR x : BOOL; END_VAR\nEND_PROGRAM\n';
    const ctx = modifiedFile(buffer);
    dom.patchStore(useIDEStore, { ...ctx.state, directoryHandle, workspaceScenarioLink: null } as never);
    const { user } = dom.render(<ReviewDocument />);
    expect(reviewButton().disabled).toBe(false);
    await user.click(reviewButton());
    await dom.screen.findByRole('region', { name: dom.t('console.changeReviewResult') });
    expect(registered).toEqual([{ rootId: 'root-1' }]);
    expect(reviews).toEqual([{ workspaceId: 'w9', edit: { path: 'src/main.st', content: buffer } }]);
    expect(useIDEStore.getState().workspaceScenarioLink).toEqual({ workspaceId: 'w9', projectSession: 7 });
  });

  it('IDE-030 a change that moved since the review is stale and never saves', async () => {
    desktop(async () => ({}));
    const buffer = 'PROGRAM Main\nVAR x : BOOL; END_VAR\nEND_PROGRAM\n';
    const ctx = modifiedFile(buffer);
    dom.patchStore(useIDEStore, ctx.state as never);
    const snapshot = {
      origin: 'manual',
      projectSession: 7,
      compilerRunId: useIDEStore.getState().compilerRunId,
      workspaceId: 'w1',
      fileId: 'f1',
      path: 'src/main.st',
      editorContent: buffer,
      candidate: buffer,
      handle: ctx.file.handle,
      beforeSha256: await sha(DISK),
      afterSha256: await sha(buffer),
      baseline: DISK,
    };
    const accepted = { kind: 'accepted', diagnostics: [], artifacts: [] };
    useReviewDocument.setState({ review: { kind: 'result', snapshot, presentation: accepted } as never });
    const { user } = dom.render(<ReviewDocument />);
    // nothing is written by showing the result
    expect(ctx.written).toEqual([]);
    // the buffer changes after the review: the result is stale and offers no save
    dom.act(() => {
      ctx.file.content = `${buffer}(* more *)\n`;
      useIDEStore.setState({ loadedFiles: new Map([['f1', { ...ctx.file }]]) } as never);
    });
    expect(dom.screen.getByText(dom.t('console.theChangeIsNo'))).toBeTruthy();
    expect(dom.screen.queryByRole('button', { name: dom.t('console.saveReviewedChange') })).toBeNull();
    expect(ctx.written).toEqual([]);
    void user;
  });

  it('IDE-030 accepting and rejecting a change behave as in the Changes tab', async () => {
    desktop(async () => ({}));
    const buffer = 'PROGRAM Main\nVAR x : BOOL; END_VAR\nEND_PROGRAM\n';
    const ctx = modifiedFile(buffer);
    let saved = 0;
    dom.patchStore(useIDEStore, { ...ctx.state, saveFile: async () => ((saved += 1), true) } as never);
    const snapshot = {
      origin: 'manual',
      projectSession: 7,
      compilerRunId: useIDEStore.getState().compilerRunId,
      workspaceId: 'w1',
      fileId: 'f1',
      path: 'src/main.st',
      editorContent: buffer,
      candidate: buffer,
      handle: ctx.file.handle,
      beforeSha256: await sha(DISK),
      afterSha256: await sha(buffer),
      baseline: DISK,
    };
    useReviewDocument.setState({
      review: { kind: 'result', snapshot, presentation: { kind: 'accepted', diagnostics: [], artifacts: [] } } as never,
    });
    const { user } = dom.render(<ReviewDocument />);
    expect(saved).toBe(0);
    await user.click(dom.screen.getByRole('button', { name: dom.t('console.saveReviewedChange') }));
    await dom.waitFor(() => expect(dom.screen.getByText(dom.t('console.reviewedChangeSavedReview'))).toBeTruthy());
    expect(saved).toBe(1);
  });

  it('SHL-010 a proposed change raises one notice with a Review action and moves nothing', () => {
    const tabBefore = useIDEStore.getState().activeConsoleTab;
    const review = { kind: 'result', snapshot: { files: [] }, presentation: { kind: 'accepted', diagnostics: [], artifacts: [] } };
    dom.act(() => useReviewDocument.getState().propose(review as never));
    const { items } = useNotifications.getState();
    expect(items).toHaveLength(1);
    expect(items[0]?.recover?.label).toBe(dom.t('review.open'));
    expect(useReviewDocument.getState()).toMatchObject({ open: false, active: false });
    expect(useIDEStore.getState().activeConsoleTab).toBe(tabBefore);
    dom.act(() => items[0]!.recover!.run());
    expect(useReviewDocument.getState()).toMatchObject({ open: true, active: true });
  });

  it('SHL-004 view.changes opens the review document and makes it the active view', () => {
    resetCommandsForTest();
    const Host = () => {
      useReviewCommands();
      return null;
    };
    dom.render(<Host />);
    expect(runCommand('view.changes')).toBe('ran');
    expect(useReviewDocument.getState()).toMatchObject({ open: true, active: true });
  });
});
