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

/** The assistant: a provider that answers `reply`, and a saved project with Main.st open and unmodified (the disk is `written`). */
function assistant(reply: unknown, review: (request: unknown) => Promise<unknown>) {
  const reviews = desktop(review);
  const requests: unknown[] = [];
  const written: string[] = [];
  const main = 'PROGRAM Main\nEND_PROGRAM\n';
  (window as unknown as { electronAPI: Record<string, unknown> }).electronAPI.aiProvider = {
    getStatus: async () => ({ configured: true, enabled: true, keyStored: true, vaultAvailable: true }),
    getConfig: async () => ({ enabled: true, endpoint: 'https://api.example.test', model: 'gpt-test' }),
    request: async (request: unknown) => {
      requests.push(request);
      return typeof reply === 'function' ? (reply as (request: unknown) => unknown)(request) : reply;
    },
    cancel: async () => ({ requested: false }),
  };
  const handle = {
    getFile: async () => ({ text: async () => main }),
    createWritable: async () => ({
      write: async (text: string) => written.push(text),
      close: async () => undefined,
    }),
  };
  const file = {
    id: 'file:src/Main.st',
    name: 'Main.st',
    path: 'src/Main.st',
    language: 'ST',
    content: main,
    isModified: false,
    parentPath: 'src',
    handle,
  };
  const tree = {
    id: 'dir:/',
    name: 'p',
    type: 'directory',
    path: '',
    children: [
      {
        id: 'dir:src',
        name: 'src',
        type: 'directory',
        path: 'src',
        children: [{ id: file.id, name: 'Main.st', type: 'file', path: file.path, handle }],
      },
    ],
  };
  return {
    reviews,
    requests,
    written,
    state: {
      projectSession: 7,
      workspaceScenarioLink: { workspaceId: 'w1', projectSession: 7 },
      activeFileId: file.id,
      loadedFiles: new Map([[file.id, file]]),
      fileTree: tree,
    },
    sha: async (text: string) => {
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
      return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
    },
    main,
  };
}

describe('the assistant proposes a change set that a person reviews and saves (IDE-030, S5)', () => {
  const ready = async (user: ReturnType<typeof dom.render>['user']) => {
    await user.click(panel().getByRole('button', { name: dom.t('console.refreshStatus') }));
    await dom.waitFor(() => expect(panel().getByText(/Provider enabled/i)).toBeTruthy());
  };
  const ask = async (user: ReturnType<typeof dom.render>['user']) => {
    await ready(user);
    await user.click(dom.screen.getByRole('radio', { name: 'edit' }));
    await user.type(panel().getByRole('textbox', { name: dom.t('console.request') }), 'Add a lamp');
    await dom.waitFor(() =>
      expect((panel().getByRole('button', { name: dom.t('console.sendRequest') }) as HTMLButtonElement).disabled).toBe(false),
    );
    await user.click(panel().getByRole('button', { name: dom.t('console.sendRequest') }));
  };

  it('lists the files of the proposal, reviews them together, and writes and changes nothing until the person saves', async () => {
    const ctx = assistant(
      async () => ({
        ok: true,
        answer: 'Added a lamp',
        workspaceId: 'w1',
        fileId: 'file:src/Main.st',
        path: 'src/Main.st',
        baselineSha256: await ctx.sha(ctx.main),
        changes: [
          { path: 'src/Main.st', kind: 'modify', content: `${ctx.main}(* lamp *)\n`, baselineSha256: await ctx.sha(ctx.main) },
          { path: 'src/Lamp.st', kind: 'create', content: 'PROGRAM Lamp\nEND_PROGRAM\n' },
        ],
      }),
      async (request) => {
        const { edits } = request as { edits: Array<{ path: string; content: string }> };
        const sha = 'f'.repeat(64);
        const digest = async (text: string) => ctx.sha(text);
        return {
          schemaVersion: 1,
          accepted: true,
          evidenceScope: 'native-posix-host',
          changeSet: {
            sha256: sha,
            changes: await Promise.all(
              edits.map(async (edit) => ({
                path: edit.path,
                ...(edit.path === 'src/Main.st'
                  ? { kind: 'modify', before: { sha256: await digest(ctx.main), byteLength: ctx.main.length } }
                  : { kind: 'create' }),
                after: { sha256: await digest(edit.content), byteLength: edit.content.length },
              })),
            ),
          },
          evidence: {
            schemaVersion: 1,
            operation: 'test',
            outcome: 'passed',
            diagnostics: [],
            artifacts: [
              { kind: 'zplc', sha256: sha, byteLength: 4 },
              { kind: 'trace', sha256: sha, byteLength: 4 },
            ],
          },
          savedTestInputIdentity: { schemaVersion: 1, sha256: sha, fileCount: 3 },
        };
      },
    );
    open('agent', ctx.state);
    const { user } = dom.render(<Console />);
    await ask(user);
    const files = await dom.screen.findByRole('list', { name: dom.t('console.proposedFiles') });
    expect(
      dom
        .within(files)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual([`src/Main.st · ${dom.t('console.changedFile')}`, `src/Lamp.st · ${dom.t('console.newFile')}`]);
    // the program that is open goes with the request, in edit mode as in the others
    expect(ctx.requests[0]).toMatchObject({ mode: 'edit', activeFile: { fileId: 'file:src/Main.st', path: 'src/Main.st' } });

    await user.click(panel().getByRole('button', { name: dom.t('console.reviewProposedChange') }));
    await dom.waitFor(() => expect(ctx.reviews).toHaveLength(1));
    expect(ctx.reviews[0]).toEqual({
      workspaceId: 'w1',
      edits: [
        { path: 'src/Main.st', content: `${ctx.main}(* lamp *)\n` },
        { path: 'src/Lamp.st', content: 'PROGRAM Lamp\nEND_PROGRAM\n' },
      ],
    });
    // the review is a result in the Changes tab: a difference per file, and no write happened
    await user.click(dom.screen.getByRole('tab', { name: new RegExp(dom.t('console.tab.changes')) }));
    const result = await dom.screen.findByRole('region', { name: dom.t('console.changeReviewResult') });
    expect(dom.within(result).getByRole('heading', { name: tn('console.reviewChangeSet', 2) })).toBeTruthy();
    expect(dom.within(result).getByText('src/Lamp.st')).toBeTruthy();
    expect(dom.within(result).getByText(dom.t('console.newFile'))).toBeTruthy();
    expect(dom.within(result).getByRole('button', { name: dom.t('console.saveReviewedChange') })).toBeTruthy();
    expect(ctx.written).toEqual([]);
    expect(useIDEStore.getState().loadedFiles.get('file:src/Main.st')!.isModified).toBe(false);
    expect(useIDEStore.getState().loadedFiles.get('file:src/Main.st')!.content).toBe(ctx.main);
  });

  it('shows a proposed ladder that does not load as a refusal with its violations, and offers no review', async () => {
    const ctx = assistant(
      async () => ({
        ok: true,
        answer: 'A ladder',
        workspaceId: 'w1',
        fileId: 'file:src/Main.st',
        path: 'src/Main.st',
        baselineSha256: await ctx.sha(ctx.main),
        changes: [{ path: 'src/Seal.ld.json', kind: 'create', content: '{ nope' }],
      }),
      async () => ({}),
    );
    open('agent', ctx.state);
    const { user } = dom.render(<Console />);
    await ask(user);
    const alert = await dom.screen.findByRole('alert');
    expect(alert.textContent).toContain(dom.t('console.proposalRefusedInvalid', { path: 'src/Seal.ld.json' }));
    expect(alert.textContent).toContain('not valid JSON');
    expect(panel().queryByRole('button', { name: dom.t('console.reviewProposedChange') })).toBeNull();
    expect(ctx.reviews).toHaveLength(0);
  });

  it('offers editor actions and settings as buttons that run only when clicked, and not a proposal the project cannot honour', async () => {
    const { bindCommands, publishCommandState, resetCommandsForTest } = await import('../commands/bus');
    const { useAppSettings } = await import('../store/useAppSettings');
    resetCommandsForTest();
    publishCommandState({ projectOpen: true });
    const ran: string[] = [];
    bindCommands({ 'build.compile': () => void ran.push('build.compile') });
    restores.push(resetCommandsForTest);
    const ctx = assistant(
      {
        ok: true,
        answer: 'Try this',
        proposals: [
          { type: 'compile' },
          { type: 'setting', name: 'theme', value: 'dark' },
          { type: 'setting', name: 'editorFontSize', value: 20 },
          { type: 'openFile', path: 'src/Gone.st' },
        ],
      },
      async () => ({}),
    );
    dom.patchStore(useIDEStore, { theme: 'light' } as never);
    open('agent', ctx.state);
    const { user } = dom.render(<Console />);
    await ready(user);
    await user.type(panel().getByRole('textbox', { name: dom.t('console.request') }), 'Help me');
    await dom.waitFor(() =>
      expect((panel().getByRole('button', { name: dom.t('console.sendRequest') }) as HTMLButtonElement).disabled).toBe(false),
    );
    await user.click(panel().getByRole('button', { name: dom.t('console.sendRequest') }));
    const actions = await dom.screen.findByRole('region', { name: dom.t('console.proposedActions') });
    // nothing has run yet
    expect(ran).toEqual([]);
    expect(useIDEStore.getState().theme).toBe('light');
    const missing = dom
      .within(actions)
      .getByRole('button', { name: dom.t('console.proposalOpenFile', { path: 'src/Gone.st' }) }) as HTMLButtonElement;
    expect(missing.disabled).toBe(true);
    expect(dom.within(actions).getByText(dom.t('console.proposalWhyFile'))).toBeTruthy();
    await user.click(dom.within(actions).getByRole('button', { name: dom.t('console.proposalCompile') }));
    await dom.waitFor(() => expect(ran).toEqual(['build.compile']));
    await user.click(
      dom
        .within(actions)
        .getByRole('button', { name: dom.t('console.proposalSetting', { setting: dom.t('console.settingTheme'), value: 'dark' }) }),
    );
    await dom.waitFor(() => expect(useIDEStore.getState().theme).toBe('dark'));
    await user.click(
      dom
        .within(actions)
        .getByRole('button', { name: dom.t('console.proposalSetting', { setting: dom.t('console.settingFontSize'), value: '20' }) }),
    );
    await dom.waitFor(() => expect(useAppSettings.getState().settings.editorFontSize).toBe(20));
    // the settings that stay out of its reach did not move
    expect(useAppSettings.getState().settings).toMatchObject({
      autosaveSeconds: 0,
      checkForUpdates: false,
      unlockAllLessons: false,
      hideSolutions: false,
    });
  });

  it('shows an answer that proposes something physical as not trusted, with no button', async () => {
    const ctx = assistant({ ok: true, answer: 'Deploy it', proposals: [{ type: 'deploy' }] }, async () => ({}));
    open('agent', ctx.state);
    const { user } = dom.render(<Console />);
    await ready(user);
    await user.type(panel().getByRole('textbox', { name: dom.t('console.request') }), 'Deploy');
    await dom.waitFor(() =>
      expect((panel().getByRole('button', { name: dom.t('console.sendRequest') }) as HTMLButtonElement).disabled).toBe(false),
    );
    await user.click(panel().getByRole('button', { name: dom.t('console.sendRequest') }));
    await dom.screen.findByText(dom.t('console.providerResponseCouldNot'));
    expect(dom.screen.queryByRole('region', { name: dom.t('console.proposedActions') })).toBeNull();
  });

  it('sends the open program with a plain question as well, in any language', async () => {
    const ctx = assistant({ ok: true, answer: 'It latches.' }, async () => ({}));
    open('agent', ctx.state);
    const { user } = dom.render(<Console />);
    await ready(user);
    await user.type(panel().getByRole('textbox', { name: dom.t('console.request') }), 'What does it do?');
    await dom.waitFor(() =>
      expect((panel().getByRole('button', { name: dom.t('console.sendRequest') }) as HTMLButtonElement).disabled).toBe(false),
    );
    await user.click(panel().getByRole('button', { name: dom.t('console.sendRequest') }));
    await dom.screen.findByText('It latches.');
    expect(ctx.requests[0]).toEqual({
      workspaceId: 'w1',
      mode: 'ask',
      prompt: 'What does it do?',
      activeFile: { fileId: 'file:src/Main.st', path: 'src/Main.st' },
    });
  });
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
