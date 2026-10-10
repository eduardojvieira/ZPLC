/**
 * What the user is shown about an archive before anything is written (IDE-022): whose project it is, whether Studio
 * can open it, and, for a version 1 project, the difference that migrating it makes.
 */
import { describe, expect, it } from 'bun:test';

import type { ArchiveSummary } from '../../electron/projectArchiveProtocol';
import { reviewArchive } from './archiveReview';

const summary = (manifest: string | null, files: string[] = ['zplc.json', 'src/Main.st']): ArchiveSummary => ({
  archiveId: 'a1', fileName: 'motor.zplc.zip', fileCount: files.length, folderCount: 1, bytes: 2048,
  files: files.map((path) => ({ path, size: 10 })), manifest,
});
const v2 = (extra: Record<string, unknown> = {}) => JSON.stringify({ schemaVersion: 2, name: 'Motor', version: '1.2.0', tasks: [{ name: 'Main', trigger: 'cyclic', interval_ms: 10, priority: 1, programs: ['Main.st'] }], ...extra }, null, 2);

describe('reviewArchive (IDE-022)', () => {
  it('names the project of a version 2 archive, with nothing to migrate', () => {
    const review = reviewArchive(summary(v2()));
    expect(review).toMatchObject({ openable: true, name: 'Motor', version: '1.2.0', schemaVersion: 2, difference: null, problem: null });
  });

  it('shows the lines that migrating a version 1 archive changes, and says the files stay as they are until Save', () => {
    const legacy = JSON.stringify({ name: 'Legacy', version: '1.0.0', tasks: [{ name: 'Main', type: 'CYCLIC', interval: 20, priority: 2, file: 'main.st' }] }, null, 2);
    const review = reviewArchive(summary(legacy));
    expect(review.openable).toBe(true);
    expect(review.schemaVersion).toBe(1);
    expect(review.difference?.changed).toBe(true);
    expect(review.difference?.hunks.flat().some((line) => line.kind === 'added' && line.text.includes('"schemaVersion": 2'))).toBe(true);
  });

  it('is not openable without a zplc.json at the root, and says so', () => {
    const review = reviewArchive(summary(null, ['src/Main.st']));
    expect(review.openable).toBe(false);
    expect(review.problem).toContain('zplc.json');
  });

  it('is not openable when zplc.json is not a project Studio opens, with the first reason Studio gives', () => {
    expect(reviewArchive(summary('{ not json')).openable).toBe(false);
    const sensitive = reviewArchive(summary(v2({ network: { wifi: { password: 'secret' } } })));
    expect(sensitive.openable).toBe(false);
    expect(sensitive.problem).toContain('network.wifi.password');
    expect(sensitive.problem).not.toContain('secret');
    const empty = reviewArchive(summary(JSON.stringify({ schemaVersion: 2, name: '', version: '1.0.0', tasks: [] })));
    expect(empty.openable).toBe(false);
  });

  it('sums what the archive holds', () => {
    const review = reviewArchive(summary(v2(), ['zplc.json', 'src/a.st', 'src/b.st']));
    expect(review).toMatchObject({ fileCount: 3, folderCount: 1 });
  });
});
