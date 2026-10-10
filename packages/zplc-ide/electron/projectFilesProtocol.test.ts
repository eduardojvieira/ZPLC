import { describe, expect, it } from 'bun:test';

import {
  PROJECT_FILES_CHANNEL,
  PROJECT_FILES_LIMITS,
  PROJECT_FILES_OPS,
  PROJECT_RECENT_OPS,
  parseProjectFilesRequest,
  parseRecentRequest, PROJECT_WATCH_OPS, parseProjectChange, parseWatchRequest } from './projectFilesProtocol';

const ROOT = { rootId: 'root-1' };
const VALID: Record<string, unknown> = {
  list: { ...ROOT, path: 'src' },
  stat: { ...ROOT, path: 'src/main.st' },
  read: { ...ROOT, path: 'src/main.st' },
  write: { ...ROOT, path: 'src/main.st', bytes: new Uint8Array([1, 2, 3]) },
  mkdir: { ...ROOT, path: 'src/new' },
  remove: { ...ROOT, path: 'src/old.st', recursive: false },
  rename: { ...ROOT, from: 'a.st', to: 'b.st' },
};

describe('project files message schema', () => {
  it('names every channel once, in one namespace', () => {
    const channels = Object.values(PROJECT_FILES_CHANNEL);
    expect(new Set(channels).size).toBe(channels.length);
    expect(channels.every((channel) => channel.startsWith('project-files:'))).toBe(true);
    expect(Object.keys(PROJECT_FILES_CHANNEL).sort()).toEqual(['chooseFolder', ...PROJECT_FILES_OPS, ...PROJECT_RECENT_OPS, ...PROJECT_WATCH_OPS].sort());
  });

  it('accepts exactly one well-formed request object per operation', () => {
    for (const op of PROJECT_FILES_OPS) {
      expect(parseProjectFilesRequest(op, [VALID[op]])).toEqual(VALID[op] as never);
    }
  });

  it('rejects a missing, doubled, array or non-plain argument', () => {
    for (const op of PROJECT_FILES_OPS) {
      expect(parseProjectFilesRequest(op, [])).toBeNull();
      expect(parseProjectFilesRequest(op, [VALID[op], VALID[op]])).toBeNull();
      expect(parseProjectFilesRequest(op, [[VALID[op]]])).toBeNull();
      expect(parseProjectFilesRequest(op, ['src'])).toBeNull();
      expect(parseProjectFilesRequest(op, [null])).toBeNull();
      expect(parseProjectFilesRequest(op, [new Map(Object.entries(VALID[op] as object))])).toBeNull();
    }
  });

  it('rejects unknown, missing and wrongly typed fields', () => {
    for (const op of PROJECT_FILES_OPS) {
      const valid = VALID[op] as Record<string, unknown>;
      expect(parseProjectFilesRequest(op, [{ ...valid, root: '/' }])).toBeNull();
      for (const key of Object.keys(valid)) {
        const { [key]: _omitted, ...without } = valid;
        void _omitted;
        expect(parseProjectFilesRequest(op, [without])).toBeNull();
        expect(parseProjectFilesRequest(op, [{ ...valid, [key]: 42 }])).toBeNull();
        expect(parseProjectFilesRequest(op, [{ ...valid, [key]: undefined }])).toBeNull();
      }
    }
  });

  it('accepts bytes only as a Uint8Array', () => {
    const write = VALID.write as Record<string, unknown>;
    for (const bytes of ['text', [1, 2], new ArrayBuffer(2), new Uint16Array(2), { length: 1 }]) {
      expect(parseProjectFilesRequest('write', [{ ...write, bytes }])).toBeNull();
    }
    expect(parseProjectFilesRequest('write', [{ ...write, bytes: Buffer.from('abc') }])).not.toBeNull();
  });

  it('bounds identifiers and paths', () => {
    const list = VALID.list as Record<string, unknown>;
    expect(parseProjectFilesRequest('list', [{ ...list, rootId: '' }])).toBeNull();
    expect(parseProjectFilesRequest('list', [{ ...list, rootId: 'x'.repeat(65) }])).toBeNull();
    expect(parseProjectFilesRequest('list', [{ ...list, path: 'x'.repeat(PROJECT_FILES_LIMITS.maxPathChars) }])).not.toBeNull();
    expect(parseProjectFilesRequest('list', [{ ...list, path: 'x'.repeat(PROJECT_FILES_LIMITS.maxPathChars + 1) }])).toBeNull();
    expect(parseProjectFilesRequest('list', [{ ...list, path: '' }])).not.toBeNull();
  });

  it('does not recognise an unknown operation', () => {
    expect(parseProjectFilesRequest('chooseFolder', [])).toBeNull();
    expect(parseProjectFilesRequest('exec', [VALID.list])).toBeNull();
    expect(parseProjectFilesRequest('__proto__', [VALID.list])).toBeNull();
  });
});

const RECENT_VALID: Record<string, unknown> = {
  openRecent: { recentId: 'a'.repeat(64) },
  forgetRecent: { recentId: 'a'.repeat(64) },
  markOpened: { rootId: 'root-1' },
};

describe('recent project message schema (IDE-008)', () => {
  it('names the four recent operations in the same namespace and takes no argument for the list', () => {
    expect([...PROJECT_RECENT_OPS]).toEqual(['listRecent', 'openRecent', 'forgetRecent', 'markOpened']);
    expect(PROJECT_FILES_CHANNEL.listRecent).toBe('project-files:list-recent');
    expect(parseRecentRequest('listRecent', [])).toBeNull(); // it has no request object: the handler checks for zero arguments
  });

  it('accepts exactly one well-formed request object per operation that has one', () => {
    for (const op of ['openRecent', 'forgetRecent', 'markOpened']) {
      expect(parseRecentRequest(op, [RECENT_VALID[op]])).toEqual(RECENT_VALID[op] as never);
    }
  });

  it('rejects a missing, doubled, array, non-plain, extra, missing or wrongly typed field, and a path where an id belongs', () => {
    for (const op of ['openRecent', 'forgetRecent', 'markOpened']) {
      const valid = RECENT_VALID[op] as Record<string, unknown>;
      const key = Object.keys(valid)[0]!;
      expect(parseRecentRequest(op, [])).toBeNull();
      expect(parseRecentRequest(op, [valid, valid])).toBeNull();
      expect(parseRecentRequest(op, [[valid]])).toBeNull();
      expect(parseRecentRequest(op, ['x'])).toBeNull();
      expect(parseRecentRequest(op, [null])).toBeNull();
      expect(parseRecentRequest(op, [new Map(Object.entries(valid))])).toBeNull();
      expect(parseRecentRequest(op, [{ ...valid, path: '/home/ana/plant' }])).toBeNull();
      expect(parseRecentRequest(op, [{}])).toBeNull();
      expect(parseRecentRequest(op, [{ ...valid, [key]: 42 }])).toBeNull();
      expect(parseRecentRequest(op, [{ ...valid, [key]: '' }])).toBeNull();
      expect(parseRecentRequest(op, [{ ...valid, [key]: 'x'.repeat(PROJECT_FILES_LIMITS.maxRootIdChars + 1) }])).toBeNull();
    }
  });

  it('does not recognise a file operation or an unknown name', () => {
    expect(parseRecentRequest('list', [{ rootId: 'root-1', path: '' }])).toBeNull();
    expect(parseRecentRequest('chooseFolder', [])).toBeNull();
    expect(parseRecentRequest('__proto__', [RECENT_VALID.openRecent])).toBeNull();
    expect(parseProjectFilesRequest('openRecent', [RECENT_VALID.openRecent])).toBeNull();
  });
});

describe('watching the folder for changes made outside Studio (IDE-004)', () => {
  it('takes exactly the id of the window folder', () => {
    expect(parseWatchRequest([{ rootId: 'r' }])).toEqual({ rootId: 'r' });
    for (const bad of [[], [{}], [{ rootId: '' }], [{ rootId: 'r', path: '.' }], ['r'], [{ rootId: 'r' }, 1]]) expect(parseWatchRequest(bad)).toBeNull();
  });

  it('accepts a change batch of relative paths, and nothing else', () => {
    expect(parseProjectChange({ rootId: 'r', paths: ['src/Motor.st'], overflow: false })).toEqual({ rootId: 'r', paths: ['src/Motor.st'], overflow: false });
    expect(parseProjectChange({ rootId: 'r', paths: [], overflow: true })).not.toBeNull();
    for (const bad of [null, {}, { rootId: 'r', paths: 'x', overflow: false }, { rootId: 'r', paths: [1], overflow: false }, { rootId: 'r', paths: [], overflow: false, extra: 1 }, { rootId: 'r', paths: Array.from({ length: 300 }, () => 'a'), overflow: false }]) {
      expect(parseProjectChange(bad)).toBeNull();
    }
  });
});
