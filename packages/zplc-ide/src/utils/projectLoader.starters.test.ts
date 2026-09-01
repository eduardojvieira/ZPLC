import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'bun:test';

describe('bundled educational starters', () => {
  it('keeps _starter projects loadable by id but out of Welcome discovery', () => {
    const source = readFileSync(join(import.meta.dir, 'projectLoader.ts'), 'utf8');
    expect(source).toContain("folderId.endsWith('_starter')");
    expect(source).toContain('const configPath = `/projects/${projectId}/zplc.json`;');
  });
});
