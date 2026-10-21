import { describe, expect, it } from 'bun:test';
import { declarationsOf } from '../project/projectDeclarations';
import { globalVariablesOf } from '../project/globalVariables';
import type { FileTreeNode, ZPLCProjectConfig } from '../types';
import { NAVIGATOR_GROUP_IDS, buildNavigatorGroups, type NavigatorWords } from './navigatorGroups';

const words: NavigatorWords = {
  kind: { STRUCT: 'Structure', ENUM: 'Enumeration', TYPE: 'Type alias', INTERFACE: 'Interface' },
  constant: 'Constant',
  noTasks: 'Add a task',
  task: ({ trigger, intervalMs, priority }) => `${trigger} ${intervalMs ?? '-'} ${priority}`,
  inputs: (count) => `Inputs (${count})`,
  outputs: (count) => `Outputs (${count})`,
  tags: (count) => `Tags (${count})`,
  target: 'Target',
  network: 'Network',
  on: 'On',
  off: 'Off',
};

const ONE_FILE = `TYPE Point : STRUCT
  x : INT;
END_STRUCT
END_TYPE
VAR_GLOBAL
  Shared : INT;
END_VAR
FUNCTION_BLOCK Counter
VAR_INPUT go : BOOL; END_VAR
END_FUNCTION_BLOCK
FUNCTION Double : INT
VAR_INPUT x : INT; END_VAR
  Double := x * 2;
END_FUNCTION
PROGRAM Main
VAR n : INT; END_VAR
  n := 1;
END_PROGRAM
`;

const file = (name: string, language: FileTreeNode['language']): FileTreeNode => ({
  id: name,
  name,
  type: 'file',
  path: `src/${name}`,
  language,
});
const tree: FileTreeNode = {
  id: 'root',
  name: 'P',
  type: 'directory',
  path: '',
  children: [
    {
      id: 'src',
      name: 'src',
      type: 'directory',
      path: 'src',
      children: [file('Mixed.st', 'ST'), file('Blinky.fbd.json', 'FBD'), file('Ladder.ld.json', 'LD')],
    },
  ],
};
const config = {
  name: 'P',
  version: '1',
  target: { board: 'rpi_pico' },
  network: { hostname: 'plc-1' },
  tasks: [{ name: 'Fast', trigger: 'cyclic', interval_ms: 10, priority: 1, programs: ['Main'] }],
  io: { inputs: [{ pin: 1 }, { pin: 2 }], outputs: [{ pin: 3 }] },
  communication: { modbus: { enabled: true }, mqtt: { enabled: false }, tags: [{}, {}, {}] },
} as unknown as ZPLCProjectConfig;

const input = {
  declarations: [{ file: 'src/Mixed.st', declarations: declarationsOf('src/Mixed.st', ONE_FILE) }],
  globals: globalVariablesOf('src/Mixed.st', ONE_FILE),
  fileTree: tree,
  config,
};

describe('project navigator by PLC objects (UX-012)', () => {
  it('UX-012 returns the nine groups in the required order, even when a group is empty', () => {
    const groups = buildNavigatorGroups({ declarations: [], globals: [], fileTree: null, config: null }, words);
    expect(groups.map((group) => group.id)).toEqual([...NAVIGATOR_GROUP_IDS]);
    expect(groups.map((group) => group.id)).toEqual([
      'programs',
      'functionBlocks',
      'functions',
      'dataTypes',
      'globals',
      'tasks',
      'io',
      'communication',
      'device',
    ]);
    expect(groups.find((group) => group.id === 'programs')!.items).toEqual([]);
  });

  it('UX-012 lists a file with several objects under each kind it declares, each opening that file at its line', () => {
    const groups = new Map(buildNavigatorGroups(input, words).map((group) => [group.id, group.items]));
    const names = (id: string): string[] => (groups.get(id as never) ?? []).map((item) => item.label);
    expect(names('programs')).toContain('Main');
    expect(names('functionBlocks')).toEqual(['Counter']);
    expect(names('functions')).toEqual(['Double']);
    expect(names('dataTypes')).toEqual(['Point']);
    expect(names('globals')).toEqual(['Shared']);
    const counter = groups.get('functionBlocks')![0]!;
    expect(counter.target).toMatchObject({ kind: 'source', path: 'src/Mixed.st' });
    expect((counter.target as { line: number }).line).toBeGreaterThan(5);
    expect(groups.get('dataTypes')![0]!.detail).toBe('Structure · src/Mixed.st');
  });

  it('UX-012 lists a diagram as a program named after its file', () => {
    const programs = buildNavigatorGroups(input, words)
      .find((group) => group.id === 'programs')!
      .items.map((item) => item.label);
    expect(programs).toEqual(['Blinky', 'Ladder', 'Main']);
  });

  it('UX-012 lists tasks, I/O mapping, communication and device from zplc.json, each opening its configuration editor', () => {
    const groups = new Map(buildNavigatorGroups(input, words).map((group) => [group.id, group.items]));
    expect(groups.get('tasks')!.map((item) => [item.label, item.detail])).toEqual([['Fast', 'cyclic 10 1']]);
    expect(groups.get('io')!.map((item) => item.label)).toEqual(['Inputs (2)', 'Outputs (1)']);
    expect(groups.get('communication')!.map((item) => [item.label, item.detail])).toEqual([
      ['Modbus', 'On'],
      ['MQTT', 'Off'],
      ['Tags (3)', undefined],
    ]);
    expect(groups.get('device')!.map((item) => [item.label, item.detail])).toEqual([
      ['Target', 'rpi_pico'],
      ['Network', 'plc-1'],
    ]);
    const editors = [...groups.get('tasks')!, ...groups.get('io')!, ...groups.get('communication')!, ...groups.get('device')!].map(
      (item) => (item.target as { editor: string }).editor,
    );
    expect(new Set(editors)).toEqual(new Set(['tasks', 'io', 'communication', 'target', 'network']));
  });

  it('UX-012 offers to add a task when the project has none', () => {
    const tasks = buildNavigatorGroups({ ...input, config: { ...config, tasks: [] } }, words).find((group) => group.id === 'tasks')!.items;
    expect(tasks).toEqual([{ key: 'task:none', label: 'Add a task', target: { kind: 'config', editor: 'tasks' } }]);
  });
});
