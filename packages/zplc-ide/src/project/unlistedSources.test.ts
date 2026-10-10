/**
 * The files no build reads (CMP-046), found by one walk that the Tool API runs on disk and Studio runs on its project
 * tree (IDE-023): the walk is checked here on an in-memory listing.
 */
import { describe, expect, it } from 'bun:test';

import { scanUnlistedSources, UNLISTED_SCAN_FILES, UNLISTED_SCAN_FOLDERS, type ScanEntry } from './unlistedSources';

type Folder = Record<string, ScanEntry['kind']>;
const listing = (disk: Record<string, Folder>) => async (logical: string): Promise<ScanEntry[] | null> => {
  const folder = disk[logical];
  return folder === undefined ? null : Object.entries(folder).map(([name, kind]) => ({ name, kind }));
};

describe('scanUnlistedSources (IDE-023)', () => {
  it('finds Structured Text files outside src and the listed folders, and leaves the others', async () => {
    const disk = {
      '': { 'zplc.json': 'file', src: 'directory', lib: 'directory', docs: 'directory', 'Stray.st': 'file', 'notes.txt': 'file' },
      src: { 'Main.st': 'file' },
      lib: { 'Debounce.st': 'file' },
      docs: { 'Example.st': 'file', 'readme.md': 'file', deep: 'directory' },
      'docs/deep': { 'Deeper.st': 'file', deeper: 'directory' },
      'docs/deep/deeper': { 'TooDeep.st': 'file' },
    } satisfies Record<string, Folder>;
    expect(await scanUnlistedSources(listing(disk), ['src', 'lib'])).toEqual(['Stray.st', 'docs/Example.st', 'docs/deep/Deeper.st']);
  });

  it('does not report the files of a listed folder, and does not enter it', async () => {
    const disk = {
      '': { vendor: 'directory' },
      vendor: { 'A.st': 'file', acme: 'directory' },
      'vendor/acme': { 'B.st': 'file' },
    } satisfies Record<string, Folder>;
    expect(await scanUnlistedSources(listing(disk), ['src', 'vendor'])).toEqual([]);
    expect(await scanUnlistedSources(listing(disk), ['src', 'vendor/acme'])).toEqual(['vendor/A.st']);
    expect(await scanUnlistedSources(listing(disk), ['src'])).toEqual(['vendor/A.st', 'vendor/acme/B.st']);
  });

  it('skips the folders of the project at the top, names that start with a dot, and links, and compares names without case', async () => {
    const disk = {
      '': { tests: 'directory', build: 'directory', node_modules: 'directory', '.git': 'directory', '.Hidden.st': 'file', 'Link.st': 'link', Lib: 'directory', area: 'directory' },
      tests: { 'S.st': 'file' }, build: { 'B.st': 'file' }, node_modules: { 'N.st': 'file' }, '.git': { 'G.st': 'file' },
      Lib: { 'L.st': 'file' },
      area: { build: 'directory', 'UPPER.ST': 'file' },
      'area/build': { 'Nested.st': 'file' },
    } satisfies Record<string, Folder>;
    expect(await scanUnlistedSources(listing(disk), ['src', 'lib'])).toEqual(['area/UPPER.ST', 'area/build/Nested.st']);
  });

  it('treats a folder it cannot list as empty', async () => {
    expect(await scanUnlistedSources(async () => null, ['src'])).toEqual([]);
  });

  it('is bounded: at most 64 folders and 256 files are looked at', async () => {
    const wide: Folder = {};
    for (let index = 0; index < 100; index += 1) wide[`folder${String(index).padStart(3, '0')}`] = 'directory';
    const disk: Record<string, Folder> = { '': wide };
    let listed = 0;
    const counting = async (logical: string): Promise<ScanEntry[] | null> => { listed += 1; return disk[logical] === undefined ? [] : listing(disk)(logical); };
    await scanUnlistedSources(counting, ['src']);
    expect(listed).toBeLessThanOrEqual(UNLISTED_SCAN_FOLDERS);

    const files: Folder = {};
    for (let index = 0; index < 400; index += 1) files[`F${String(index).padStart(3, '0')}.st`] = 'file';
    expect(await scanUnlistedSources(listing({ '': files }), ['src'])).toHaveLength(UNLISTED_SCAN_FILES);
  });
});
