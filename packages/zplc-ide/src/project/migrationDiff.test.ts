/**
 * The difference a version 1 project shows before it is migrated (IDE-022): the text of zplc.json as it is on disk
 * against the text Save would write, line by line, so that nothing is applied that was not seen.
 */
import { describe, expect, it } from 'bun:test';

import { parseAndMigrateProject } from './projectModel';
import { changedHunks, describeMigration, diffLines } from './migrationDiff';

const kinds = (lines: ReturnType<typeof diffLines>) => lines.map((line) => `${line.kind === 'same' ? ' ' : line.kind === 'added' ? '+' : '-'}${line.text}`);

describe('diffLines', () => {
  it('marks what a line-by-line comparison removes and adds, and keeps what both texts hold', () => {
    expect(kinds(diffLines('a\nb\nc', 'a\nB\nc'))).toEqual([' a', '-b', '+B', ' c']);
    expect(kinds(diffLines('a\nc', 'a\nb\nc'))).toEqual([' a', '+b', ' c']);
    expect(kinds(diffLines('a\nb\nc', 'a\nc'))).toEqual([' a', '-b', ' c']);
    expect(kinds(diffLines('same', 'same'))).toEqual([' same']);
  });

  it('keeps the order of lines that move out of place as a removal and an addition', () => {
    expect(kinds(diffLines('1\n2\n3\n4', '4\n1\n2\n3'))).toEqual(['+4', ' 1', ' 2', ' 3', '-4']);
  });

  it('treats a different line ending as the same line, and a missing final newline as no change of content', () => {
    expect(kinds(diffLines('a\r\nb\r\n', 'a\nb'))).toEqual([' a', ' b']);
  });

  it('degrades to all removed then all added for texts too different to compare cheaply, never to a wrong answer', () => {
    const before = Array.from({ length: 3000 }, (_, index) => `old ${index}`).join('\n');
    const after = Array.from({ length: 3000 }, (_, index) => `new ${index}`).join('\n');
    const lines = diffLines(before, after);
    expect(lines.filter((line) => line.kind === 'removed')).toHaveLength(3000);
    expect(lines.filter((line) => line.kind === 'added')).toHaveLength(3000);
    expect(lines.some((line) => line.kind === 'same')).toBe(false);
  });
});

describe('changedHunks', () => {
  it('groups the changed lines with two lines of context, and merges groups that touch', () => {
    const before = Array.from({ length: 20 }, (_, index) => `line ${index}`);
    const after = [...before];
    after[3] = 'changed 3';
    after[5] = 'changed 5';
    after[17] = 'changed 17';
    const hunks = changedHunks(diffLines(before.join('\n'), after.join('\n')));
    expect(hunks).toHaveLength(2);
    expect(kinds(hunks[0]!)).toEqual([' line 1', ' line 2', '-line 3', '+changed 3', ' line 4', '-line 5', '+changed 5', ' line 6', ' line 7']);
    expect(kinds(hunks[1]!)).toEqual([' line 15', ' line 16', '-line 17', '+changed 17', ' line 18', ' line 19']);
  });

  it('has no hunk for texts that are the same', () => {
    expect(changedHunks(diffLines('a\nb', 'a\nb'))).toEqual([]);
  });
});

describe('describeMigration of a version 1 project', () => {
  const v1 = {
    name: 'Legacy', version: '1.0.0',
    tasks: [{ name: 'Main', type: 'CYCLIC', interval: 20, priority: 2, file: 'main.st', watchdog_ms: 100 }],
  };
  const text = `${JSON.stringify(v1, null, 2)}\n`;

  it('shows the lines Save would change in zplc.json, the removed legacy fields and the added ones', () => {
    const migrated = parseAndMigrateProject(JSON.parse(text));
    if (!migrated.ok) throw new Error('the legacy project must migrate');
    const difference = describeMigration(text, migrated.project);
    expect(difference.file).toBe('zplc.json');
    expect(difference.changed).toBe(true);
    const flat = difference.hunks.flat().map((line) => `${line.kind === 'removed' ? '-' : line.kind === 'added' ? '+' : ' '}${line.text.trim()}`);
    expect(flat).toContain('+"schemaVersion": 2');
    expect(flat).toContain('-"type": "CYCLIC",');
    expect(flat).toContain('+"trigger": "cyclic",');
    expect(flat).toContain('-"interval": 20,');
    expect(flat).toContain('+"interval_ms": 20,');
    expect(flat).toContain('-"file": "main.st",');
    expect(flat).toContain('-"watchdog_ms": 100');
    expect(difference.removed).toBeGreaterThan(0);
    expect(difference.added).toBeGreaterThan(0);
  });

  it('is not a change for a project that is already version 2 and already as Save writes it', () => {
    const v2 = parseAndMigrateProject(JSON.parse(text));
    if (!v2.ok) throw new Error('unreachable');
    const saved = JSON.stringify(v2.project, null, 2);
    const difference = describeMigration(saved, v2.project);
    expect(difference).toEqual({ file: 'zplc.json', changed: false, removed: 0, added: 0, hunks: [] });
  });
});
