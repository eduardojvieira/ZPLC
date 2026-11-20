import { describe, expect, it } from 'bun:test';
import { GROUP_LIMIT, GROUP_ORDER, filterEntries, rankGroups, type GroupedEntry } from './palette';

const entry = (group: GroupedEntry['group'], title: string, id = `${group}:${title}`): GroupedEntry => ({ id, group, title, category: '' });

describe('the palette ranks groups (FND-001)', () => {
  it('FND-001 groups come in the ranked order and a group has at most 8 rows', () => {
    const entries = [
      entry('scenes', 'Tank scene'),
      entry('lessons', 'Tank lesson'),
      entry('commands', 'Tank command'),
      entry('io', 'Tank input'),
      ...Array.from({ length: 12 }, (_, index) => entry('files', `Tank${index}.st`)),
    ];
    const ranked = rankGroups('tank', entries);
    expect(ranked.map((group) => group.group)).toEqual(['commands', 'files', 'io', 'lessons', 'scenes']);
    expect(GROUP_ORDER).toEqual(['commands', 'files', 'objects', 'io', 'editors', 'lessons', 'preferences', 'scenes']);
    const files = ranked.find((group) => group.group === 'files')!;
    expect(files.entries).toHaveLength(GROUP_LIMIT);
    expect(files.total).toBe(12);
    expect(rankGroups('tank', entries, new Set(['files'])).find((group) => group.group === 'files')!.entries).toHaveLength(12);
  });

  it('FND-001 an empty query lists commands only', () => {
    const entries = [entry('commands', 'Build'), entry('files', 'Main.st'), entry('scenes', 'scene.json')];
    const ranked = rankGroups('  ', entries);
    expect(ranked.map((group) => group.group)).toEqual(['commands']);
    expect(ranked[0]!.entries.map((row) => row.title)).toEqual(['Build']);
  });

  it('FND-001 inside a group the best match comes first', () => {
    const ranked = rankGroups('mo', [entry('files', 'xmxo.st'), entry('files', 'Motor.st')]);
    expect(ranked[0]!.entries[0]!.title).toBe('Motor.st');
  });
});

describe('the command filter (UX-015)', () => {
  it('UX-015 the command filter ranks as before', () => {
    const rows = [
      { id: 'a', title: 'Save all', category: 'File' },
      { id: 'b', title: 'Save', category: 'File' },
      { id: 'c', title: 'Build', category: 'Build' },
    ];
    expect(filterEntries('save', rows).map((row) => row.id)).toEqual(['b', 'a']);
    expect(filterEntries('', rows)).toHaveLength(3);
  });
});
