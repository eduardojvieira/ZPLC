import { describe, expect, it } from 'bun:test';
import type { AiProposal } from '../../ai/proposals';
import type { FileTreeNode } from '../../types';
import { checkProposals, runProposal, type ProposalDeps } from './editorProposals';

const ladder = JSON.stringify({ name: 'L', variables: { local: [], outputs: [] }, rungs: [{ id: 'r1', number: 1, elements: [] }] });
const fbd = JSON.stringify({
  name: 'F',
  variables: { local: [], outputs: [] },
  blocks: [{ id: 'and_1', type: 'AND', position: { x: 0, y: 0 } }],
  connections: [],
});
const sfc = JSON.stringify({
  name: 'S',
  steps: [{ id: 'S0', name: 'S0', position: { x: 0, y: 0 } }],
  transitions: [{ id: 't1', fromStep: 'S0', toStep: 'S0', condition: 'TRUE' }],
});
const disk: Record<string, string> = {
  'src/Main.st': 'PROGRAM Main\nEND_PROGRAM\n',
  'src/Lamp.ld.json': ladder,
  'src/Flow.fbd.json': fbd,
  'src/Seq.sfc.json': sfc,
};

function deps(over: Partial<ProposalDeps> = {}) {
  const log: string[] = [];
  const handle = (path: string) => ({ getFile: async () => ({ text: async () => disk[path]! }) }) as unknown as FileSystemFileHandle;
  const tree: FileTreeNode = {
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
        children: Object.keys(disk).map((path) => ({
          id: `file:${path}`,
          name: path.slice(4),
          type: 'file' as const,
          path,
          handle: handle(path),
        })),
      },
    ],
  };
  const settings: Record<string, unknown> = {
    theme: 'light',
    language: 'auto',
    density: 'comfortable',
    editorFontSize: 14,
    editorTabSize: 4,
  };
  const value: ProposalDeps = {
    isProjectOpen: true,
    deviceConnected: false,
    fileTree: tree,
    loadedFiles: new Map(),
    openFile: async (id) => void log.push(`openFile:${id}`),
    navigate: async (path, line, column) => (log.push(`navigate:${path}:${line}:${column}`), true),
    selectElement: (path, element) => void log.push(`select:${path}:${element}`),
    runCommand: (id) => (log.push(`command:${id}`), 'ran'),
    currentSetting: (name) => settings[name] as never,
    applySetting: (name, next) => {
      log.push(`set:${name}=${String(next)}`);
      settings[name] = next;
    },
    ...over,
  };
  return { value, log, settings };
}

describe('the proposals of an assistant are checked against the project and run only by a click (S6, S7)', () => {
  it('marks a proposal ready when its file, line or element exists, and says why when not', async () => {
    const { value } = deps();
    const proposals: AiProposal[] = [
      { type: 'openFile', path: 'src/Main.st' },
      { type: 'openFile', path: 'src/Gone.st' },
      { type: 'goToLine', path: 'src/Main.st', line: 2 },
      { type: 'goToLine', path: 'src/Main.st', line: 400 },
      { type: 'selectElement', path: 'src/Lamp.ld.json', element: 'rung:r1' },
      { type: 'selectElement', path: 'src/Lamp.ld.json', element: 'rung:r9' },
      { type: 'selectElement', path: 'src/Flow.fbd.json', element: 'block:and_1' },
      { type: 'selectElement', path: 'src/Seq.sfc.json', element: 'step:S0' },
      { type: 'selectElement', path: 'src/Seq.sfc.json', element: 'transition:t1' },
      { type: 'selectElement', path: 'src/Seq.sfc.json', element: 'transition:t9' },
    ];
    const checks = await checkProposals(proposals, value);
    expect(checks.map((check) => check.state)).toEqual([
      'ready',
      'missing-file',
      'ready',
      'missing-line',
      'ready',
      'missing-element',
      'ready',
      'ready',
      'ready',
      'missing-element',
    ]);
  });

  it('reads an open file from the editor and a closed one from the disk, and is not ready when no project is open', async () => {
    const { value } = deps({ loadedFiles: new Map([['file:src/Main.st', { content: 'a\nb\nc\nd' }]]) as never });
    expect((await checkProposals([{ type: 'goToLine', path: 'src/Main.st', line: 4 }], value))[0]!.state).toBe('ready');
    const closed = deps({ isProjectOpen: false });
    expect(
      (await checkProposals([{ type: 'compile' }, { type: 'openFile', path: 'src/Main.st' }], closed.value)).map((c) => c.state),
    ).toEqual(['no-project', 'no-project']);
  });

  it('shows a setting with its current value and says when it is already so', async () => {
    const { value } = deps();
    const checks = await checkProposals(
      [
        { type: 'setting', name: 'theme', value: 'dark' },
        { type: 'setting', name: 'theme', value: 'light' },
        { type: 'setting', name: 'editorFontSize', value: 18 },
      ],
      value,
    );
    expect(checks.map((check) => [check.state, check.current])).toEqual([
      ['ready', 'light'],
      ['same', 'light'],
      ['ready', 14],
    ]);
  });

  it('runs nothing when it checks, and each action runs the way the person would run it', async () => {
    const { value, log, settings } = deps();
    await checkProposals([{ type: 'compile' }, { type: 'setting', name: 'theme', value: 'dark' }], value);
    expect(log).toEqual([]);
    expect(await runProposal({ type: 'openFile', path: 'src/Main.st' }, value)).toBe('ran');
    expect(await runProposal({ type: 'goToLine', path: 'src/Main.st', line: 2 }, value)).toBe('ran');
    expect(await runProposal({ type: 'selectElement', path: 'src/Lamp.ld.json', element: 'rung:r1' }, value)).toBe('ran');
    expect(await runProposal({ type: 'compile' }, value)).toBe('ran');
    expect(await runProposal({ type: 'generateSt' }, value)).toBe('ran');
    expect(await runProposal({ type: 'startSimulation' }, value)).toBe('ran');
    expect(await runProposal({ type: 'setting', name: 'theme', value: 'dark' }, value)).toBe('ran');
    expect(await runProposal({ type: 'setting', name: 'editorTabSize', value: 2 }, value)).toBe('ran');
    expect(log).toEqual([
      'openFile:file:src/Main.st',
      'navigate:src/Main.st:2:1',
      'navigate:src/Lamp.ld.json:1:1',
      'select:src/Lamp.ld.json:rung:r1',
      'command:build.compile',
      'command:build.generateSt',
      'command:online.simulation',
      'set:theme=dark',
      'set:editorTabSize=2',
    ]);
    expect(settings.theme).toBe('dark');
  });

  it('does not run what the application does not offer now, nor select an element when the file did not open', async () => {
    const refused = deps({ runCommand: () => 'unavailable' });
    expect(await runProposal({ type: 'compile' }, refused.value)).toBe('unavailable');
    const lost = deps({ navigate: async () => false });
    expect(await runProposal({ type: 'selectElement', path: 'src/Lamp.ld.json', element: 'rung:r1' }, lost.value)).toBe('unavailable');
    expect(lost.log).toEqual([]);
    const stuck = deps({ applySetting: () => undefined });
    expect(await runProposal({ type: 'setting', name: 'density', value: 'compact' }, stuck.value)).toBe('unavailable');
  });

  it('does not offer the switch to the simulator while a device is connected, and its click does nothing (COM-030)', async () => {
    const { value, log } = deps({ deviceConnected: true });
    const [check] = await checkProposals([{ type: 'startSimulation' }], value);
    expect(check!.state).toBe('device-connected');
    expect(await runProposal({ type: 'startSimulation' }, value)).toBe('unavailable');
    expect(log).toEqual([]);
    // the other commands do not depend on the connection
    expect((await checkProposals([{ type: 'compile' }], value))[0]!.state).toBe('ready');
    const free = deps();
    expect((await checkProposals([{ type: 'startSimulation' }], free.value))[0]!.state).toBe('ready');
  });
});
