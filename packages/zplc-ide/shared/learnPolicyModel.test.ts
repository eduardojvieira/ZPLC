// AIX-002, D-32: the one reader of the classroom setting, used by Studio's main process and by zplc-mcp --user-data. It
// answers "shown" only for a regular, unlinked, small file that holds exactly { "hideSolutions": false }.
import { afterEach, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { LEARN_POLICY_FILENAME, LEARN_POLICY_MAX_BYTES, readSolutionsHidden } from './learnPolicyModel';

const temporary: string[] = [];
afterEach(async () => {
  await Promise.all(temporary.splice(0).map((folder) => rm(folder, { recursive: true, force: true })));
});

async function folderWith(policy?: string): Promise<string> {
  const folder = await mkdtemp(path.join(tmpdir(), 'zplc-policy-'));
  temporary.push(folder);
  if (policy !== undefined) await writeFile(path.join(folder, LEARN_POLICY_FILENAME), policy);
  return folder;
}

describe('AIX-002 readSolutionsHidden fails closed for every kind of policy file', () => {
  test('only exactly { hideSolutions: false } shows the solutions', async () => {
    const cases: Array<[string | undefined, boolean]> = [
      [undefined, true],
      ['', true],
      ['{', true],
      ['[]', true],
      ['null', true],
      [JSON.stringify({ hideSolutions: true }), true],
      [JSON.stringify({ hideSolutions: false }), false],
      [JSON.stringify({ hideSolutions: 'false' }), true],
      [JSON.stringify({ hideSolutions: false, other: 1 }), true],
      [JSON.stringify({ hideSolutions: false, pad: 'x'.repeat(2000) }), true],
      [` ${JSON.stringify({ hideSolutions: false })}\n`, false],
    ];
    for (const [policy, hidden] of cases) expect(await readSolutionsHidden(await folderWith(policy)), String(policy)).toBe(hidden);
  });

  test('a file over LEARN_POLICY_MAX_BYTES, a linked file, a folder in its place, and no user-data folder all read as hidden', async () => {
    expect(LEARN_POLICY_MAX_BYTES).toBe(1024);
    const shown = JSON.stringify({ hideSolutions: false });
    expect(await readSolutionsHidden(await folderWith(shown + ' '.repeat(LEARN_POLICY_MAX_BYTES)))).toBe(true);

    const target = await folderWith(shown);
    const linked = await folderWith();
    await symlink(path.join(target, LEARN_POLICY_FILENAME), path.join(linked, LEARN_POLICY_FILENAME));
    expect(await readSolutionsHidden(linked)).toBe(true);

    const withFolder = await folderWith();
    await mkdir(path.join(withFolder, LEARN_POLICY_FILENAME));
    expect(await readSolutionsHidden(withFolder)).toBe(true);

    expect(await readSolutionsHidden(undefined)).toBe(true);
    expect(await readSolutionsHidden(path.join(tmpdir(), 'zplc-no-such-user-data'))).toBe(true);
  });
});
