import { describe, expect, it } from 'bun:test';
import type { PaletteSnapshot } from '../palette';
import { DEFAULT_SETTINGS } from '../../utils/appSettings';
import { paletteItems } from './providers';
import { PREFERENCE_ENTRIES } from './preferences';
import { translatorFor } from '../../i18n';
import type { FileTreeNode, ZPLCProjectConfig } from '../../types';

const file = (path: string, language?: FileTreeNode['language']): FileTreeNode => ({
  id: path,
  name: path.split('/').pop()!,
  type: 'file',
  path,
  language,
});
const tree: FileTreeNode = {
  id: 'root',
  name: 'P',
  type: 'directory',
  path: '',
  children: [
    file('src/Main.st', 'ST'),
    file('zplc.json'),
    file('scene.json'),
    file('scenes/line.scene.json'),
    file('tests/a.scenario.json'),
  ],
};
const config = {
  tasks: [{ name: 'MainTask', trigger: 'cyclic', interval_ms: 10, priority: 1 }],
  io: { inputs: [{ name: 'StartPB', address: '%I0.0' }], outputs: [{ name: 'Motor', address: '%Q0.0' }] },
} as unknown as ZPLCProjectConfig;

const opened: string[] = [];
const snapshot: PaletteSnapshot = {
  fileTree: tree,
  declarations: [{ name: 'Pump', kind: 'FUNCTION_BLOCK', file: 'src/Main.st', line: 3, column: 1 }],
  globals: [{ name: 'gCount', file: 'src/Main.st', line: 1, column: 1, constant: false }],
  config,
  lessons: [{ id: 'seal-in-ladder', title: 'Seal-in in Ladder' }],
  t: translatorFor('en').t,
  open: {
    source: (path, line, column) => opened.push(`source:${path}:${line}:${column}`),
    editor: (kind) => opened.push(`editor:${kind}`),
    lesson: (id) => opened.push(`lesson:${id}`),
    preference: (key) => opened.push(`preference:${key}`),
    scenes: () => opened.push('scenes'),
  },
};

describe('the providers of the palette (FND-001)', () => {
  it('FND-001 a provider lists files, objects, I/O points, editors, lessons, preferences and scenes of a fixture project', () => {
    const items = paletteItems(snapshot);
    const titles = (group: string) => items.filter((item) => item.group === group).map((item) => item.title);
    expect(titles('files')).toContain('Main.st');
    expect(titles('objects')).toEqual(expect.arrayContaining(['Pump', 'gCount', 'MainTask']));
    expect(titles('io')).toEqual(['StartPB', 'Motor']);
    expect(titles('editors')).toHaveLength(5);
    expect(titles('lessons')).toEqual(['Seal-in in Ladder']);
    expect(titles('preferences').length).toBe(PREFERENCE_ENTRIES.length);
    expect(titles('scenes')).toEqual(['scene.json', 'line.scene.json']);
    expect(titles('files')).not.toContain('scene.json');
    const run = (group: string, title: string) => items.find((item) => item.group === group && item.title === title)!.run();
    run('objects', 'Pump');
    run('io', 'StartPB');
    run('lessons', 'Seal-in in Ladder');
    run('preferences', PREFERENCE_ENTRIES[0]!.titleKey && snapshot.t(PREFERENCE_ENTRIES[0]!.titleKey));
    expect(opened).toEqual(['source:src/Main.st:3:1', 'editor:io', 'lesson:seal-in-ladder', `preference:${PREFERENCE_ENTRIES[0]!.key}`]);
  });

  it('FND-001 every preference field of the settings has a palette entry', () => {
    expect(PREFERENCE_ENTRIES.map((entry) => entry.key as string).sort()).toEqual(Object.keys(DEFAULT_SETTINGS).sort());
  });

  it('FND-001 the scene provider lists by path, from the tree alone', () => {
    const scenes = paletteItems(snapshot).filter((item) => item.group === 'scenes');
    expect(scenes.map((item) => item.detail)).toEqual(['scene.json', 'scenes/line.scene.json']);
    expect(paletteItems({ ...snapshot, fileTree: null }).filter((item) => item.group === 'scenes')).toEqual([]);
  });
});
