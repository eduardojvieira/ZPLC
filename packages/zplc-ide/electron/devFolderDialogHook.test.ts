import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { readFolderDialogHook } from './devFolderDialogHook';

let sandbox: string;
let root: string;

beforeEach(() => {
  sandbox = mkdtempSync(path.join(tmpdir(), 'zplc-dev-folder-hook-'));
  root = path.join(sandbox, 'project');
});

afterEach(() => rmSync(sandbox, { recursive: true, force: true }));

describe('test hook for the native dialog', () => {
  const env = (answerFile: string | undefined) => ({ ZPLC_SMOKE_FOLDER_ANSWER_FILE: answerFile });

  it('is inert in a packaged build, whatever the environment says', () => {
    const file = path.join(sandbox, 'answer.txt');
    writeFileSync(file, root);
    expect(readFolderDialogHook(true, env(file))).toBeUndefined();
  });

  it('is absent without the variable', () => {
    expect(readFolderDialogHook(false, {})).toBeUndefined();
    expect(readFolderDialogHook(false, env(''))).toBeUndefined();
  });

  it('answers with the trimmed path in the file, or with a cancel when the file is empty or unreadable', () => {
    const file = path.join(sandbox, 'answer.txt');
    writeFileSync(file, `${root}\n`);
    expect(readFolderDialogHook(false, env(file))).toBe(root);
    writeFileSync(file, '  \n');
    expect(readFolderDialogHook(false, env(file))).toBeNull();
    expect(readFolderDialogHook(false, env(path.join(sandbox, 'absent.txt')))).toBeNull();
  });
});
