import { describe, expect, it } from 'bun:test';
import type { FileTreeNode, ProjectFileWithHandle, ZPLCProjectConfig } from '../types';
import { entryProgramPath, entryTabs } from './entryProgram';

const config = (...tasks: string[][]): ZPLCProjectConfig =>
  ({
    name: 'p',
    version: '1',
    tasks: tasks.map((programs, index) => ({ name: `T${index}`, trigger: 'cyclic', priority: 1, programs })),
  }) as ZPLCProjectConfig;

const file = (path: string): FileTreeNode => ({ id: `file:${path}`, name: path.split('/').pop()!, path, type: 'file' }) as FileTreeNode;
const tree = (...paths: string[]): FileTreeNode =>
  ({ id: 'dir:/', name: 'p', path: '', type: 'directory', children: paths.map(file) }) as FileTreeNode;
const loaded = (path: string) => Promise.resolve({ id: `file:${path}`, path } as ProjectFileWithHandle);

describe('the entry program (SHL-014)', () => {
  it('SHL-014 the entry program is the first program of the first task', () => {
    const files = ['src/b.st', 'src/a.st'];
    expect(entryProgramPath(config(['a.st', 'b.st'], ['b.st']), files)).toBe('src/a.st');
    expect(entryProgramPath(config(['A.ST']), files)).toBe('src/a.st');
  });

  it('SHL-014 a graphical program is found by the name the task gives it', () => {
    expect(entryProgramPath(config(['main.ld']), ['src/main.ld.json'])).toBe('src/main.ld.json');
  });

  it('a project with no task has none', () => {
    expect(entryProgramPath(config(), ['src/a.st'])).toBeNull();
    expect(entryProgramPath(null, ['src/a.st'])).toBeNull();
  });

  it('a program the task names that is not on disk is skipped', () => {
    expect(entryProgramPath(config(['gone.st', 'b.st']), ['src/b.st'])).toBe('src/b.st');
    expect(entryProgramPath(config(['gone.st']), ['src/b.st'])).toBeNull();
  });

  it('SHL-014 a project with no saved session opens the entry program as its only tab', async () => {
    const result = await entryTabs(false, config(['a.st']), tree('src/a.st'), loaded);
    expect(result?.openTabs).toEqual(['file:src/a.st']);
    expect(result?.activeFileId).toBe('file:src/a.st');
    expect([...result!.files.keys()]).toEqual(['file:src/a.st']);
  });

  it('SHL-014 a restored session is never replaced, even one with no tabs', async () => {
    let reads = 0;
    const result = await entryTabs(true, config(['a.st']), tree('src/a.st'), (path) => (reads++, loaded(path)));
    expect(result).toBeNull();
    expect(reads).toBe(0);
  });

  it('SHL-014 a file that cannot be read is no tab', async () => {
    expect(await entryTabs(false, config(['a.st']), tree('src/a.st'), () => Promise.reject(new Error('x')))).toBeNull();
  });
});
