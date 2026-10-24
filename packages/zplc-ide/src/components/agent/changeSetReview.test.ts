import { describe, expect, it } from 'bun:test';
import { canonicalManifest } from '../../ai/changeSetPrepare';
import type { FileTreeNode, ZPLCProjectConfig } from '../../types';
import { sha256Text } from '../candidateSources';
import { changeSetIsCurrent, reviewChangeSet, saveChangeSet, type ChangeSetStore } from './changeSetReview';

const config = {
  schemaVersion: 2,
  name: 'Plant',
  version: '1.0.0',
  tasks: [{ name: 'Main', trigger: 'cyclic', interval_ms: 10, priority: 1, programs: ['Main.st'] }],
} as unknown as ZPLCProjectConfig;
const MAIN = 'PROGRAM Main\nEND_PROGRAM\n';
const WORKSPACE = 'workspace-1';

/** A project folder in memory: the disk, the tree and the store actions that act on it like the real ones. */
function project(options: { open?: string[] } = {}) {
  const disk = new Map<string, string>([
    ['src/Main.st', MAIN],
    ['src/Flow.il', 'LD 1\n'],
    ['zplc.json', JSON.stringify(config, null, 2)],
  ]);
  const handleOf = (path: string) =>
    ({
      getFile: async () => ({ text: async () => disk.get(path) ?? '' }),
      createWritable: async () => ({
        write: async (text: string) => disk.set(path, text),
        close: async () => undefined,
      }),
    }) as unknown as FileSystemFileHandle;
  const handles = new Map<string, FileSystemFileHandle>();
  const handle = (path: string) => (handles.has(path) ? handles.get(path)! : (handles.set(path, handleOf(path)), handles.get(path)!));
  const tree = (): FileTreeNode => ({
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
        children: [...disk.keys()]
          .filter((path) => path.startsWith('src/'))
          .map((path) => ({ id: `file:${path}`, name: path.slice(4), type: 'file' as const, path, handle: handle(path) })),
      },
    ],
  });
  const calls: string[] = [];
  const loaded = new Map<string, { content: string; isModified: boolean; handle?: FileSystemFileHandle }>();
  for (const path of options.open ?? []) loaded.set(`file:${path}`, { content: disk.get(path)!, isModified: false, handle: handle(path) });
  const state = {
    projectSession: 1,
    compilerRunId: 1,
    isProjectOpen: true,
    workspaceScenarioLink: { workspaceId: WORKSPACE, projectSession: 1 },
    loadedFiles: loaded,
    get fileTree() {
      return tree();
    },
    directoryHandle: { getFileHandle: async (name: string) => handle(name) } as unknown as FileSystemDirectoryHandle,
    projectConfig: config as ZPLCProjectConfig | null,
    projectConfigDirty: false,
    failSave: false,
    async createFile(name: string) {
      calls.push(`createFile:${name}`);
      const path = `src/${name}${/\.il$/.test(name) ? '' : '.st'}`;
      disk.set(path, '');
      loaded.set(`file:${path}`, { content: '', isModified: false, handle: handle(path) });
      state.compilerRunId += 1;
      return `file:${path}`;
    },
    updateFileContent(fileId: string, content: string) {
      calls.push(`updateFileContent:${fileId}`);
      loaded.set(fileId, { ...loaded.get(fileId)!, content, isModified: true });
    },
    async saveFile(fileId: string) {
      calls.push(`saveFile:${fileId}`);
      if (state.failSave) return false;
      const file = loaded.get(fileId)!;
      disk.set(fileId.slice('file:'.length), file.content);
      loaded.set(fileId, { ...file, isModified: false });
      return true;
    },
    updateProjectConfig(updates: Partial<ZPLCProjectConfig>) {
      calls.push('updateProjectConfig');
      state.projectConfig = { ...state.projectConfig!, ...updates };
      state.projectConfigDirty = true;
      state.compilerRunId += 1;
    },
    async saveProjectConfig() {
      calls.push('saveProjectConfig');
      const written = canonicalManifest(state.projectConfig);
      if ('content' in written) disk.set('zplc.json', written.content);
      state.projectConfigDirty = false;
    },
  };
  return { disk, state: state as unknown as ChangeSetStore & { failSave: boolean }, calls, handle };
}

/** The host: a run that passes for exactly the edits it was given, as sanitizeCandidateChangeSetReview reduces it. */
function host(disk: Map<string, string>) {
  const asked: Array<{ path: string; content: string }[]> = [];
  return {
    asked,
    bridge: {
      review: async ({ edits }: { edits: Array<{ path: string; content: string }> }) => {
        asked.push(edits);
        const changes = await Promise.all(
          edits.map(async ({ path, content }) => ({
            path,
            ...(disk.has(path)
              ? { kind: 'modify', before: { sha256: await sha256Text(disk.get(path)!), byteLength: disk.get(path)!.length } }
              : { kind: 'create' }),
            after: { sha256: await sha256Text(content), byteLength: content.length },
          })),
        );
        const sha = 'f'.repeat(64);
        return {
          schemaVersion: 1,
          accepted: true,
          evidenceScope: 'native-posix-host',
          changeSet: { sha256: sha, changes },
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
    },
  };
}

const sha = (text: string) => sha256Text(text);
async function proposal(disk: Map<string, string>) {
  const manifest = canonicalManifest({
    ...config,
    tasks: [
      ...(config as unknown as { tasks: unknown[] }).tasks,
      { name: 'Flow', trigger: 'cyclic', interval_ms: 10, priority: 2, programs: ['Lamp.st'] },
    ],
  }) as { content: string };
  return [
    {
      path: 'src/Main.st',
      kind: 'modify' as const,
      content: `${MAIN}(* changed *)\n`,
      baselineSha256: await sha(disk.get('src/Main.st')!),
    },
    { path: 'src/Lamp.st', kind: 'create' as const, content: 'PROGRAM Lamp\nEND_PROGRAM\n' },
    { path: 'zplc.json', kind: 'modify' as const, content: manifest.content, baselineSha256: await sha(disk.get('zplc.json')!) },
  ];
}

describe('the review and the save of an assistant change set (S5, IDE-030)', () => {
  it('reviews every file of the set in one host run and writes nothing, nothing reaches the editor, nothing is saved', async () => {
    const p = project({ open: ['src/Main.st'] });
    const before = new Map(p.disk);
    const { bridge, asked } = host(p.disk);
    const outcome = await reviewChangeSet(await proposal(p.disk), { workspaceId: WORKSPACE, bridge, getState: () => p.state });
    expect(outcome.kind).toBe('result');
    if (outcome.kind !== 'result') return;
    expect(outcome.presentation.kind).toBe('accepted');
    expect(asked).toHaveLength(1);
    expect(asked[0]!.map((edit) => edit.path)).toEqual(['src/Main.st', 'src/Lamp.st', 'zplc.json']);
    expect(outcome.snapshot.files.map(({ path, kind }) => [path, kind])).toEqual([
      ['src/Main.st', 'modify'],
      ['src/Lamp.st', 'create'],
      ['zplc.json', 'modify'],
    ]);
    expect(outcome.snapshot.files[0]!.baseline).toBe(MAIN);
    expect(outcome.snapshot.files[1]!.baseline).toBe('');
    // the person has not clicked: the disk, the editor and the settings are as they were, and autosave has nothing to save
    expect(p.disk).toEqual(before);
    expect(p.calls).toEqual([]);
    expect([...p.state.loadedFiles.values()].some((file) => file.isModified)).toBe(false);
    expect(p.state.projectConfigDirty).toBe(false);
  });

  it('saves the reviewed set when the person clicks: the new program, the replaced ones and the settings, byte for byte', async () => {
    const p = project({ open: ['src/Main.st'] });
    const { bridge } = host(p.disk);
    const changes = await proposal(p.disk);
    const outcome = await reviewChangeSet(changes, { workspaceId: WORKSPACE, bridge, getState: () => p.state });
    if (outcome.kind !== 'result') throw new Error('no review');
    expect(await saveChangeSet(outcome.snapshot, () => p.state)).toBe('saved');
    expect(p.disk.get('src/Main.st')).toBe(changes[0]!.content);
    expect(p.disk.get('src/Lamp.st')).toBe(changes[1]!.content);
    expect(p.disk.get('zplc.json')).toBe(outcome.snapshot.files[2]!.candidate);
    expect(JSON.parse(p.disk.get('zplc.json')!).tasks).toHaveLength(2);
    // the new program exists before the task that names it is saved
    expect(p.calls.indexOf('createFile:Lamp')).toBeLessThan(p.calls.indexOf('saveProjectConfig'));
  });

  it('writes a replaced program that is not open straight to its file, and the manifest is saved as it was reviewed', async () => {
    const p = project();
    const { bridge } = host(p.disk);
    const outcome = await reviewChangeSet([(await proposal(p.disk))[0]!], { workspaceId: WORKSPACE, bridge, getState: () => p.state });
    if (outcome.kind !== 'result') throw new Error('no review');
    expect(await saveChangeSet(outcome.snapshot, () => p.state)).toBe('saved');
    expect(p.disk.get('src/Main.st')).toContain('(* changed *)');
    expect(p.calls).toEqual([]);
  });

  it('does not review over unsaved work of the person, and says which file it is', async () => {
    const p = project({ open: ['src/Main.st'] });
    p.state.loadedFiles.set('file:src/Main.st', { ...p.state.loadedFiles.get('file:src/Main.st')!, isModified: true });
    const { bridge, asked } = host(p.disk);
    expect(await reviewChangeSet(await proposal(p.disk), { workspaceId: WORKSPACE, bridge, getState: () => p.state })).toEqual({
      kind: 'unsaved',
      path: 'src/Main.st',
    });
    const q = project();
    q.state.projectConfigDirty = true;
    expect(await reviewChangeSet(await proposal(q.disk), { workspaceId: WORKSPACE, bridge, getState: () => q.state })).toEqual({
      kind: 'unsaved',
      path: 'zplc.json',
    });
    expect(asked).toHaveLength(0);
  });

  it('is stale, and asks the host nothing, when a file moved since the answer, or a new name is taken', async () => {
    const { bridge, asked } = host(new Map());
    const moved = project();
    const changes = await proposal(moved.disk);
    moved.disk.set('src/Main.st', `${MAIN}(* someone else *)\n`);
    expect((await reviewChangeSet(changes, { workspaceId: WORKSPACE, bridge, getState: () => moved.state })).kind).toBe('stale');
    const taken = project();
    const withTaken = await proposal(taken.disk);
    taken.disk.set('src/Lamp.st', 'PROGRAM Other\nEND_PROGRAM\n');
    expect((await reviewChangeSet(withTaken, { workspaceId: WORKSPACE, bridge, getState: () => taken.state })).kind).toBe('stale');
    const other = project();
    other.state.workspaceScenarioLink = { workspaceId: 'workspace-2', projectSession: 1 };
    expect((await reviewChangeSet(await proposal(other.disk), { workspaceId: WORKSPACE, bridge, getState: () => other.state })).kind).toBe(
      'stale',
    );
    expect(asked).toHaveLength(0);
  });

  it('reports a proposal that changes nothing, once normalized, as no change', async () => {
    const p = project();
    const { bridge, asked } = host(p.disk);
    const same = [
      { path: 'src/Main.st', kind: 'modify' as const, content: MAIN, baselineSha256: await sha(MAIN) },
      {
        path: 'zplc.json',
        kind: 'modify' as const,
        content: p.disk.get('zplc.json')!,
        baselineSha256: await sha(p.disk.get('zplc.json')!),
      },
    ];
    expect(await reviewChangeSet(same, { workspaceId: WORKSPACE, bridge, getState: () => p.state })).toEqual({ kind: 'no-change' });
    expect(asked).toHaveLength(0);
  });

  it('refuses to save when the disk or the editor moved after the review, and writes nothing then', async () => {
    const p = project({ open: ['src/Main.st'] });
    const { bridge } = host(p.disk);
    const outcome = await reviewChangeSet(await proposal(p.disk), { workspaceId: WORKSPACE, bridge, getState: () => p.state });
    if (outcome.kind !== 'result') throw new Error('no review');
    const before = new Map(p.disk);
    p.disk.set('zplc.json', '{"changed":"elsewhere"}');
    before.set('zplc.json', '{"changed":"elsewhere"}');
    expect(await saveChangeSet(outcome.snapshot, () => p.state)).toBe('stale');
    expect(p.disk).toEqual(before);
    expect(p.calls).toEqual([]);
    const q = project({ open: ['src/Main.st'] });
    const second = await reviewChangeSet(await proposal(q.disk), {
      workspaceId: WORKSPACE,
      bridge: host(q.disk).bridge,
      getState: () => q.state,
    });
    if (second.kind !== 'result') throw new Error('no review');
    q.state.compilerRunId += 1;
    expect(changeSetIsCurrent(second.snapshot, q.state)).toBe(false);
    expect(await saveChangeSet(second.snapshot, () => q.state)).toBe('stale');
    expect(q.calls).toEqual([]);
  });

  it('reports an error when a file cannot be saved, and does not go on to the settings that name it', async () => {
    const p = project({ open: ['src/Main.st'] });
    const { bridge } = host(p.disk);
    const outcome = await reviewChangeSet(await proposal(p.disk), { workspaceId: WORKSPACE, bridge, getState: () => p.state });
    if (outcome.kind !== 'result') throw new Error('no review');
    p.state.failSave = true;
    expect(await saveChangeSet(outcome.snapshot, () => p.state)).toBe('error');
    expect(p.calls).not.toContain('saveProjectConfig');
  });

  it('shows a review the host refused, and reports an error when the bridge fails', async () => {
    const p = project();
    const refused = await reviewChangeSet(await proposal(p.disk), {
      workspaceId: WORKSPACE,
      bridge: {
        review: async () => ({
          schemaVersion: 1,
          accepted: false,
          evidenceScope: 'native-posix-host',
          diagnostics: [{ code: 'CHANGESET_INVALID' }],
        }),
      },
      getState: () => p.state,
    });
    expect(refused).toMatchObject({ kind: 'result', presentation: { kind: 'rejected', diagnostics: [{ code: 'CHANGESET_INVALID' }] } });
    expect(
      await reviewChangeSet(await proposal(p.disk), {
        workspaceId: WORKSPACE,
        bridge: {
          review: async () => {
            throw new Error('boom');
          },
        },
        getState: () => p.state,
      }),
    ).toEqual({ kind: 'error' });
  });
});
