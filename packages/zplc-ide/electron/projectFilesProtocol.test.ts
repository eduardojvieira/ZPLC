import { describe, expect, it } from 'bun:test';

import {
  PROJECT_FILES_CHANNEL,
  PROJECT_FILES_LIMITS,
  PROJECT_FILES_OPS,
  parseProjectFilesRequest,
} from './projectFilesProtocol';

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
    expect(Object.keys(PROJECT_FILES_CHANNEL).sort()).toEqual(['chooseFolder', ...PROJECT_FILES_OPS].sort());
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
