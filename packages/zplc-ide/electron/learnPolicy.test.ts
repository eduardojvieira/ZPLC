import { afterEach, describe, expect, it } from 'bun:test';
import { chmod, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { createAppSettingsStore, mirrorLearnPolicy } from '../src/store/useAppSettings';
import { LEARN_POLICY_FILENAME, createLearnPolicyStore, parseLearnPolicy, readLearnPolicy, readSolutionsHidden } from './learnPolicy';

const directories: string[] = [];
const scratch = async (): Promise<string> => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'zplc-learn-policy-'));
  directories.push(directory);
  return directory;
};
afterEach(async () => {
  await Promise.all(directories.map((directory) => chmod(directory, 0o700).catch(() => undefined)));
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

const memory = () => {
  const data: Record<string, string> = {};
  return { getItem: (key: string) => data[key] ?? null, setItem: (key: string, value: string) => void (data[key] = value) };
};

describe('the classroom setting the main process holds (AIX-002, D-32)', () => {
  it('accepts exactly one boolean, nothing more', () => {
    expect(parseLearnPolicy({ hideSolutions: true })).toEqual({ hideSolutions: true });
    expect(parseLearnPolicy({ hideSolutions: false })).toEqual({ hideSolutions: false });
    expect(parseLearnPolicy({ hideSolutions: 'false' })).toBeNull();
    expect(parseLearnPolicy({ hideSolutions: false, solutionsHidden: false })).toBeNull();
    expect(parseLearnPolicy([false])).toBeNull();
    expect(parseLearnPolicy(null)).toBeNull();
  });

  it('reads anything it cannot trust as solutions hidden: missing, corrupt, oversized or foreign', () => {
    expect(readLearnPolicy('{"hideSolutions":false}')).toEqual({ hideSolutions: false });
    expect(readLearnPolicy('')).toEqual({ hideSolutions: true });
    expect(readLearnPolicy('{not json')).toEqual({ hideSolutions: true });
    expect(readLearnPolicy('{"hideSolutions":"no"}')).toEqual({ hideSolutions: true });
    expect(readLearnPolicy(`{"hideSolutions":false,"pad":"${'x'.repeat(2000)}"}`)).toEqual({ hideSolutions: true });
  });

  it('without a user-data folder, or before Studio has written one, solutions are hidden', async () => {
    expect(await readSolutionsHidden(undefined)).toBe(true);
    expect(await readSolutionsHidden(await scratch())).toBe(true);
  });

  it('writes the setting atomically into <userData>, private, and leaves no temporary file', async () => {
    const userData = await scratch();
    const store = createLearnPolicyStore(userData);
    await store.save({ hideSolutions: false });
    await store.settled();
    expect(JSON.parse(await readFile(path.join(userData, LEARN_POLICY_FILENAME), 'utf8'))).toEqual({ hideSolutions: false });
    expect(await readdir(userData)).toEqual([LEARN_POLICY_FILENAME]);
    expect(await readSolutionsHidden(userData)).toBe(false);
  });

  it('a renderer-side change cannot turn solutions back on: the main process answers from <userData> only', async () => {
    const userData = await scratch();
    const policy = createLearnPolicyStore(userData);
    const settings = createAppSettingsStore(memory());
    const reported: unknown[] = [];
    // The settings mirror is the one way the setting reaches the main process (the channel is wired in AIX-U10).
    const stop = mirrorLearnPolicy(settings, (next) => {
      reported.push(next);
      const parsed = parseLearnPolicy(next);
      if (parsed) void policy.save(parsed).catch(() => undefined);
    });
    settings.getState().update({ hideSolutions: true });
    await policy.settled();
    expect(await policy.solutionsHidden()).toBe(true);
    stop();

    // The page edits its own copy, its storage, or sends a forged report: none of it is the main process's file.
    settings.getState().update({ hideSolutions: false });
    expect(settings.getState().settings.hideSolutions).toBe(false);
    expect(parseLearnPolicy({ hideSolutions: false, lessonId: 'x' })).toBeNull();
    await policy.settled();
    expect(await policy.solutionsHidden()).toBe(true);
    expect(await readSolutionsHidden(userData)).toBe(true);

    // A file that is damaged by anyone falls back to hidden, never to shown.
    await writeFile(path.join(userData, LEARN_POLICY_FILENAME), '{"hideSolutions":0}');
    expect(await policy.solutionsHidden()).toBe(true);
    expect(reported).toEqual([{ hideSolutions: false }, { hideSolutions: true }]);
  });

  it('a failed save that hides solutions removes the old policy, so the file reads as hidden, and reports the failure', async () => {
    const userData = await scratch();
    const failingWrite = (async () => {
      throw new Error('ENOSPC: no space left on device');
    }) as unknown as typeof writeFile;
    const store = createLearnPolicyStore(userData, { writeFile: failingWrite });
    await writeFile(path.join(userData, LEARN_POLICY_FILENAME), '{"hideSolutions":false}');
    expect(await store.solutionsHidden()).toBe(false);
    await expect(store.save({ hideSolutions: true })).rejects.toThrow('ENOSPC');
    expect(await readdir(userData)).toEqual([]);
    expect(await readSolutionsHidden(userData)).toBe(true);
    expect(await store.solutionsHidden()).toBe(true);
  });

  it('when the old policy cannot be removed either, the process holds solutions hidden in memory and reports it', async () => {
    const userData = await scratch();
    const store = createLearnPolicyStore(userData);
    await store.save({ hideSolutions: false });
    // A read-only folder: neither the new file nor the removal of the old one can be written.
    await chmod(userData, 0o500);
    await expect(store.save({ hideSolutions: true })).rejects.toThrow();
    expect(await readSolutionsHidden(userData)).toBe(false);
    expect(await store.solutionsHidden()).toBe(true);
    // The hold in memory ends only when a later save succeeds.
    await chmod(userData, 0o700);
    await store.save({ hideSolutions: false });
    expect(await store.solutionsHidden()).toBe(false);
  });
});
